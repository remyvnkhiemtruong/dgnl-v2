const STORE_KEY = 'dgnl_phong_thi_vact_2026_v2';

const defaultState = {
  current: 0,
  answers: {},
  flagged: {},
  submitted: false,
  startedAt: null,
  durationSeconds: 150 * 60,
  remainingSeconds: 150 * 60,
  paused: true,
  result: null,
  filter: 'all',
  activeTab: 'exam',
  readingMode: 'sections',
  selectedSection: 'all'
};

let exam = null;
let state = { ...defaultState };
let timerHandle = null;

const $ = (id) => document.getElementById(id);
const escapeHtml = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escapeRegExp = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rich(s = '', query = '') {
  const html = escapeHtml(s).replace(/\n/g, '<br>');
  if (!query.trim()) return html;
  const pattern = new RegExp(escapeRegExp(query.trim()), 'gi');
  return html.replace(pattern, m => `<mark>${m}</mark>`);
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(STORE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    state = {
      ...defaultState,
      ...parsed,
      answers: parsed.answers || {},
      flagged: parsed.flagged || {}
    };
  } catch (_) {}
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function updateTimerUI() {
  $('timer').textContent = fmtTime(state.remainingSeconds);
  $('timer').style.color = state.remainingSeconds <= 5 * 60 ? '#fecaca' : '#fff';
}

function startTimer() {
  if (state.submitted) return;
  state.paused = false;
  if (!state.startedAt) state.startedAt = Date.now();
  saveState();
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    if (!state.paused && !state.submitted) {
      state.remainingSeconds -= 1;
      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = 0;
        submitExam(true);
      }
      updateTimerUI();
      saveState();
    }
  }, 1000);
}

function pauseTimer() {
  state.paused = true;
  saveState();
}

function setDuration(minutes) {
  const seconds = Math.max(60, Number(minutes || 150) * 60);
  state.durationSeconds = seconds;
  if (!state.startedAt && Object.keys(state.answers).length === 0) state.remainingSeconds = seconds;
  saveState();
  updateTimerUI();
}

function typeset(root = document.body) {
  if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([root]).catch(() => {});
}

function getSections() {
  return exam?.metadata?.sections || [];
}

function hydrateSectionSelect() {
  const select = $('sectionSelect');
  select.innerHTML = '<option value="all">Tất cả các phần</option>';
  getSections().forEach(section => {
    const opt = document.createElement('option');
    opt.value = section.name;
    opt.textContent = `${section.name} (${section.from}-${section.to})`;
    select.appendChild(opt);
  });
  if (state.selectedSection !== 'all' && !getSections().some(section => section.name === state.selectedSection)) {
    state.selectedSection = 'all';
  }
  select.value = state.selectedSection;
}

function renderGrid() {
  const grid = $('questionGrid');
  grid.innerHTML = '';
  exam.questions.forEach((q, idx) => {
    const answered = Boolean(state.answers[q.id]);
    const flagged = Boolean(state.flagged[q.id]);
    if (state.filter === 'unanswered' && answered) return;
    if (state.filter === 'flagged' && !flagged) return;
    const btn = document.createElement('button');
    btn.className = `qnav ${idx === state.current ? 'active' : ''} ${answered ? 'answered' : ''} ${flagged ? 'flagged' : ''}`;
    btn.textContent = q.id;
    btn.title = `Câu ${q.id}${answered ? ' – đã làm' : ' – chưa làm'}${flagged ? ' – đã đánh dấu' : ''}`;
    btn.addEventListener('click', () => {
      state.current = idx;
      saveState();
      renderQuestion();
      switchTab('exam');
      if (window.innerWidth < 980) $('sidebar').classList.remove('open');
    });
    grid.appendChild(btn);
  });
}

function updateProgress() {
  const total = exam.questions.length;
  const answered = exam.questions.filter(q => state.answers[q.id]).length;
  const flagged = Object.values(state.flagged).filter(Boolean).length;
  $('answeredCount').textContent = `${answered}/${total}`;
  $('flaggedCount').textContent = flagged;
  $('progressBar').style.width = `${answered / total * 100}%`;
}

function updateReviewLock() {
  const tab = document.querySelector('[data-tab="review"]');
  if (tab) {
    tab.classList.toggle('locked', !state.submitted);
    tab.textContent = state.submitted ? 'Lời giải' : 'Lời giải 🔒';
    tab.setAttribute('aria-disabled', String(!state.submitted));
  }
}

function renderQuestion() {
  const q = exam.questions[state.current];
  $('sectionName').textContent = q.section;
  $('questionNumber').textContent = `Câu ${q.id}`;
  $('promptText').innerHTML = rich(q.prompt || '');
  const ctxBox = $('contextBox');
  if (q.context && q.context.trim()) {
    ctxBox.hidden = false;
    $('contextText').innerHTML = rich(q.context);
  } else {
    ctxBox.hidden = true;
    $('contextText').innerHTML = '';
  }
  const flagBtn = $('flagBtn');
  flagBtn.classList.toggle('active', Boolean(state.flagged[q.id]));
  flagBtn.textContent = state.flagged[q.id] ? '★ Đã đánh dấu' : '☆ Đánh dấu';
  const options = $('options');
  options.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    const selected = state.answers[q.id] === opt.key;
    let statusClass = '';
    if (state.submitted) {
      if (opt.key === q.answer) statusClass = ' correct';
      if (selected && opt.key !== q.answer) statusClass = ' wrong';
    }
    btn.className = `option ${selected ? 'selected' : ''}${statusClass}`;
    btn.innerHTML = `<span class="option-key">${opt.key}</span><span class="option-text">${rich(opt.text)}</span>`;
    btn.disabled = state.submitted;
    btn.addEventListener('click', () => {
      state.answers[q.id] = opt.key;
      saveState();
      renderQuestion();
      renderGrid();
      updateProgress();
    });
    options.appendChild(btn);
  });
  $('prevBtn').disabled = state.current === 0;
  $('nextBtn').disabled = state.current === exam.questions.length - 1;
  $('clearBtn').disabled = state.submitted;
  renderGrid();
  updateProgress();
  updateReviewLock();
  typeset($('examPanel'));
}

function questionReadHtml(q, query = '', variant = 'read') {
  const context = variant !== 'paper' && q.context && q.context.trim()
    ? `<details class="context-box" open><summary>Ngữ liệu / dữ kiện</summary><div class="rich-text">${rich(q.context, query)}</div></details>`
    : '';
  const optionsHtml = q.options.map(opt => (
    `<div class="${variant}-option option-static"><span class="option-key">${opt.key}</span><span class="option-text">${rich(opt.text, query)}</span></div>`
  )).join('');
  return `<article class="${variant}-question">
    <h3>Câu ${q.id}</h3>
    ${context}
    <div class="rich-text prompt">${rich(q.prompt, query)}</div>
    <div class="options ${variant}-options">${optionsHtml}</div>
  </article>`;
}

function renderExamText(query = '') {
  const textEl = $('examText');
  const base = exam.examOnlyText || '';
  if (!query.trim()) {
    textEl.textContent = base;
    return;
  }
  const safe = escapeHtml(base);
  const pattern = new RegExp(escapeRegExp(query.trim()), 'gi');
  textEl.innerHTML = safe.replace(pattern, m => `<mark>${m}</mark>`);
}

function renderReadingSections(query = '') {
  const content = $('readingContent');
  const sections = getSections()
    .filter(section => state.selectedSection === 'all' || section.name === state.selectedSection)
    .map(section => {
      const questions = exam.questions.filter(q => q.section === section.name);
      if (!questions.length) return '';
      return `<section class="section-reader">
        <div class="section-heading">
          <h2>${escapeHtml(section.name)}</h2>
          <span>${section.from}-${section.to}</span>
        </div>
        ${questions.map(q => questionReadHtml(q, query)).join('')}
      </section>`;
    }).join('');
  content.innerHTML = sections || '<p class="empty-state">Không có câu hỏi phù hợp.</p>';
  typeset(content);
}

function renderReading() {
  const query = $('searchBox').value || '';
  const fullMode = state.readingMode === 'full';
  document.querySelectorAll('[data-reading-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.readingMode === state.readingMode));
  $('sectionSelect').disabled = fullMode;
  $('readingContent').hidden = fullMode;
  $('examText').hidden = !fullMode;
  if (fullMode) renderExamText(query);
  else renderReadingSections(query);
}

function renderPaper() {
  const page = $('paperExam');
  let currentContext = '';
  const body = getSections().map(section => {
    currentContext = '';
    const questions = exam.questions.filter(q => q.section === section.name).map(q => {
      const contextHtml = q.context && q.context.trim() && q.context !== currentContext
        ? `<div class="paper-context">${rich(q.context)}</div>`
        : '';
      if (q.context && q.context.trim()) currentContext = q.context;
      else currentContext = '';
      return `${contextHtml}${questionReadHtml(q, '', 'paper')}`;
    }).join('');
    return `<section class="paper-section">
      <h2>${escapeHtml(section.name)}</h2>
      ${questions}
    </section>`;
  }).join('');
  page.innerHTML = `<header class="paper-header">
    <h1>${escapeHtml(exam.metadata.title)}</h1>
    <p>Đề không kèm đáp án · ${exam.questions.length} câu · ${Math.round((exam.metadata.defaultDurationMinutes || 150))} phút</p>
  </header>${body}`;
  typeset(page);
}

function switchTab(name) {
  if (name === 'review' && !state.submitted) {
    showToast('Lời giải chỉ mở sau khi bạn nộp bài.');
    name = 'exam';
  }
  state.activeTab = name;
  saveState();
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $('examPanel').classList.toggle('active', name === 'exam');
  $('textPanel').classList.toggle('active', name === 'text');
  $('paperPanel').classList.toggle('active', name === 'paper');
  $('reviewPanel').classList.toggle('active', name === 'review');
  if (name === 'text') renderReading();
  if (name === 'paper') renderPaper();
  if (name === 'review') renderReview();
}

function submitExam(auto = false) {
  state.submitted = true;
  state.paused = true;
  clearInterval(timerHandle);
  const total = exam.questions.length;
  let correct = 0;
  const details = exam.questions.map(q => {
    const chosen = state.answers[q.id] || null;
    const ok = chosen === q.answer;
    if (ok) correct++;
    return { id: q.id, chosen, answer: q.answer, correct: ok };
  });
  state.result = { total, correct, wrong: total - correct, percent: Math.round(correct / total * 10000) / 100, auto, details };
  saveState();
  updateReviewLock();
  renderQuestion();
  renderReview();
  switchTab('review');
}

function renderReview() {
  const card = $('resultCard');
  const list = $('reviewList');
  if (!state.submitted || !state.result) {
    card.innerHTML = '<h2>Kết quả</h2><p>Chưa nộp bài. Lời giải và đáp án đúng đang được khóa.</p>';
    list.innerHTML = '';
    return;
  }
  const { total, correct, percent } = state.result;
  const unanswered = exam.questions.filter(q => !state.answers[q.id]).length;
  card.innerHTML = `<h2>Kết quả</h2><div class="score ${percent >= 50 ? 'pass' : ''}">${correct}/${total}</div><p>Đúng ${percent}% số câu. Còn ${unanswered} câu chưa chọn. Điểm này là điểm thô, không phải điểm IRT.</p>`;
  list.innerHTML = '';
  exam.questions.forEach(q => {
    const chosen = state.answers[q.id] || 'Chưa chọn';
    const ok = chosen === q.answer;
    const item = document.createElement('article');
    item.className = 'review-item';
    const optionsHtml = q.options.map(o => {
      const cls = [o.key === q.answer ? 'correct' : '', chosen === o.key && chosen !== q.answer ? 'wrong' : ''].filter(Boolean).join(' ');
      return `<div class="option ${cls}"><span class="option-key">${o.key}</span><span class="option-text">${rich(o.text)}</span></div>`;
    }).join('');
    item.innerHTML = `<h3>Câu ${q.id}</h3>
      <div class="review-meta"><span class="badge ${ok ? 'correct' : 'wrong'}">${ok ? 'Đúng' : 'Sai'}</span><span class="badge">Bạn chọn: ${escapeHtml(chosen)}</span><span class="badge">Đáp án: ${q.answer}</span></div>
      ${q.context ? `<details class="context-box"><summary>Ngữ liệu / dữ kiện</summary><div class="rich-text">${rich(q.context)}</div></details>` : ''}
      <div class="rich-text prompt">${rich(q.prompt)}</div><div class="options">${optionsHtml}</div>
      <div class="explanation"><strong>Giải thích:</strong><br>${rich((q.explanation || 'Chưa có giải thích trong dữ liệu.').replace(/^Giải thích:\s*/, ''))}</div>`;
    list.appendChild(item);
  });
  typeset($('reviewPanel'));
}

function exportAnswers() {
  const rows = exam.questions.map(q => ({ cau: q.id, chon: state.answers[q.id] || '', dap_an: state.submitted ? q.answer : '' }));
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), result: state.result, answers: rows }, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bai-lam-dgnl.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showToast(message);
}

function showToast(message) {
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

async function loadExamData() {
  if (window.EXAM_DATA) return window.EXAM_DATA;
  const res = await fetch('data/exam.json');
  return await res.json();
}

function resetExam() {
  if (!confirm('Xóa toàn bộ bài làm và làm lại từ đầu?')) return;
  localStorage.removeItem(STORE_KEY);
  state = {
    ...defaultState,
    durationSeconds: (exam.metadata.defaultDurationMinutes || 150) * 60,
    remainingSeconds: (exam.metadata.defaultDurationMinutes || 150) * 60
  };
  $('durationInput').value = Math.round(state.durationSeconds / 60);
  updateTimerUI();
  updateReviewLock();
  renderQuestion();
  renderReview();
  switchTab('exam');
}

async function init() {
  exam = await loadExamData();
  loadState();
  if (!['exam', 'text', 'paper', 'review'].includes(state.activeTab)) state.activeTab = 'exam';
  if (!['sections', 'full'].includes(state.readingMode)) state.readingMode = 'sections';
  if (!state.durationSeconds) state.durationSeconds = (exam.metadata.defaultDurationMinutes || 150) * 60;
  if (!state.remainingSeconds) state.remainingSeconds = state.durationSeconds;
  $('examTitle').textContent = exam.metadata.title;
  $('durationInput').value = Math.round(state.durationSeconds / 60);
  hydrateSectionSelect();
  updateTimerUI();
  updateReviewLock();
  renderQuestion();
  renderReview();
  switchTab(state.activeTab || 'exam');

  $('startBtn').addEventListener('click', startTimer);
  $('pauseBtn').addEventListener('click', pauseTimer);
  $('durationInput').addEventListener('change', e => setDuration(e.target.value));
  $('prevBtn').addEventListener('click', () => { state.current = Math.max(0, state.current - 1); saveState(); renderQuestion(); });
  $('nextBtn').addEventListener('click', () => { state.current = Math.min(exam.questions.length - 1, state.current + 1); saveState(); renderQuestion(); });
  $('clearBtn').addEventListener('click', () => { delete state.answers[exam.questions[state.current].id]; saveState(); renderQuestion(); });
  $('flagBtn').addEventListener('click', () => {
    const id = exam.questions[state.current].id;
    state.flagged[id] = !state.flagged[id];
    if (!state.flagged[id]) delete state.flagged[id];
    saveState();
    renderQuestion();
  });
  $('submitBtn').addEventListener('click', () => {
    const dlg = $('confirmDialog');
    if (dlg.showModal) {
      dlg.showModal();
      dlg.addEventListener('close', () => { if (dlg.returnValue === 'ok') submitExam(false); }, { once: true });
    } else if (confirm('Nộp bài?')) submitExam(false);
  });
  $('resetBtn').addEventListener('click', resetExam);
  $('exportBtn').addEventListener('click', exportAnswers);
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.filter = chip.dataset.filter;
    saveState();
    renderGrid();
  }));
  document.querySelectorAll('[data-reading-mode]').forEach(btn => btn.addEventListener('click', () => {
    state.readingMode = btn.dataset.readingMode;
    saveState();
    renderReading();
  }));
  $('sectionSelect').addEventListener('change', e => {
    state.selectedSection = e.target.value;
    saveState();
    renderReading();
  });
  $('searchBox').addEventListener('input', renderReading);
  $('copyExamTextBtn').addEventListener('click', () => copyText(exam.examOnlyText || '', 'Đã copy đề không đáp án.'));
  $('copyPaperTextBtn').addEventListener('click', () => copyText(exam.examOnlyText || '', 'Đã copy đề giấy.'));
  $('printBtn').addEventListener('click', () => window.print());
  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  window.addEventListener('beforeprint', renderPaper);
  if (!state.paused && !state.submitted) startTimer();
}

init().catch(err => {
  document.body.innerHTML = `<main style="padding:32px;font-family:system-ui"><h1>Không tải được đề</h1><p>${escapeHtml(err.message)}</p><p>Bản này có hỗ trợ chạy local. Hãy bảo đảm file <code>data/exam-data.js</code> vẫn nằm đúng thư mục, hoặc mở <code>index-local.html</code>.</p></main>`;
});
