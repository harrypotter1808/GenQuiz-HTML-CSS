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

    prompt = f"""You are the backend brain of an aptitude quiz application called GenQuiz.
Your job is to generate highly dynamic, real-world aptitude test questions. These should be modeled after actual corporate placement exams (like TCS, Infosys, Amazon, etc.) and standard competitive assessments.
The questions must test practical problem-solving, critical thinking, and real-world application of concepts covering the requested sections: {sections_str}.

Difficulty level requested: {difficulty}
Please generate EXACTLY {count_per_section} questions for EACH requested section.

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
                    "content": "You are a JSON-only API. You must return only valid JSON."
                },
                {
                    "role": "user",
                    "content": prompt + file_content,
                }
            ],
            model="llama-3.1-8b-instant",
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
