const API_URL = '/api/generate-quiz';

const app = {
  // State
  gameState: 'landing', // 'landing', 'aptitude', 'syllabus', 'quiz', 'result'
  quizData: [],
  currentIndex: 0,
  score: 0,
  userAnswers: [],
  history: [],
  selectedFile: null,
  radarChartInstance: null,
  lineChartInstance: null,

  init() {
    this.loadHistory();
    this.setupListeners();
    this.navigate('landing');
  },

  loadHistory() {
    const saved = localStorage.getItem('genquiz_history');
    if (saved) {
      try {
        this.history = JSON.parse(saved);
      } catch(e) {
        this.history = [];
      }
    }
  },

  saveHistory(finalScore, total) {
    const newRecord = { date: new Date().toISOString(), score: finalScore, total };
    this.history.push(newRecord);
    localStorage.setItem('genquiz_history', JSON.stringify(this.history));
  },

  setupListeners() {
    document.getElementById('file-input').addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.selectedFile = e.target.files[0];
        const disp = document.getElementById('file-name-display');
        disp.textContent = `Attached: ${this.selectedFile.name}`;
        disp.style.display = 'block';
      }
    });
  },

  // View Management
  navigate(view) {
    this.gameState = view;
    // Hide all views
    document.getElementById('landing-view').style.display = 'none';
    document.getElementById('quiz-hub-view').style.display = 'none';
    document.getElementById('active-quiz-view').style.display = 'none';
    document.getElementById('result-view').style.display = 'none';

    if (view === 'landing') {
      document.getElementById('landing-view').style.display = 'block';
      this.quizData = [];
    } else if (view === 'syllabus' || view === 'aptitude') {
      this.setupHub(view);
      document.getElementById('quiz-hub-view').style.display = 'block';
      // Reset errors/files
      document.getElementById('hub-error').style.display = 'none';
      if(view === 'aptitude') {
        this.selectedFile = null;
        document.getElementById('file-input').value = '';
        document.getElementById('file-name-display').style.display = 'none';
      }
    } else if (view === 'quiz') {
      document.getElementById('active-quiz-view').style.display = 'block';
      this.startQuiz();
    } else if (view === 'result') {
      document.getElementById('result-view').style.display = 'block';
      this.renderResults();
    }
  },

  setupHub(mode) {
    const title = mode === 'syllabus' ? 'Generate from Syllabus' : 'Aptitude Test Generation';
    document.getElementById('hub-title').textContent = title;
    
    if (mode === 'syllabus') {
      document.getElementById('syllabus-uploader').style.display = 'block';
    } else {
      document.getElementById('syllabus-uploader').style.display = 'none';
    }
  },

  async generateQuiz() {
    const errorEl = document.getElementById('hub-error');
    const btn = document.getElementById('generate-btn');
    const difficulty = document.getElementById('difficulty-select').value;
    const count = document.getElementById('q-count-input').value;

    if (this.gameState === 'syllabus' && !this.selectedFile) {
      errorEl.textContent = 'Please upload a syllabus file first (.pdf, .jpg, .png).';
      errorEl.style.display = 'block';
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = 'Analyzing...';
      errorEl.style.display = 'none';

      const formData = new FormData();
      if (this.gameState === 'syllabus') {
        formData.append('file', this.selectedFile);
      }
      
      const sectionsArray = this.gameState === 'aptitude' ? ['english', 'logical', 'quant'] : ['english'];
      formData.append('sections', JSON.stringify(sectionsArray));
      formData.append('count_per_section', count);
      formData.append('difficulty', difficulty);

      const res = await fetch(API_URL, {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      let allQuestions = [];
      Object.keys(data).forEach(section => {
        allQuestions = allQuestions.concat(data[section]);
      });
      
      this.quizData = allQuestions;
      this.navigate('quiz');
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message.includes('Failed') ? err.message : 'Failed to generate quiz. Is the backend running?';
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Quiz';
    }
  },

  // Quiz Interaction
  startQuiz() {
    this.currentIndex = 0;
    this.score = 0;
    this.userAnswers = [];
    this.renderQuestion();
  },

  renderQuestion() {
    const q = this.quizData[this.currentIndex];
    const total = this.quizData.length;
    const percent = ((this.currentIndex + 1) / total) * 100;

    document.getElementById('q-section-display').textContent = q.section;
    document.getElementById('q-progress-text').textContent = `Question ${this.currentIndex + 1} of ${total}`;
    document.getElementById('q-progress-bar').style.width = `${percent}%`;
    document.getElementById('question-text').textContent = q.q;

    const optContainer = document.getElementById('options-container');
    optContainer.innerHTML = '';
    
    q.opts.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option-btn';
      btn.textContent = opt;
      btn.onclick = () => this.handleOptionClick(idx, btn);
      optContainer.appendChild(btn);
    });

    document.getElementById('explanation-container').style.display = 'none';
    document.getElementById('next-btn-container').style.display = 'none';

    // Reset next button text
    const nextBtn = document.getElementById('next-q-btn');
    if (this.currentIndex < total - 1) {
      nextBtn.textContent = 'Next Question';
    } else {
      nextBtn.textContent = 'View Results';
    }
  },

  handleOptionClick(selectedIndex, clickedBtn) {
    if (document.getElementById('explanation-container').style.display === 'block') return; // Selection already made

    const q = this.quizData[this.currentIndex];
    this.userAnswers[this.currentIndex] = selectedIndex;

    const buttons = document.querySelectorAll('#options-container .quiz-option-btn');
    buttons.forEach((btn, idx) => {
      btn.classList.add('locked');
      if (idx === q.ans) {
        btn.classList.add('correct');
      } else if (idx === selectedIndex && selectedIndex !== q.ans) {
        btn.classList.add('wrong');
      }
    });

    if (selectedIndex === q.ans) {
      this.score++;
    }

    document.getElementById('explanation-text').textContent = q.exp;
    document.getElementById('explanation-container').style.display = 'block';
    document.getElementById('next-btn-container').style.display = 'block';
  },

  nextQuestion() {
    if (this.currentIndex < this.quizData.length - 1) {
      this.currentIndex++;
      this.renderQuestion();
    } else {
      // Calculate final score accurately to verify
      let finalScore = 0;
      this.quizData.forEach((q, idx) => {
        if (this.userAnswers[idx] === q.ans) finalScore++;
      });
      this.score = finalScore;
      this.saveHistory(finalScore, this.quizData.length);
      this.navigate('result');
    }
  },

  // Results & Analytics
  renderResults() {
    const total = this.quizData.length;
    const percentage = Math.round((this.score / total) * 100);

    document.getElementById('final-score-display').textContent = `${this.score} / ${total}`;
    document.getElementById('final-percent-display').textContent = `You scored ${percentage}% on this assessment.`;

    this.renderCharts();
  },

  renderCharts() {
    const sectionScores = {
      english: { correct: 0, total: 0 },
      logical: { correct: 0, total: 0 },
      quant: { correct: 0, total: 0 }
    };

    // Make sure dynamically named sections from syllabus also work
    this.quizData.forEach((q, idx) => {
      if (!sectionScores[q.section]) {
        sectionScores[q.section] = { correct: 0, total: 0 };
      }
      sectionScores[q.section].total++;
      if (this.userAnswers[idx] === q.ans) {
        sectionScores[q.section].correct++;
      }
    });

    const labels = Object.keys(sectionScores);
    const dataPoints = labels.map(label => {
      const sec = sectionScores[label];
      return sec.total > 0 ? (sec.correct / sec.total) * 100 : 0;
    });

    // Destroy existing charts if any
    if (this.radarChartInstance) this.radarChartInstance.destroy();
    if (this.lineChartInstance) this.lineChartInstance.destroy();

    // Radar Chart
    const radarCtx = document.getElementById('radarChart').getContext('2d');
    Chart.defaults.color = '#8b8c8d';
    // Uppercase labels
    const displayLabels = labels.map(l => l.charAt(0).toUpperCase() + l.slice(1));

    this.radarChartInstance = new Chart(radarCtx, {
      type: 'radar',
      data: {
        labels: displayLabels,
        datasets: [{
          label: 'Score %',
          data: dataPoints,
          backgroundColor: 'rgba(102, 252, 241, 0.5)',
          borderColor: '#66fcf1',
          pointBackgroundColor: '#66fcf1',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: 'rgba(255,255,255,0.1)' },
            grid: { color: 'rgba(255,255,255,0.1)' },
            pointLabels: { color: '#c5c6c7', font: {size: 12} },
            ticks: { display: false, max: 100, min: 0 }
          }
        },
        plugins: { legend: { display: false } }
      }
    });

    // Line Chart
    if (this.history.length > 1) {
      document.getElementById('history-chart-container').style.display = 'block';
      const lineCtx = document.getElementById('lineChart').getContext('2d');
      const histLabels = this.history.map((_, i) => `Quiz ${i+1}`);
      const histData = this.history.map(entry => Math.round((entry.score / entry.total) * 100));

      this.lineChartInstance = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: histLabels,
          datasets: [{
            label: 'Score Timeline (%)',
            data: histData,
            borderColor: '#45a29e',
            backgroundColor: '#45a29e',
            borderWidth: 3,
            fill: false,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              max: 100,
              min: 0,
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: {
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    } else {
      document.getElementById('history-chart-container').style.display = 'none';
    }
  },

  async exportToPDF() {
    const btn = document.getElementById('export-pdf-btn');
    // Store original to restore later
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating PDF...';
    btn.disabled = true;

    try {
      const element = document.getElementById('pdf-report-container');
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#0b0c10',
        ignoreElements: (el) => el.getAttribute('data-html2canvas-ignore') !== null
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('GenQuiz_Report.pdf');
    } catch (e) {
      console.error(e);
      alert("Failed to export PDF.");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
