import json
import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from groq import Groq
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# Read the API key from the environment
api_key = os.environ.get("GROQ_API_KEY")

if not api_key:
    raise ValueError("GROQ_API_KEY environment variable not set. Please check your .env file.")
client = Groq(api_key=api_key)

app = FastAPI(title="GenQuiz Unified API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/generate-quiz")
async def generate_quiz(
    sections: str = Form(...),
    count_per_section: int = Form(...),
    difficulty: str = Form(...),
    file: Optional[UploadFile] = File(None)
):
    section_list = json.loads(sections)
    
    file_bytes = b""
    mime_type = ""
    if file:
        file_bytes = await file.read()
        mime_type = file.content_type

    sections_str = ", ".join(section_list)

    total_requested = count_per_section
    num_sections = len(section_list)
    base_count = total_requested // num_sections
    remainder = total_requested % num_sections

    section_counts = {}
    for i, sec in enumerate(section_list):
        section_counts[sec] = base_count + (1 if i < remainder else 0)
        
    allocation_str = "\n".join([f"- {sec}: Generate EXACTLY {count} questions" for sec, count in section_counts.items()])

    prompt = f"""You are the backend brain of a TECHNICAL CODING assessment platform called GenQuiz.
Your ONLY job is to generate highly technical, programming-focused test questions. These must be modeled after technical rounds for software engineering roles at top tech companies.

CRITICAL INSTRUCTION: EVERY SINGLE QUESTION MUST BE ABOUT PROGRAMMING.
- Focus exclusively on: Python, Java, C++, JavaScript, Data Structures, Algorithms, Time Complexity, Debugging, SQL, and System Design.
- If the section is "logical", make it about tracing code execution, finding bugs, or algorithmic logic.
- If the section is "quant", make it about calculating time/space complexity, array indices, or binary/hexadecimal math.
- DO NOT generate generic aptitude questions about trains, ages, or snails.

Difficulty level requested: {difficulty}

Here is your STRICT quota allocation for this request. You MUST generate exactly this many questions per section, no more, no less:
{allocation_str}

If a file/image (like a syllabus) is attached alongside this prompt, USE IT. Base the questions deeply on the topics and difficulty indicated in that uploaded document.

You MUST respond with ONLY a valid JSON object in EXACTLY this structure - no markdown, no backticks:
{{
  "{section_list[0] if len(section_list) > 0 else 'english'}": [
    {{
      "q": "Question text here?",
      "opts": ["Option A", "Option B", "Option C", "Option D"],
      "ans": 1,
      "exp": "Brief explanation of the correct answer.",
      "section": "{section_list[0] if len(section_list) > 0 else 'english'}"
    }}
  ]
}}
Include ALL these sections in the root object: {sections_str}.
Rules you must follow strictly:
- "ans" is the ZERO-BASED index of the correct answer in "opts"
- All 4 options must be plausible, only one correct
- "exp" must be concise (1-2 sentences max)
- Questions must match the requested difficulty: {difficulty}
- Never repeat questions across calls
- JSON MUST BE STRICTLY FORMATTED!
"""

    try:
        file_content = ""
        if file and mime_type:
            try:
                file_content = "\n\n[Attached Syllabus Content:]\n" + file_bytes.decode('utf-8')
            except:
                file_content = "\n\n[An unreadable file was attached. Please rely on the topic names instead.]"
                
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a JSON-only API. You must return only valid JSON. Ensure that the value for each section key is a DIRECT ARRAY of objects (e.g. \"english\": [ {...} ]), DO NOT wrap the array in another object."
                },
                {
                    "role": "user",
                    "content": prompt + file_content,
                }
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
        )
        
        output_text = chat_completion.choices[0].message.content.strip()
        if output_text.startswith("```json"):
            output_text = output_text[7:]
        elif output_text.startswith("```"):
            output_text = output_text[3:]
        if output_text.endswith("```"):
            output_text = output_text[:-3]
        quiz_data = json.loads(output_text.strip())
        return quiz_data

    except Exception as e:
        error_msg = str(e)
        print(f"Error generating quiz: {error_msg}")
        return {"error": error_msg}

# --- STATIC FILE SERVING FOR FRONTEND ---
@app.get("/")
def serve_index():
    return FileResponse("index.html")

@app.get("/app.js")
def serve_app():
    return FileResponse("app.js")

@app.get("/style.css")
def serve_style():
    return FileResponse("style.css")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
