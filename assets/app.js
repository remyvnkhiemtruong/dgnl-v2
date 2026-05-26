const STORE_KEY = 'dgnl_phong_thi_vact_2026_v2';
let exam = null;
let state = {
  current: 0,
  answers: {},
  flagged: {},
  submitted: false,
  startedAt: null,
  durationSeconds: 150 * 60,
  remainingSeconds: 150 * 60,
  paused: true,
  result: null,
  filter: 'all'
};
let timerHandle = null;

const $ = (id) => document.getElementById(id);
const escapeHtml = (s = '') => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function rich(s = '') {
  return escapeHtml(s).replace(/\n/g, '<br>');
}
function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function loadState() {
  const saved = localStorage.getItem(STORE_KEY);
  if (!saved) return;
  try { state = { ...state, ...JSON.parse(saved) }; } catch (_) {}
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h,m,s].map(v => String(v).padStart(2, '0')).join(':');
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
      if (state.remainingSeconds <= 0) { state.remainingSeconds = 0; submitExam(true); }
      updateTimerUI(); saveState();
    }
  }, 1000);
}
function pauseTimer() { state.paused = true; saveState(); }
function setDuration(minutes) {
  const seconds = Math.max(60, Number(minutes || 150) * 60);
  state.durationSeconds = seconds;
  if (!state.startedAt && Object.keys(state.answers).length === 0) state.remainingSeconds = seconds;
  saveState(); updateTimerUI();
}
function typeset(root = document.body) {
  if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([root]).catch(() => {});
}
function renderGrid() {
  const grid = $('questionGrid'); grid.innerHTML = '';
  exam.questions.forEach((q, idx) => {
    const answered = Boolean(state.answers[q.id]);
    const flagged = Boolean(state.flagged[q.id]);
    if (state.filter === 'unanswered' && answered) return;
    if (state.filter === 'flagged' && !flagged) return;
    const btn = document.createElement('button');
    btn.className = `qnav ${idx === state.current ? 'active' : ''} ${answered ? 'answered' : ''} ${flagged ? 'flagged' : ''}`;
    btn.textContent = q.id;
    btn.title = `Câu ${q.id}${answered ? ' – đã làm' : ' – chưa làm'}${flagged ? ' – đã đánh dấu' : ''}`;
    btn.addEventListener('click', () => { state.current = idx; saveState(); renderQuestion(); if (window.innerWidth < 980) $('sidebar').classList.remove('open'); });
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
  if (q.context && q.context.trim()) { ctxBox.hidden = false; $('contextText').innerHTML = rich(q.context); }
  else { ctxBox.hidden = true; $('contextText').innerHTML = ''; }
  const flagBtn = $('flagBtn');
  flagBtn.classList.toggle('active', Boolean(state.flagged[q.id]));
  flagBtn.textContent = state.flagged[q.id] ? '★ Đã đánh dấu' : '☆ Đánh dấu';
  const options = $('options'); options.innerHTML = '';
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
    btn.addEventListener('click', () => { state.answers[q.id] = opt.key; saveState(); renderQuestion(); renderGrid(); updateProgress(); });
    options.appendChild(btn);
  });
  $('prevBtn').disabled = state.current === 0;
  $('nextBtn').disabled = state.current === exam.questions.length - 1;
  $('clearBtn').disabled = state.submitted;
  renderGrid(); updateProgress(); updateReviewLock(); typeset($('examPanel'));
}
function renderExamText(query = '') {
  const textEl = $('examText'); const base = exam.examOnlyText || '';
  if (!query.trim()) { textEl.textContent = base; return; }
  const safe = escapeHtml(base);
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  textEl.innerHTML = safe.replace(pattern, m => `<mark>${escapeHtml(m)}</mark>`);
}
function switchTab(name) {
  if (name === 'review' && !state.submitted) {
    showToast('Lời giải chỉ mở sau khi bạn nộp bài.');
    name = 'exam';
  }
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $('examPanel').classList.toggle('active', name === 'exam');
  $('textPanel').classList.toggle('active', name === 'text');
  $('reviewPanel').classList.toggle('active', name === 'review');
  if (name === 'text') renderExamText($('searchBox').value || '');
  if (name === 'review') renderReview();
}
function submitExam(auto = false) {
  state.submitted = true; state.paused = true; clearInterval(timerHandle);
  const total = exam.questions.length; let correct = 0;
  const details = exam.questions.map(q => { const chosen = state.answers[q.id] || null; const ok = chosen === q.answer; if (ok) correct++; return { id: q.id, chosen, answer: q.answer, correct: ok }; });
  state.result = { total, correct, wrong: total - correct, percent: Math.round(correct / total * 10000) / 100, auto, details };
  saveState(); updateReviewLock(); renderQuestion(); renderReview(); switchTab('review');
}
function renderReview() {
  const card = $('resultCard'); const list = $('reviewList');
  if (!state.submitted || !state.result) { card.innerHTML = '<h2>Kết quả</h2><p>Chưa nộp bài. Lời giải và đáp án đúng đang được khóa.</p>'; list.innerHTML = ''; return; }
  const { total, correct, percent } = state.result;
  const unanswered = exam.questions.filter(q => !state.answers[q.id]).length;
  card.innerHTML = `<h2>Kết quả</h2><div class="score ${percent >= 50 ? 'pass' : ''}">${correct}/${total}</div><p>Đúng ${percent}% số câu. Còn ${unanswered} câu chưa chọn. Điểm này là điểm thô, không phải điểm IRT.</p>`;
  list.innerHTML = '';
  exam.questions.forEach(q => {
    const chosen = state.answers[q.id] || 'Chưa chọn'; const ok = chosen === q.answer;
    const item = document.createElement('article'); item.className = 'review-item';
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
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bai-lam-dgnl.json'; a.click(); URL.revokeObjectURL(url);
}
function showToast(message) {
  let toast = $('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = message; toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}
async function loadExamData() {
  if (window.EXAM_DATA) return window.EXAM_DATA;
  const res = await fetch('data/exam.json');
  return await res.json();
}
async function init() {
  exam = await loadExamData();
  loadState();
  if (!state.durationSeconds) state.durationSeconds = (exam.metadata.defaultDurationMinutes || 150) * 60;
  if (!state.remainingSeconds) state.remainingSeconds = state.durationSeconds;
  $('examTitle').textContent = exam.metadata.title;
  $('durationInput').value = Math.round(state.durationSeconds / 60);
  updateTimerUI(); updateReviewLock(); renderQuestion(); renderExamText(); renderReview();
  $('startBtn').addEventListener('click', startTimer);
  $('pauseBtn').addEventListener('click', pauseTimer);
  $('durationInput').addEventListener('change', e => setDuration(e.target.value));
  $('prevBtn').addEventListener('click', () => { state.current = Math.max(0, state.current - 1); saveState(); renderQuestion(); });
  $('nextBtn').addEventListener('click', () => { state.current = Math.min(exam.questions.length - 1, state.current + 1); saveState(); renderQuestion(); });
  $('clearBtn').addEventListener('click', () => { delete state.answers[exam.questions[state.current].id]; saveState(); renderQuestion(); });
  $('flagBtn').addEventListener('click', () => { const id = exam.questions[state.current].id; state.flagged[id] = !state.flagged[id]; if (!state.flagged[id]) delete state.flagged[id]; saveState(); renderQuestion(); });
  $('submitBtn').addEventListener('click', () => { const dlg = $('confirmDialog'); if (dlg.showModal) { dlg.showModal(); dlg.addEventListener('close', () => { if (dlg.returnValue === 'ok') submitExam(false); }, { once: true }); } else if (confirm('Nộp bài?')) submitExam(false); });
  $('resetBtn').addEventListener('click', () => { if (!confirm('Xóa toàn bộ bài làm và làm lại từ đầu?')) return; localStorage.removeItem(STORE_KEY); state = { current:0, answers:{}, flagged:{}, submitted:false, startedAt:null, durationSeconds:(exam.metadata.defaultDurationMinutes||150)*60, remainingSeconds:(exam.metadata.defaultDurationMinutes||150)*60, paused:true, result:null, filter:'all' }; $('durationInput').value = Math.round(state.durationSeconds/60); updateTimerUI(); updateReviewLock(); renderQuestion(); renderReview(); switchTab('exam'); });
  $('exportBtn').addEventListener('click', exportAnswers);
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => { document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); state.filter = chip.dataset.filter; saveState(); renderGrid(); }));
  $('searchBox').addEventListener('input', e => renderExamText(e.target.value));
  $('copyExamTextBtn').addEventListener('click', async () => { await navigator.clipboard.writeText(exam.examOnlyText || ''); showToast('Đã copy đề không đáp án.'); });
  $('printBtn').addEventListener('click', () => window.print());
  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  if (!state.paused && !state.submitted) startTimer();
}
init().catch(err => { document.body.innerHTML = `<main style="padding:32px;font-family:system-ui"><h1>Không tải được đề</h1><p>${escapeHtml(err.message)}</p><p>Bản này có hỗ trợ chạy local. Hãy bảo đảm file <code>data/exam-data.js</code> vẫn nằm đúng thư mục, hoặc mở <code>index-local.html</code>.</p></main>`; });
