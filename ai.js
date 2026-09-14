/* ai.js — real model calls against the local engine backend.
   Nothing in this file fabricates output: every answer, question and score
   below is whatever the backend returned, and failures are shown as failures. */

const API = '';  // same-origin: frontend and backend served from the same server

/* ---------- conversation management ---------- */
const CONV_KEY = 'learn_engine_conversations';
const CONV_ACTIVE_KEY = 'learn_engine_active_conv';

function loadConversations() {
  try { return JSON.parse(localStorage.getItem(CONV_KEY)) || {}; }
  catch { return {}; }
}
function saveConversations() {
  localStorage.setItem(CONV_KEY, JSON.stringify(AI.conversations));
}
function newConversation(title) {
  const id = 'c_' + Date.now();
  AI.conversations[id] = { id, title: title || 'New conversation', messages: [], created: Date.now(), questionLog: [] };
  AI.activeConv = id;
  AI.chat = [];
  saveConversations();
  localStorage.setItem(CONV_ACTIVE_KEY, id);
}
function switchConversation(id) {
  if (!AI.conversations[id]) return;
  AI.activeConv = id;
  AI.chat = AI.conversations[id].messages || [];
  localStorage.setItem(CONV_ACTIVE_KEY, id);
}
function deleteConversation(id) {
  delete AI.conversations[id];
  saveConversations();
  if (AI.activeConv === id) {
    const ids = Object.keys(AI.conversations);
    if (ids.length) switchConversation(ids[ids.length - 1]);
    else { newConversation('New conversation'); }
  }
}
function logQuestion(question, atoms) {
  if (AI.activeConv && AI.conversations[AI.activeConv]) {
    AI.conversations[AI.activeConv].questionLog.push({ q: question, atoms: (atoms||[]).map(a=>a.id), ts: Date.now() });
    saveConversations();
  }
}

const AI = {
  health: null,
  conversations: loadConversations(),
  activeConv: localStorage.getItem(CONV_ACTIVE_KEY) || null,
  activeFolder: localStorage.getItem('learn_engine_active_folder') || 'All',
  chat: [],
  busy: false,
  quiz: { scope: 'unit', value: '3', count: 3, difficulty: 'exam', items: null, busy: false, err: null, ms: 0 },
  answers: {},
  explain: {},
  summary: { card: null, busy: false, err: null }
};

function setFolder(folder) {
  AI.activeFolder = folder;
  localStorage.setItem('learn_engine_active_folder', folder);
  render();
}

function renameConversation(id) {
  const conv = AI.conversations[id];
  if (!conv) return;
  const newTitle = prompt('New title', conv.title || '');
  if (newTitle && newTitle.trim()) {
    conv.title = newTitle.trim();
    saveConversations();
    render();
  }
}

function moveConversation(id) {
  const conv = AI.conversations[id];
  if (!conv) return;
  const folders = ['Basics', 'Conditioning', 'Random Variables', 'Distributions', 'Other'];
  const choice = prompt('Move to folder (Basics, Conditioning, Random Variables, Distributions, Other)', conv.folder || 'Other');
  if (choice && folders.includes(choice.trim())) {
    conv.folder = choice.trim();
    saveConversations();
    render();
  }
}

// Restore active conversation
if (AI.activeConv && AI.conversations[AI.activeConv]) {
  AI.chat = AI.conversations[AI.activeConv].messages || [];
} else {
  newConversation('New conversation');
}

/* ---------- question analysis & recommendations ---------- */

/** Aggregate all question logs across every conversation */
function getAllQuestionLogs() {
  const logs = [];
  for (const c of Object.values(AI.conversations)) {
    if (c.questionLog) logs.push(...c.questionLog);
  }
  return logs;
}

/** Count how often each atom id appears in the question log */
function atomFrequency() {
  const freq = {};
  for (const entry of getAllQuestionLogs()) {
    for (const id of (entry.atoms || [])) {
      freq[id] = (freq[id] || 0) + 1;
    }
  }
  return freq;
}

/** Extract keyword topics from user questions */
function topicFrequency() {
  const STOP = new Set('the and not for with that into from only its all one two are has have must because than rather every each which when where what how can does their they them this these those over same different more less but also been being was were will would should could may might your our why a an of to in on at by as is be so if no yes you we i my it'.split(' '));
  const topics = {};
  for (const entry of getAllQuestionLogs()) {
    const words = (entry.q || '').toLowerCase().match(/[a-z]{4,}/g) || [];
    for (const w of words) {
      if (!STOP.has(w)) topics[w] = (topics[w] || 0) + 1;
    }
  }
  return Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

/** Recommend atoms the user has NOT asked about yet but are related to topics they have */
function getRecommendations() {
  const freq = atomFrequency();
  const askedIds = new Set(Object.keys(freq));
  const allAtoms = (typeof ATOMS !== 'undefined' ? ATOMS : (typeof window !== 'undefined' && window.ATOMS) || []);
  if (!allAtoms.length) return [];

  // Build a keyword profile from asked-about atoms
  const askedAtoms = allAtoms.filter(a => askedIds.has(a.id));
  const profileTerms = {};
  for (const a of askedAtoms) {
    const blob = [a.title, a.source_quote, ...a.irreducible_premises, ...a.failure_modes].join(' ').toLowerCase();
    const words = blob.match(/[a-z]{4,}/g) || [];
    for (const w of words) {
      if (w.length < 5) continue;
      profileTerms[w] = (profileTerms[w] || 0) + 1;
    }
  }

  // Score un-asked atoms by overlap with the profile
  const unasked = allAtoms.filter(a => !askedIds.has(a.id));
  const scored = unasked.map(a => {
    const blob = [a.title, a.source_quote, ...a.irreducible_premises, ...a.failure_modes].join(' ').toLowerCase();
    const words = new Set(blob.match(/[a-z]{4,}/g) || []);
    let score = 0;
    for (const [term, weight] of Object.entries(profileTerms)) {
      if (words.has(term)) score += weight;
    }
    // Boost by salience so high-importance atoms surface first
    score += (a.salience || 0) * 0.3;
    return { atom: a, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).filter(s => s.score > 0).map(s => s.atom);
}

/** Render the insights panel for the Tutor page — kept minimal to avoid overload */
function renderInsights() {
  const logs = getAllQuestionLogs();
  if (logs.length === 0) return '';
  const freq = atomFrequency();
  const topics = topicFrequency();
  const recs = getRecommendations();
  const allAtoms = (typeof ATOMS !== 'undefined' ? ATOMS : (typeof window !== 'undefined' && window.ATOMS) || []);
  const atomMap = {};
  for (const a of allAtoms) atomMap[a.id] = a;

  const topAtoms = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topTopics = topics.slice(0, 5);
  const topRecs = recs.slice(0, 2);

  return `<div class="card" style="margin-top:var(--space-5)">
    <p class="eyebrow">Question insights</p>
    <p class="sub" style="margin:var(--space-2) 0 var(--space-3)">${logs.length} questions logged</p>

    ${topTopics.length ? `<p class="sect">Your focus areas</p>
    <div class="rowline" style="flex-wrap:wrap;margin-bottom:var(--space-3)">
      ${topTopics.map(([w, n]) => `<span class="chip">${esc(w)}</span>`).join('')}
    </div>` : ''}

    ${topRecs.length ? `<p class="sect">Recommended next</p>
    <div style="display:flex;flex-direction:column;gap:var(--space-2)">
      ${topRecs.map(a => `<button class="chip" onclick="openAtom('${a.id}')" style="text-align:left;width:100%">${esc((a.title||'').slice(0, 60))}</button>`).join('')}
    </div>` : ''}
  </div>`;
}

async function api(path, body, timeoutMs = 240000) {
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`backend returned ${res.status}`);
    const json = await res.json();
    json._ms = Math.round(performance.now() - t0);
    return json;
  } finally { clearTimeout(kill); }
}

async function checkHealth() {
  try {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(90000) });
    AI.health = await res.json();
  } catch (e) { AI.health = { live: false, error: String(e.message || e) }; }
  if (S.tab === 'tutor' || S.tab === 'settings') render();
}

/* ---------- tiny markdown + KaTeX rendering ---------- */
/* inline markdown + math with no wrapping paragraph, for headings and one-line labels */
function mdi(src) {
  return md(src).replace(/^<p>/, '').replace(/<\/p>$/, '');
}

function md(src) {
  const math = [];
  let t = String(src)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `@@M${math.push(['block', m]) - 1}@@`)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => `@@M${math.push(['block', m]) - 1}@@`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `@@M${math.push(['inline', m]) - 1}@@`);
  t = esc(t)
    .replace(/^###\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^\s*[-—]{3,}\s*$/gm, '<hr>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\s*(\d+)\.\s+(.+)$/gm, '<li>$2</li>');
  t = t.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, m => `<ul>${m}</ul>`);
  t = t.split(/\n{2,}/).map(p =>
    /^\s*<(h3|h4|ul|hr|table)/.test(p) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  return t.replace(/@@M(\d+)@@/g, (_, i) => {
    const [kind, code] = math[+i];
    try {
      return katex.renderToString(code.trim(), { displayMode: kind === 'block', throwOnError: false });
    } catch (e) { return `<code>${esc(code)}</code>`; }
  });
}

/* Render bilingual response with [EN] and [ZH] section markers */
function renderBilingual(text) {
  if (!text) return '<div class="prose"><p class="note">No response.</p></div>';
  // Handle both [EN]/[ZH] and \[EN\]/\[ZH\] formats
  const enMatch = text.match(/\\?\[EN\\?\]([\s\S]*?)(?=\\?\[ZH\\?\]|$)/i);
  const zhMatch = text.match(/\\?\[ZH\\?\]([\s\S]*?)$/i);
  if (enMatch || zhMatch) {
    const en = enMatch ? enMatch[1].trim() : '';
    const zh = zhMatch ? zhMatch[1].trim() : '';
    return `<div class="bilingual">
      ${en ? `<div class="lang-section"><span class="lang-tag en">EN</span><div class="prose">${md(en)}</div></div>` : ''}
      ${zh ? `<div class="lang-section"><span class="lang-tag zh">中文</span><div class="prose">${md(zh)}</div></div>` : ''}
    </div>`;
  }
  // Fallback: no markers, render as-is
  return `<div class="prose">${md(text)}</div>`;
}

/* ---------- tutor ---------- */
const STARTERS = [
  'Why is independence defined by the product form instead of P(A|B)=P(A)?',
  'I keep mixing up the multiplication rule and the total probability theorem. Separate them by their premises.',
  'Give me a counting problem where choosing a coarser sample space is wrong.',
  'Which of my 25 atoms are prerequisites for Unit 4, and what should I check before starting L5?'
];

function viewTutor() {
  const h = AI.health;
  const backend = h?.backend || 'unknown';
  const backendLabel = {
    anthropic: 'Claude',
    gemini: 'Gemini (free)',
    groq: 'Groq (free)',
    openrouter: 'OpenRouter (free models)',
    ollama: 'Ollama (local)',
    mock: 'Mock mode'
  }[backend] || backend;
  const status = h === null
    ? `<span class="tag">checking…</span>`
    : h.live
      ? `<span class="tag pass">Ready</span><span class="tag">${h.atoms} atoms</span><span class="tag">${backendLabel}</span>`
      : `<span class="tag warn">Tutor offline</span>`;
  const convs = Object.values(AI.conversations).sort((a,b) => b.created - a.created);

  // Collect all folders from conversations
  const allFolders = new Set();
  convs.forEach(c => { if (c.folder) allFolders.add(c.folder); });
  const folders = ['All', ...Array.from(allFolders).sort()];
  const activeFolder = AI.activeFolder || 'All';
  const filteredConvs = activeFolder === 'All' ? convs : convs.filter(c => c.folder === activeFolder);

  // Sidebar HTML
  const sidebarHTML = `
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h2>Conversations</h2>
      <button class="sidebar-new-btn" onclick="newConversation();render()" title="New conversation">+</button>
    </div>
    <div class="sidebar-folders">
      ${folders.map(f => `<span class="folder-tag ${f === activeFolder ? 'active' : ''}" onclick="setFolder('${f}')">${esc(f)}</span>`).join('')}
    </div>
    <div class="sidebar-convs">
      ${filteredConvs.length === 0 ? `<div class="sidebar-empty">No conversations yet</div>` : ''}
      ${filteredConvs.map(c => `<div class="conv-item ${c.id === AI.activeConv ? 'active' : ''}" onclick="switchConversation('${c.id}')">
        <div class="conv-item-title">${esc(c.title || 'New conversation')}</div>
        <div class="conv-item-meta">
          <span>${c.messages.length} messages</span>
          <span>
            <button class="conv-item-delete" onclick="event.stopPropagation();renameConversation('${c.id}')" title="Rename">✎</button>
            <button class="conv-item-delete" onclick="event.stopPropagation();moveConversation('${c.id}')" title="Move to folder">📁</button>
            <button class="conv-item-delete" onclick="event.stopPropagation();if(confirm('Delete this conversation?')){deleteConversation('${c.id}');render()}" title="Delete">✕</button>
          </span>
        </div>
      </div>`).join('')}
    </div>
  </div>`;

  // Main chat area HTML
  const mainHTML = `
  <div class="tutor-main">
    <button class="sidebar-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
    <div class="rowline" style="margin-bottom:var(--space-6);flex-wrap:wrap">${status}
      <span class="tag">bilingual EN + 中文</span></div>

    ${h && !h.live && backend === 'mock' ? `<div class="card" style="margin-bottom:var(--space-6)">
      <p class="eyebrow">Mock mode · 模擬模式</p>
      <p class="note" style="margin-top:var(--space-3)">Responses are pre-written for UI testing. To enable live AI, set one of these environment variables and restart the server:</p>
      <ul class="plainlist" style="margin-top:var(--space-3)">
        <li><code>OPENROUTER_API_KEY</code> — <a href="https://openrouter.ai/keys" target="_blank">Get free key</a> (many free models: DeepSeek, Gemini, Llama)</li>
        <li><code>GEMINI_API_KEY</code> — <a href="https://aistudio.google.com/app/apikey" target="_blank">Get free key</a> (Google Gemini, 15 RPM)</li>
        <li><code>GROQ_API_KEY</code> — <a href="https://console.groq.com/keys" target="_blank">Get free key</a> (Llama/DeepSeek, very fast)</li>
        <li><code>ANTHROPIC_API_KEY</code> — Claude (paid, highest quality)</li>
        <li>Install <a href="https://ollama.com" target="_blank">Ollama</a> — completely local, no key needed</li>
      </ul></div>` : ''}
    ${h && !h.live && backend !== 'mock' ? `<div class="card warnnote" style="margin-bottom:var(--space-6)">
      <p class="eyebrow">Tutor offline</p>
      <p class="note" style="margin-top:var(--space-3)">The tutor cannot be reached right now. Try again in a moment.</p></div>` : ''}

    <div class="chat">
      ${AI.chat.length === 0 ? `<div style="text-align:center;padding:var(--space-8) 0">
        <p class="eyebrow" style="margin-bottom:var(--space-4)">Start with one of these</p>
        <div class="starters" style="max-width:600px;margin:0 auto;text-align:left">${STARTERS.map((s, i) =>
      `<button class="starter" onclick="askTutor(${i})">${esc(s)}</button>`).join('')}</div>
      </div>` : ''}
      ${AI.chat.map(m => m.role === 'user'
        ? `<div class="bubble me">${esc(m.text)}</div>`
        : `<div class="bubble ai">${m.err
          ? `<p class="note">That answer did not come through. Ask again.</p>`
          : renderBilingual(m.text)}</div>`).join('')}
      ${AI.busy ? `<div class="bubble ai"><div class="skel"><i></i><i></i><i></i></div>
        <p class="counter">Working through your atoms…</p></div>` : ''}
    </div>

    ${renderInsights()}

    <div class="asker">
      <textarea id="q" rows="2" placeholder="${S.lang === 'zh' ? '你想知道甚麼？' : 'What do you want to know?'}"
        ${AI.busy ? 'disabled' : ''}></textarea>
      <button class="btn" onclick="askTutor()" ${AI.busy ? 'disabled' : ''}>${AI.busy ? 'Thinking…' : 'Ask'}</button>
    </div>
  </div>`;

  return `<div class="tutor-layout">${sidebarHTML}${mainHTML}</div>`;
}

async function askTutor(starter) {
  const box = document.getElementById('q');
  const text = starter === undefined ? (box ? box.value.trim() : '') : STARTERS[starter];
  if (!text || AI.busy) return;
  AI.chat.push({ role: 'user', text });
  AI.busy = true; render();
  try {
    const res = await api('/api/ask', {
      question: text, lang: S.lang,
      history: AI.chat.slice(-7, -1).map(m => ({ role: m.role, text: m.text }))
    });
    AI.chat.push({ role: 'ai', text: res.answer, atoms: res.atoms_used, ms: res._ms, model: res.model });
    // Persist to conversation
    if (AI.activeConv && AI.conversations[AI.activeConv]) {
      AI.conversations[AI.activeConv].messages = AI.chat.slice();
      logQuestion(text, res.atoms_used);
      // Auto-generate title from first message if title is default
      const conv = AI.conversations[AI.activeConv];
      if (conv.messages.length === 2 && (conv.title === 'New conversation' || !conv.title)) {
        try {
          const titleRes = await api('/api/gen_title', { message: text, lang: S.lang });
          if (titleRes.title) {
            conv.title = titleRes.title;
            // Auto-assign folder based on topic keywords
            const lower = text.toLowerCase();
            if (lower.includes('sample space') || lower.includes('event') || lower.includes('probability')) conv.folder = 'Basics';
            else if (lower.includes('conditional') || lower.includes('bayes') || lower.includes('independence')) conv.folder = 'Conditioning';
            else if (lower.includes('random variable') || lower.includes('expectation') || lower.includes('variance')) conv.folder = 'Random Variables';
            else if (lower.includes('distribution') || lower.includes('binomial') || lower.includes('normal')) conv.folder = 'Distributions';
            else conv.folder = 'Other';
            saveConversations();
          }
        } catch (e) { /* title gen failed, keep default */ }
      }
    }
  } catch (e) {
    AI.chat.push({ role: 'ai', err: String(e.message || e) });
  }
  AI.busy = false; render();
  const c = document.querySelector('.chat'); if (c) c.lastElementChild.scrollIntoView({ block: 'center' });
}

/* ---------- generated practice sets ---------- */
const SCOPES = [['unit', '1', 'Unit 1 · axioms'], ['unit', '2', 'Unit 2 · conditioning'],
['unit', '3', 'Unit 3 · counting'], ['outcome', 'conditional expectation inference estimation', 'Course outcome T2']];
const DIFFS = [['recall', 'Recall the derivation'], ['exam', 'Problem-set level'], ['transfer', 'Transfer to my work']];

function quizCard(it, i) {
  const st = AI.answers[i] || {};
  const g = st.grade;
  return `<div class="card qcard">
    <div class="between"><span class="tag act">${esc(it.type || 'question')}</span>
      <button class="chip" onclick="openAtom('${it.atom_id}')">${it.atom_id}</button></div>
    <div class="prose" style="margin-top:var(--space-3)">${md(it.prompt)}</div>
    <textarea id="ans${i}" rows="4" placeholder="Answer from the premises up. State the boundary where it fails."
      ${st.busy ? 'disabled' : ''}>${esc(st.text || '')}</textarea>
    <div class="rowline">
      <button class="btn sm" onclick="gradeAnswer(${i})" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Grading…' : 'Grade my answer'}</button>
      <button class="chip" onclick="AI.answers[${i}] = {...(AI.answers[${i}]||{}), shown: !(AI.answers[${i}]||{}).shown}; render()">
        ${st.shown ? 'Hide expected points' : 'Show expected points'}</button>
    </div>
    ${st.err ? `<p class="note">The call failed: <span class="mono">${esc(st.err)}</span></p>` : ''}
    ${st.shown ? `<div class="expect"><p class="sect">Expected points</p><ul class="plainlist">
      ${(it.expected || []).map(e => `<li>${md(e)}</li>`).join('')}</ul>
      ${it.trap ? `<p class="note">Designed to catch: ${mdi(it.trap)}</p>` : ''}</div>` : ''}
    ${g ? `<div class="graded ${g.score >= 4 ? 'ok' : ''}">
      <div class="between"><p class="eyebrow">Score</p>
        <span class="big mono">${Number(g.score).toFixed(1)}<i>/5</i></span></div>
      <p class="verdict">${esc(g.verdict || '')}</p>
      ${(g.hit || []).length ? `<p class="sect">Covered</p><ul class="plainlist ok">${g.hit.map(x => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
      ${(g.missed || []).length ? `<p class="sect">Missing</p><ul class="plainlist miss">${g.missed.map(x => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
      ${(g.wrong || []).length ? `<p class="sect">Incorrect</p><ul class="plainlist miss">${g.wrong.map(x => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
      ${g.next_probe ? `<p class="sect">Next probe</p><p class="note">${md(g.next_probe)}</p>` : ''}
    </div>` : ''}
  </div>`;
}

function viewQuizSection() {
  const q = AI.quiz;
  return `<div class="card" style="margin-top:var(--space-6)">
    <div class="between"><p class="eyebrow">Generated practice set</p>
      ${q.items ? `<span class="counter">${q.items.length} questions</span>` : ''}</div>
    <p class="sub" style="margin-top:var(--space-3)">Questions are written from your own atoms — premises, assumptions and failure modes — so a question you cannot answer points at a specific atom, not at a vague topic.</p>
    <p class="sect">Scope</p>
    <div class="rowline" style="flex-wrap:wrap">${SCOPES.map(([sc, v, l]) =>
    `<button class="chip" aria-pressed="${q.scope === sc && q.value === v}"
        onclick="AI.quiz.scope='${sc}'; AI.quiz.value='${v}'; render()">${l}</button>`).join('')}</div>
    <p class="sect">Difficulty</p>
    <div class="rowline" style="flex-wrap:wrap">${DIFFS.map(([k, l]) =>
      `<button class="chip" aria-pressed="${q.difficulty === k}" onclick="AI.quiz.difficulty='${k}'; render()">${l}</button>`).join('')}</div>
    <p class="sect">How many</p>
    <div class="rowline">${[3, 4, 5].map(n =>
        `<button class="chip" aria-pressed="${q.count === n}" onclick="AI.quiz.count=${n}; render()">${n}</button>`).join('')}</div>
    <button class="btn wide" style="margin-top:var(--space-5)" onclick="makeQuiz()" ${q.busy ? 'disabled' : ''}>
      ${q.busy ? 'Writing questions…' : q.items ? 'Generate a new set' : 'Generate the set'}</button>
    ${q.err ? `<p class="note">Could not build the set. Try again.</p>` : ''}
    ${q.busy ? `<div class="skel" style="margin-top:var(--space-5)"><i></i><i></i><i></i><i></i></div>
      <p class="counter">Writing questions with expected answers…</p>` : ''}
  </div>
  ${(q.items || []).map((it, i) => quizCard(it, i)).join('')}`;
}

async function makeQuiz() {
  const q = AI.quiz;
  if (q.busy) return;
  q.busy = true; q.err = null; q.items = null; AI.answers = {}; render();
  try {
    const res = await api('/api/quiz', {
      scope: q.scope, value: q.value, count: q.count, lang: S.lang, difficulty: q.difficulty
    });
    if (res.error) throw new Error(res.error);
    q.items = res.items; q.ms = res._ms; q.model = res.model;
  } catch (e) { q.err = String(e.message || e); }
  q.busy = false; render();
}

async function gradeAnswer(i) {
  const it = AI.quiz.items[i];
  const box = document.getElementById(`ans${i}`);
  const text = box ? box.value.trim() : '';
  if (!text) { toast('Write an answer first — grading an empty box teaches nothing'); return; }
  AI.answers[i] = { text, busy: true }; render();
  try {
    const res = await api('/api/grade', {
      atom_id: it.atom_id, question: it.prompt, expected: it.expected || [], answer: text, lang: S.lang
    });
    if (res.error) throw new Error(res.error);
    AI.answers[i] = { text, grade: res, shown: true };
  } catch (e) { AI.answers[i] = { text, err: String(e.message || e) }; }
  render();
}

/* ---------- per-atom explanation ---------- */
const LEVELS = [['twelve', 'To a twelve-year-old'], ['peer', 'To a classmate'], ['exam', 'Exam wording']];

function explainBlock(id) {
  const e = AI.explain[id] || {};
  return `<div class="explainbox">
    <div class="between"><p class="sect" style="margin:0">Ask the tutor to explain this atom</p></div>
    <div class="rowline" style="flex-wrap:wrap">${LEVELS.map(([k, l]) =>
    `<button class="chip" aria-pressed="${(e.level || 'twelve') === k}" onclick="doExplain('${id}','${k}')">${l}</button>`).join('')}
      <span class="counter">answers in ${S.lang === 'zh' ? '繁體中文' : 'English'}</span></div>
    ${e.busy ? '<div class="skel"><i></i><i></i></div>' : ''}
    ${e.err ? `<p class="note">The call failed: <span class="mono">${esc(e.err)}</span></p>` : ''}
    ${e.text ? `<div class="prose">${md(e.text)}</div>` : ''}
  </div>`;
}

async function doExplain(id, level) {
  AI.explain[id] = { busy: true, level };
  openAtom(id);
  try {
    const res = await api('/api/explain', { atom_id: id, lang: S.lang, level });
    if (res.error) throw new Error(res.error);
    AI.explain[id] = { text: res.explanation, level };
  } catch (e) { AI.explain[id] = { err: String(e.message || e), level }; }
  openAtom(id);
}

/* ---------- bilingual layer ----------
   The Chinese strings in i18n.js were produced by one model pass over every string
   the interface actually renders, then reviewed. Anything without a translation
   stays in English rather than being machine-translated at render time. */
/* strings the dictionary cannot match because a number or a gate name is interpolated */
const ZH_PATTERNS = [
  [/^About (\d+) minutes left to finish\. Next gate is (.+)\.$/, (m, a, b) => `大約還需 ${a} 分鐘完成。下一關是 ${b}。`],
  [/^Start (W\d.+)$/, (m, a) => `開始 ${a}`],
  [/^(\d+) days in a row$/, (m, a) => `連續 ${a} 天`],
  [/^longest (\d+)$/, (m, a) => `最長 ${a} 天`],
  [/^(\d+) questions$/, (m, a) => `${a} 條題目`],
  [/^(\d+) terms$/, (m, a) => `${a} 個詞`],
  [/^(\d+) nodes · (\d+) atoms$/, (m, a, b) => `${a} 個節點 · ${b} 顆原子`],
  [/^Question (\d+) of (\d+)$/, (m, a, b) => `第 ${a} 題，共 ${b} 題`],
  [/^(\d+) atoms in context$/, (m, a) => `脈絡中有 ${a} 顆原子`],
  [/^(\d+) atoms loaded$/, (m, a) => `已載入 ${a} 顆原子`],
  [/^(\d+) awaiting confirmation$/, (m, a) => `${a} 顆待你確認`],
  [/^PDF slides · image only, text read automatically · (\d+) pages$/, (m, a) => `PDF 講義 · 純圖像，文字自動讀取 · ${a} 頁`],
  [/^Rebuild Unit (\d+)$/, (m, a) => `重建 Unit ${a} 框架`],
  [/^Build the Unit (\d+) framework$/, (m, a) => `建立 Unit ${a} 框架`],
  [/^salience (\d+) → (full|short) lesson$/, (m, a, b) => `重要度 ${a} → ${b === 'full' ? '完整講解' : '簡版講解'}`],
  [/^W0 · step (\d+)\/(\d+)$/, (m, a, b) => `W0 · 第 ${a}/${b} 步`],
  [/^Step (\d+)$/, (m, a) => `第 ${a} 步`],
  [/^Uses: (.+)$/, (m, a) => `依據：${a}`]
];

function localize() {
  if (S.lang !== 'zh' || !window.ZH) return;
  const skip = new Set(['SCRIPT', 'STYLE', 'CODE', 'TEXTAREA']);
  const roots = [document.getElementById('view'), document.getElementById('sheet'),
  document.getElementById('rail')];
  for (const root of roots) {
    if (!root) continue;
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (skip.has(n.parentNode.nodeName) || n.parentNode.closest('.prose, .quote, .atom h3, .thumb'))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = []; let n;
    while ((n = it.nextNode())) nodes.push(n);
    for (const node of nodes) {
      const raw = node.textContent, t = raw.trim();
      if (!t) continue;
      if (window.ZH[t]) { node.textContent = raw.replace(t, window.ZH[t]); continue; }
      for (const [re, fn] of ZH_PATTERNS) {
        const m = re.exec(t);
        if (m) { node.textContent = raw.replace(t, fn(...m)); break; }
      }
    }
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => {
      ['placeholder', 'title', 'aria-label'].forEach(a => {
        const v = el.getAttribute(a);
        if (v && window.ZH[v.trim()]) el.setAttribute(a, window.ZH[v.trim()]);
      });
    });
  }
}

function setLang(l) {
  S.lang = l;
  document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en';
  render();
}

/* ---------- Knowledge Summary Card ---------- */
async function generateSummary(atomId) {
  AI.summary.busy = true;
  AI.summary.err = null;
  render();
  try {
    const json = await api('/api/summary', { atom_id: atomId, lang: S.lang });
    if (json.error) {
      AI.summary.err = json.error;
    } else {
      AI.summary.card = json.card;
      // Store in localStorage for spaced repetition review
      const summaries = JSON.parse(localStorage.getItem('knowledgeSummaries') || '{}');
      summaries[atomId] = { ...json.card, generated: Date.now() };
      localStorage.setItem('knowledgeSummaries', JSON.stringify(summaries));
    }
  } catch (e) {
    AI.summary.err = e.message || String(e);
  } finally {
    AI.summary.busy = false;
    render();
  }
}

/* ---------- Layered Why Questioning ---------- */
const whyChains = {}; // Cache: atomId_premise -> chain
async function getWhyChain(atomId, premise) {
  const key = `${atomId}_${premise}`;
  if (whyChains[key]) return whyChains[key];
  try {
    const json = await api('/api/why_chain', { atom_id: atomId, premise, depth: 3, lang: S.lang });
    if (json.chain) {
      whyChains[key] = json.chain;
      return json.chain;
    }
  } catch (e) {
    console.error('Why chain error:', e);
  }
  return null;
}

function renderSummaryCard() {
  const c = AI.summary.card;
  if (!c) return '';
  return `<div class="card summary-card" style="margin-top:var(--space-5)">
    <div class="between"><p class="eyebrow">${G('Knowledge Summary Card', '知識總結卡')}</p>
      <button class="btn sm ghost" onclick="AI.summary.card=null;render()">✕</button></div>
    <div style="margin-top:var(--space-3)">
      <p class="sect">${G('Core Idea', '核心概念')}</p>
      <p class="prose">${esc(c.core_idea || '')}</p>
    </div>
    ${c.key_formula ? `<div style="margin-top:var(--space-3)">
      <p class="sect">${G('Key Formula', '關鍵公式')}</p>
      <div class="prose">${mdi(c.key_formula)}</div>
      <p class="sub">${esc(c.formula_explained || '')}</p>
    </div>` : ''}
    <div style="margin-top:var(--space-3)">
      <p class="sect">${G('Everyday Example', '生活例子')}</p>
      <div class="prose">${md(c.everyday_example || '')}</div>
    </div>
    <div style="margin-top:var(--space-3)">
      <p class="sect">${G('Common Mistake', '常見錯誤')}</p>
      <div class="prose">${md(c.common_mistake || '')}</div>
    </div>
    ${(c.prerequisites || []).length ? `<div style="margin-top:var(--space-3)">
      <p class="sect">${G('Prerequisites', '前置知識')}</p>
      <div class="rowline" style="flex-wrap:wrap">${c.prerequisites.map(p => `<span class="chip">${esc(p)}</span>`).join('')}</div>
    </div>` : ''}
    ${(c.next_steps || []).length ? `<div style="margin-top:var(--space-3)">
      <p class="sect">${G('Next Steps', '接續學習')}</p>
      <div class="rowline" style="flex-wrap:wrap">${c.next_steps.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>
    </div>` : ''}
  </div>`;
}
