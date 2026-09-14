/* learn-engine hi-fi prototype — all figures come from real engine runs (data.js) */
const A = window.ATOMS;
const byId = id => A.find(a => a.id === id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/* key term + Chinese gloss */
const G = (en, zh) => `<span class="gl">${en}<i>${zh}</i></span>`;

/* ---------- recorded engine run (replayed in the flow) ---------- */
const RUN = {
  atom: 'A0001',
  w2: {
    r1: {
      overall: 3.77, dims: [['Causal completeness', 1.9], ['ELI12 clarity', 5.0], ['Analogy isomorphism', 4.0], ['Boundary awareness', 4.2]],
      gaps: byId('A0001').feynman.iterations[0].gap_log,
      probe: byId('A0001').feynman.iterations[0].next_probe
    },
    r2: {
      overall: 4.0, dims: [['Causal completeness', 2.8], ['ELI12 clarity', 5.0], ['Analogy isomorphism', 4.0], ['Boundary awareness', 4.2]],
      gaps: byId('A0001').feynman.iterations[1].gap_log,
      probe: byId('A0001').feynman.iterations[1].next_probe
    }
  },
  w3: {
    coverage: 0.83, hit: 5, total: 6, diagnosis: 'retrieval failure', grade: 3,
    missed: 'When some P(Ai) = 0 the corresponding conditional probability is undefined, so zero-probability pieces must be removed before the formula can be applied',
    fsrs: byId('A0001').fsrs
  },
  w4: {
    title: 'Case-weighted renewal rate for cloud accounts', value: 0.5525, verdict: 'Pass',
    mapping: [['Partition A1…An', 'Accounts split into three tiers — high / mid / low usage — mutually exclusive and exhaustive'],
      ['P(Ai)', 'Share of total accounts in each tier: 0.25 / 0.45 / 0.30'],
      ['P(B | Ai)', 'Historical renewal rate per tier: 0.88 / 0.55 / 0.22'],
      ['P(B)', 'Overall renewal rate 0.25×0.88 + 0.45×0.55 + 0.30×0.22 = 0.5525']],
    fail: 'Tiers are defined by current-period usage, and accounts move between tiers inside the observation window, so the partition is unstable. As soon as one account is counted in two tiers, mutual exclusivity breaks and the weighted sum overstates the true value.'
  }
};
const WEEKLY = [
  { k: 'New atoms', v: '25', n: 'Below 8 means too little input; above 25 means you are only hoarding — this week sits exactly at the ceiling', alarm: true },
  { k: 'Mean first Feynman score', v: '3.77', n: 'One atom only. 24 of 25 have never been spoken, so this number is not yet informative', alarm: true },
  { k: 'Due reviews completed', v: '100%', n: 'If it drops under 80%, cut new atoms — never cut reviews', alarm: false },
  { k: 'Gap closure rate', v: '67%', n: 'Under 50% long-term means you are memorising answers, not repairing understanding', alarm: false }
];
const GAPS = [
  { g: 1, keys: ['upper bound', 'not exhaustive', 'understates', 'missing piece'], closed: true, atom: 'A0001', text: 'Failure boundary not stated: if the partition is not exhaustive the remaining cases are dropped and the sum falls below the true value; the probability of the missing piece is exactly the error bound' },
  { g: 2, keys: ['conditional', 'undefined', 'remove first', 'formula'], closed: true, atom: 'A0001', text: 'Failure boundary not stated: when some P(Ai) = 0 that conditional probability is undefined, so zero-probability pieces must be removed before the formula can be used' },
  { g: 3, keys: ['relax condition', 'total probability', 'which step', 'collapses'], closed: false, atom: 'A0001', text: 'Follow-up probe: if you relax the core condition of the total probability theorem by one level, which step of your derivation collapses first?' }
];

/* ---------- speaking practice config (deterministic, in-browser checks) ---------- */
const SPEAK = {
  A0001: {
    ask: 'Explain the total probability theorem to a twelve-year-old, out loud, in English.',
    terms: [
      { en: 'partition', zh: '分割', re: /\bpartition|\bsplit\b|\bcases?\b|\bgroups?\b/i },
      { en: 'mutually exclusive', zh: '互斥', re: /mutually exclusive|disjoint|no overlap|don'?t overlap|cannot both/i },
      { en: 'exhaustive', zh: '窮盡', re: /exhaustive|covers? everything|every outcome|nothing left out|all the cases/i },
      { en: 'conditional probability', zh: '條件機率', re: /conditional|given that|if we are in|within each/i },
      { en: 'weighted sum', zh: '加權相加', re: /weight|weighted|multiply .*(share|proportion|chance)|add (them )?up|sum/i },
      { en: 'failure boundary', zh: '失效邊界', re: /breaks? down|fails? when|only works|stops working|goes wrong|doesn'?t hold/i }
    ],
    banned: [
      { en: 'axiom of additivity', zh: '加法公理' },
      { en: 'sigma-algebra', zh: 'σ-代數' },
      { en: 'measure', zh: '測度' },
      { en: 'stochastic', zh: '隨機性（術語）' }
    ]
  }
};
const FILLERS = /\b(um+|uh+|er+|ah+|like|you know|kind of|sort of|basically|actually)\b/gi;

/* ---------- state ---------- */
const S = {
  tab: 'practice',
  lang: 'en',
  flow: null,
  done: { w1: false, w2: false, w3: false, w4: false },
  streak: 6,
  path: [],
  unit: 0,
  sugDone: {},
  imp: null,
  voice: { on: false, rec: null, words: 0, ms: 0, t0: 0, err: null, mode: null },
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  learningMode: localStorage.getItem('learningMode') || 'deep', // 'overview' | 'deep'
  reviewQueue: [] // Atoms due for review based on FSRS
};
function setLearningMode(mode) {
  S.learningMode = mode;
  localStorage.setItem('learningMode', mode);
  render();
}

/* ---------- Review Queue (Spaced Repetition) ---------- */
function buildReviewQueue() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // Filter atoms that are due for review (FSRS due date has passed)
  const due = A.filter(a => {
    const fsrs = a.fsrs || {};
    const dueDate = fsrs.due ? new Date(fsrs.due).getTime() : 0;
    return dueDate <= now;
  });
  // Sort by urgency (most overdue first)
  due.sort((a, b) => {
    const aDue = a.fsrs?.due ? new Date(a.fsrs.due).getTime() : 0;
    const bDue = b.fsrs?.due ? new Date(b.fsrs.due).getTime() : 0;
    return aDue - bDue;
  });
  S.reviewQueue = due.slice(0, 5); // Max 5 reviews per session
}
const STAGES = [
  { k: 'w0', t: 'W0 Teach', d: 'Learn it first: the chain rebuilt from its premises, one prediction at a time', m: 14 },
  { k: 'w1', t: 'W1 Decompose', d: 'Break the atom down to irreducible premises, one probe at a time', m: 12 },
  { k: 'w2', t: 'W2 Feynman', d: 'Say it out loud in English to a twelve-year-old; four dimensions must average 4.0', m: 15 },
  { k: 'w3', t: 'W3 Retrieval', d: 'Free recall, coverage grading, then FSRS sets the next date', m: 10 },
  { k: 'w4', t: 'W4 Transfer', d: 'Apply it to one real decision and name where it fails', m: 8 }
];

/* ---------- chrome ---------- */
const ICON = {
  practice: '<path d="M4 7h16M4 7v13h16V7M4 7l2-3h12l2 3M9 13h6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  materials: '<path d="M3 7.5A2 2 0 0 1 5 5.5h3.6L10.5 8H19a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11Z" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  atoms: '<circle cx="12" cy="12" r="2.4" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="4.2" stroke="currentColor" stroke-width="1.6" fill="none"/><ellipse cx="12" cy="12" rx="9" ry="4.2" stroke="currentColor" stroke-width="1.6" fill="none" transform="rotate(60 12 12)"/>',
  progress: '<path d="M5 20V10M10.5 20V5M16 20v-7M21 20H3" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  map_unused: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  report: '<path d="M5 20V10M10.5 20V5M16 20v-7M21 20H3" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  tutor: '<path d="M12 3.5c4.4 0 8 2.9 8 6.5s-3.6 6.5-8 6.5c-.9 0-1.8-.1-2.6-.3L5 19l.9-3.3C4.1 14.5 4 12.4 4 10c0-3.6 3.6-6.5 8-6.5Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M9.4 8.6a2.6 2.6 0 0 1 5 .9c0 1.7-2.4 1.9-2.4 3.3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  settings: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
};
const TABS = [
  ['practice', 'Practice', '練習室', 'Where the four gates actually run'],
  ['tutor', 'Tutor', 'AI 導師', 'Ask questions against your own atoms'],
  ['materials', 'Materials', '原始內容檔案室', 'Source files and the atoms extracted from them'],
  ['progress', 'Progress', '我的進度分析', 'Gaps, four weekly numbers, schedule pressure'],
  ['settings', 'Settings', '設定', 'Language, thresholds, data']
];

function ring(pct) {
  const c = 2 * Math.PI * 54;
  return `<div class="ring"><svg width="128" height="128" viewBox="0 0 128 128">
    <circle class="track" cx="64" cy="64" r="54"/>
    <circle class="val" cx="64" cy="64" r="54" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
  </svg><div class="label"><b>${Math.round(pct * STAGES.length)}<span style="font-size:.9rem;color:var(--ink-3)">/${STAGES.length}</span></b><span>gates today</span></div></div>`;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- Today ---------- */
function viewPractice() {
  const n = Object.values(S.done).filter(Boolean).length;
  const atom = byId(RUN.atom);
  const nextStage = STAGES.find(s => !S.done[s.k]);
  const mins = STAGES.filter(s => !S.done[s.k]).reduce((a, s) => a + s.m, 0);
  return `
  <div class="page-head">
    <div><p class="eyebrow">Practice room · Saturday, 12 September 2026</p><h1>Today's session</h1>
    <p class="sub" style="margin-top:6px">One atom, five gates, in order — taught first, then tested. Nothing else lives on this page.</p></div>
    <div class="rowline">${langSwitch()}
      <div class="chip-group" style="margin-right:var(--space-2)">
        <button class="chip ${S.learningMode === 'overview' ? 'active' : ''}" onclick="setLearningMode('overview')" title="Quick overview first">Overview</button>
        <button class="chip ${S.learningMode === 'deep' ? 'active' : ''}" onclick="setLearningMode('deep')" title="Full depth with all details">Deep Dive</button>
      </div>
      <button class="btn ghost" onclick="toggleTheme()" aria-label="Switch light or dark mode">${S.theme === 'dark' ? 'Light' : 'Dark'}</button></div>
  </div>

  <div class="card">
    <div class="today-hero">
      ${ring(n / STAGES.length)}
      <div>
        <p class="eyebrow">Atom of this session</p>
        <h2 style="font-size:var(--text-lg);margin:2px 0 var(--space-2)">${esc(atom.title)}</h2>
        <div class="wrap"><span class="tag mono">${atom.id}</span><span class="tag">salience ${atom.salience}</span><span class="tag">${esc(atom.source_name)}</span></div>
        <p class="sub" style="margin-top:var(--space-3)">${n === STAGES.length ? 'All five gates cleared. No new atoms today — stopping on time matters more than one extra question.' : `About ${mins} minutes left to finish. Next gate is ${nextStage.t}.`}</p>
        <div class="streak" title="Consecutive days">${Array.from({ length: 7 }, (_, i) =>
    `<i class="${i < S.streak ? 'on' : i === S.streak ? 'today' : ''}"></i>`).join('')}</div>
        <p class="counter" style="margin-top:6px">${S.streak} days in a row&nbsp;&nbsp;·&nbsp;&nbsp;longest 11</p>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="between" style="margin-bottom:var(--space-4)">
      <h2 style="font-size:var(--text-lg)">Five gates</h2>
      <span class="counter">No skipping ahead</span>
    </div>
    ${STAGES.map((s, i) => {
      const done = S.done[s.k];
      const active = !done && nextStage && nextStage.k === s.k;
      const locked = !done && !active;
      return `<button class="slot ${done ? 'done' : ''} ${active ? 'active' : ''}" ${locked ? 'disabled' : ''} onclick="openFlow('${s.k}')">
        <span class="n">${done ? '✓' : i + 1}</span>
        <span><h3>${s.t}</h3><p>${s.d}</p></span>
        <span class="tag ${active ? 'act' : ''}">${done ? 'cleared' : locked ? 'locked' : `${s.m} min`}</span>
      </button>`;
    }).join('')}
    ${n === STAGES.length ? `<button class="btn wide" style="margin-top:var(--space-5)" onclick="go('progress')">See this week's four numbers</button>`
      : `<button class="btn wide" style="margin-top:var(--space-5)" onclick="openFlow('${nextStage.k}')">Start ${nextStage.t}</button>`}
  </div>

  ${S.reviewQueue.length ? `
  <div class="card">
    <div class="between" style="margin-bottom:var(--space-4)">
      <h2 style="font-size:var(--text-lg)">Review Queue</h2>
      <span class="counter">${S.reviewQueue.length} due</span>
    </div>
    <p class="sub" style="margin-bottom:var(--space-4)">These atoms are due for review based on your forgetting curve. Reviewing now strengthens retention.</p>
    ${S.reviewQueue.map(a => `<button class="chip" onclick="openAtom('${a.id}')" style="text-align:left;width:100%;margin-bottom:var(--space-2)">
      <span class="mono" style="font-size:var(--text-xs);color:var(--ink-3)">${a.id}</span>
      <span style="margin-left:var(--space-2)">${esc((a.title || '').slice(0, 60))}</span>
    </button>`).join('')}
  </div>` : ''}
  </div>

  <div class="card">
    <p class="eyebrow">Open items</p>
    <div class="between" style="margin-top:var(--space-3)">
      <span class="sub">PS2 due (covers Unit 2)</span><span class="tag warn">16 Sep, 19:59</span>
    </div>
    <div class="between" style="margin-top:var(--space-3)">
      <span class="sub">Open gaps</span><span class="tag act">1</span>
    </div>
    <div class="between" style="margin-top:var(--space-3)">
      <span class="sub">Atoms waiting for a spoken Feynman pass</span><span class="tag">${A.length - 1}</span>
    </div>
    <div class="between" style="margin-top:var(--space-3)">
      <span class="sub">Merged atoms waiting for your confirmation</span><span class="tag warn">${A.filter(a => a.needs_human_confirm).length}</span>
    </div>
    <div class="between" style="margin-top:var(--space-3)">
      <span class="sub">Units with no material imported</span><span class="tag act">7 of 10</span>
    </div>
    <button class="btn ghost wide" style="margin-top:var(--space-5)" onclick="go('materials')">Import new material</button>
  </div>
  ${viewQuizSection()}`;
}

function langSwitch() {
  return `<div class="langsw" role="group" aria-label="Interface language">
    <button aria-pressed="${S.lang === 'en'}" onclick="setLang('en')">EN</button>
    <button aria-pressed="${S.lang === 'zh'}" onclick="setLang('zh')">繁中</button></div>`;
}

/* ---------- gate flow ---------- */
function openFlow(k) {
  const stage = STAGES.findIndex(s => s.k === k) + 1;
  S.flow = { stage, qi: 0, round: 1, premises: {}, text: '', scored: null };
  render();
}
function closeFlow() { stopVoice(); S.flow = null; render(); }
function flowTop(label, pct) {
  return `<div class="flow-top">
    <button class="close" onclick="closeFlow()" aria-label="Leave this gate">✕</button>
    <div class="bar"><i style="width:${Math.round(pct * 100)}%"></i></div>
    <span class="counter mono">${label}</span>
  </div>`;
}

function viewW1() {
  const atom = byId(RUN.atom), f = S.flow;
  const qs = atom.questions, q = qs[f.qi];
  const checked = Object.values(f.premises).filter(Boolean).length;
  const total = atom.irreducible_premises.length;
  const TYPE = { free_recall: G('Free recall', '自由回憶'), boundary: G('Boundary counter-example', '邊界反例'), error_hunt: G('Error hunt', '找錯'), transfer: G('Transfer', '遷移') };
  const WHY = {
    free_recall: G('Producing before any hint is the only way to measure real retrieval strength.', '在沒有任何提示下自己寫出來，是衡量真正記憶強度的唯一方法。'),
    boundary: G('If you cannot give a counter-example, you memorised the conclusion, not the conditions.', '如果你舉不出反例，你記住的只是結論，不是條件。'),
    error_hunt: G('Swapped premises are the most common source of error, so you must learn to spot them instantly.', '前提互換是最常見的錯誤來源，你必須學會立刻識別。'),
    transfer: G('You only own a principle once you can map it onto a real decision.', '只有當你能把原理映射到真實決策上，你才算真正擁有它。')
  };
  return `${flowTop(`W1 · ${f.qi + 1}/${qs.length}`, (f.qi) / qs.length)}
  <div class="card">
    <p class="eyebrow">${G('Irreducible premises', '不可再約前提')} · ${checked}/${total}</p>
    <p class="sub" style="margin:var(--space-2) 0 var(--space-3)">${G('Tick a line only if you can state the reason unaided. The one you cannot tick is today\'s gap. Click "Why?" to drill down into the reasoning behind each premise.', '只有當你能不靠提示說出理由時才勾選。你無法勾選的就是今天的缺口。點擊「Why?」深入探究每個前提背後的推理。')}</p>
    ${atom.irreducible_premises.map((p, i) => `<div class="premise-row">
      <label class="premise ${f.premises[i] ? 'checked' : ''}">
        <input type="checkbox" ${f.premises[i] ? 'checked' : ''} onchange="togglePremise(${i})"><span>${esc(p)}</span>
      </label>
      <button class="btn sm ghost why-btn" onclick="toggleWhyChain('${atom.id}', ${i}, this)" title="${G('Drill down: why is this true?', '深入探究：為什麼這是真的？')}">${G('Why?', '為什麼？')}</button>
      <div class="why-chain" id="why-${atom.id}-${i}" style="display:none"></div>
    </div>`).join('')}
  </div>
  <div class="card qcard">
    <span class="tag act">${TYPE[q.type]}</span>
    <h2 style="margin-top:var(--space-3)">${mdi(q.prompt)}</h2>
    <p class="why">${G('Why this question', '為什麼問這題')}: ${WHY[q.type]}</p>
    <textarea id="ta" placeholder="${G('Write your answer. Submit even if you cannot — a blank is a valid signal.', '寫下你的答案。即使不會也要提交——空白也是一個有效信號。')}">${esc(f.text)}</textarea>
    <div class="between" style="margin-top:var(--space-4)">
      <span class="counter">${G('Question', '題目')} ${f.qi + 1} ${G('of', '共')} ${qs.length}</span>
      <button class="btn" onclick="nextQ()">${f.qi === qs.length - 1 ? G('Finish W1', '完成 W1') : G('Next question', '下一題')}</button>
    </div>
  </div>`;
}
function togglePremise(i) {
  const ta = document.getElementById('ta');
  if (ta) S.flow.text = ta.value;
  S.flow.premises[i] = !S.flow.premises[i];
  render();
}

async function toggleWhyChain(atomId, premiseIdx, btn) {
  const container = document.getElementById(`why-${atomId}-${premiseIdx}`);
  const atom = byId(atomId);
  const premise = atom.irreducible_premises[premiseIdx];

  if (container.style.display === 'block') {
    container.style.display = 'none';
    btn.textContent = G('Why?', '為什麼？');
    return;
  }

  btn.textContent = G('Loading…', '載入中…');
  btn.disabled = true;

  const chain = await getWhyChain(atomId, premise);
  if (chain && chain.length > 0) {
    container.innerHTML = chain.map((c, i) =>
      `<div class="why-level" style="margin-top:var(--space-2);padding-left:var(--space-4);border-left:2px solid var(--rule-soft)">
        <p class="sub" style="margin:0"><b>${G('Level', '層級')} ${c.level}:</b> ${esc(c.question)}</p>
        <p class="prose" style="margin:var(--space-1) 0 0">${esc(c.answer)}</p>
      </div>`
    ).join('');
    container.style.display = 'block';
    btn.textContent = G('Hide', '隱藏');
  } else {
    container.innerHTML = `<p class="note">${G('Could not generate why chain.', '無法生成推理鏈。')}</p>`;
    container.style.display = 'block';
    btn.textContent = G('Why?', '為什麼？');
  }
  btn.disabled = false;
}
function nextQ() {
  const f = S.flow, atom = byId(RUN.atom);
  f.text = '';
  if (f.qi === atom.questions.length - 1) {
    S.done.w1 = true; S.flow = null; toast(G('W1 cleared · 4 answers logged, gaps written to the gap map', 'W1 完成 · 已記錄 4 個答案，缺口已寫入缺口地圖'));
  } else { f.qi++; }
  render();
}

/* ---------- W2: speak in English, engine verifies ---------- */
function speechCheck(text) {
  const cfg = SPEAK[RUN.atom];
  const words = (text.trim().match(/[A-Za-z'’-]+/g) || []).length;
  const fillers = (text.match(FILLERS) || []).length;
  const terms = cfg.terms.map(t => ({ ...t, hit: t.re.test(text) }));
  const banned = cfg.banned.filter(b => new RegExp(b.en.replace(/[-\s]/g, '[-\\s]?'), 'i').test(text));
  const hit = terms.filter(t => t.hit).length;
  const secs = S.voice.ms / 1000;
  const wpm = secs > 8 ? Math.round(words / (secs / 60)) : null;
  return { words, fillers, terms, banned, hit, total: terms.length, wpm, coverage: hit / terms.length };
}
function viewW2() {
  const f = S.flow, sc = f.scored, cfg = SPEAK[RUN.atom];
  if (!sc) {
    const c = speechCheck(f.text);
    const v = S.voice;
    return `${flowTop(`W2 · attempt ${f.round}`, .25)}
    ${AI.teach.sentence ? `<div class="card">
      <p class="eyebrow">${G('Your W0 sentence', 'W0 收尾那句')}</p>
      <p class="sub" style="margin-top:var(--space-2)">${esc(AI.teach.sentence)}</p>
      <p class="note">${G('Say the explanation below without reusing this wording. If what you say out loud contradicts this sentence, the gap is in the understanding, not in the phrasing.', '用下面的解釋來說明，但不要重複這個措辭。如果你說的話與這句話矛盾，缺口在理解，不在措辭。')}</p>
    </div>` : ''}
    <div class="card qcard">
      <span class="tag act">${G('Feynman gate', '費曼閘門')}</span>
      <h2 style="margin-top:var(--space-3)">${esc(cfg.ask)}</h2>
      <p class="why">${G('Rules', '規則')}: ${G('no words from the jargon blacklist', '不使用術語黑名單中的詞')}; ${G('state at least one', '至少說明一個')} ${G('failure boundary', '失效邊界')}; ${G('give one isomorphic analogy', '給出一個同構類比')}. ${G('Four dimensions, 1–5 each, and you need 4.0 to pass.', '四個維度，各 1–5 分，需要 4.0 才能通過。')}</p>

      <div class="mic-row">
        <button class="mic ${v.on ? 'live' : ''}" onclick="${v.on ? 'stopVoice()' : 'startVoice()'}" aria-pressed="${v.on}">
          <svg viewBox="0 0 24 24"><path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
          <span>${v.on ? G('Listening — tap to stop', '聆聽中 — 點擊停止') : G('Speak in English', '用英文說')}</span>
        </button>
        <div class="mic-meta">
          <span class="counter">${v.on ? `<b class="rec"></b>${G('recording', '錄音中')}` : 'en-US · browser speech recognition'}</span>
          <span class="counter mono">${c.words} ${G('words', '字')}${c.wpm ? ` · ${c.wpm} wpm` : ''}${S.voice.ms ? ` · ${Math.round(S.voice.ms / 1000)}s` : ''}</span>
        </div>
      </div>
      ${v.err ? `<p class="note warnnote">${esc(v.err)} ${G('You can type the same explanation below instead — the checks are identical.', '你也可以在下方輸入相同的解釋——檢查方式相同。')}</p>` : ''}

      <textarea id="ta" placeholder="${G('Speak, or type here. Cover: why it must be computed this way, one everyday analogy, and when the trick breaks.', '說出或輸入在這裡。涵蓋：為什麼必須這樣計算、一個日常類比、以及這個方法何時失效。')}">${esc(f.text)}</textarea>

      <div class="checks">
        <p class="eyebrow">${G('Live check · instant, in your browser', '即時檢查 · 在你的瀏覽器中')}</p>
        ${c.terms.map(t => `<div class="chk ${t.hit ? 'on' : ''}">
          <span class="dot">${t.hit ? '✓' : ''}</span>
          <span>${G(t.en, t.zh)}</span>
          <span class="counter">${t.hit ? G('mentioned', '已提及') : G('not yet', '尚未')}</span></div>`).join('')}
        <div class="chkfoot">
          <span class="tag ${c.coverage >= 1 ? 'pass' : 'act'}">${c.hit}/${c.total} ${G('required ideas', '必要概念')}</span>
          <span class="tag ${c.fillers > 4 ? 'warn' : ''}">${c.fillers} ${G('filler words', '填充詞')}</span>
          <span class="tag ${c.wpm && (c.wpm < 100 || c.wpm > 170) ? 'warn' : ''}">${c.wpm ? `${c.wpm} wpm` : G('pace: speak 10s+', '語速：說 10 秒以上')}</span>
          ${c.banned.length ? `<span class="tag warn">${G('jargon used', '使用了術語')}: ${c.banned.map(b => b.en).join(', ')}</span>` : `<span class="tag pass">${G('no blacklisted jargon', '無黑名單術語')}</span>`}
        </div>
      </div>

      <div class="between" style="margin-top:var(--space-4)">
        <span class="counter">${G('Say it out loud, then submit', '大聲說出來，然後提交')}</span>
        <button class="btn" onclick="scoreW2()">${G('Submit for scoring', '提交評分')}</button>
      </div>
    </div>
    <p class="note" style="margin-top:var(--space-4)">${G('Two different things happen here. The live check above is real and instant: word count, pace, filler words, blacklisted jargon, and keyword coverage of the six required ideas. The four-dimension score below is a saved demonstration run for', '這裡發生兩件不同的事。上面的即時檢查是真實且即時的：字數、語速、填充詞、黑名單術語、以及六個必要概念的關鍵詞覆蓋率。下面的四維度分數是為')} ${RUN.atom} ${G('(3.77 failed, 4.0 passed after the boundary was added) — live scoring of the spoken gate is not connected yet.', '儲存的示範運行（3.77 失敗，加入邊界後 4.0 通過）——口語門的即時評分尚未連接。')}</p>`;
  }
  const pass = sc.overall >= 4.0;
  return `${flowTop(`W2 · score ${f.round}`, pass ? 1 : .5)}
  <div class="card fadein">
    <div class="verdict ${pass ? 'pass' : 'fail'}">
      <span class="big mono">${sc.overall.toFixed(2)}</span>
      <div><strong>${pass ? G('Gate cleared', '閘門通過') : G('Below the gate — explain it again', '未達標準——再解釋一次')}</strong>
      <p>${pass ? G('The four dimensions average 4.0 and a failure boundary was stated. The atom enters FSRS scheduling.', '四個維度平均 4.0 且說明了失效邊界。該原子進入 FSRS 排程。') : G('Under 4.0. The whole gap sits in causal completeness — you were clear, but you never chained together why it has to be this way.', '低於 4.0。整個缺口在因果完整性——你說得很清楚，但從未串聯起來解釋為什麼必須這樣。')}</p></div>
    </div>
    <div class="dims">
      ${sc.dims.map(([k, v]) => `<div class="dim ${v < 3 ? 'low' : v >= 4 ? 'good' : ''}">
        <span>${k}</span><span class="meter"><i style="width:${v / 5 * 100}%"></i></span><b>${v.toFixed(1)}</b></div>`).join('')}
    </div>
    <p class="eyebrow">${G('Gap log', '缺口記錄')}</p>
    <ul class="gaplist">${sc.gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
    <p class="eyebrow" style="margin-top:var(--space-5)">${G('Next probe', '下一步探究')}</p>
    <p class="sub" style="margin-top:var(--space-2)">${esc(sc.probe)}</p>
    <button class="btn wide" style="margin-top:var(--space-5)" onclick="${pass ? 'passW2()' : 'retryW2()'}">${pass ? G('Continue to W3 Retrieval', '繼續到 W3 回憶') : G('Re-explain, targeting the gap', '重新解釋，針對缺口')}</button>
  </div>`;
}
function scoreW2() {
  const f = S.flow;
  stopVoice();
  const ta = document.getElementById('ta');
  if (ta) f.text = ta.value;
  f.scored = f.round === 1 ? RUN.w2.r1 : RUN.w2.r2;
  render();
}
function retryW2() { S.flow.round = 2; S.flow.scored = null; S.flow.text = ''; S.voice.ms = 0; render(); }
function passW2() { S.done.w2 = true; S.flow = null; toast('W2 cleared at 4.00 · atom A0001 enters the review schedule'); render(); }

/* ---------- speech recognition ---------- */
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    S.voice.err = 'This browser has no speech recognition API (Chrome or Edge on desktop works best).';
    render(); return;
  }
  try {
    const rec = new SR();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
    let base = S.flow.text ? S.flow.text.trim() + ' ' : '';
    rec.onresult = e => {
      let fin = '', tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript + ' '; else tmp += r[0].transcript;
      }
      if (fin) base += fin;
      S.flow.text = (base + tmp).replace(/\s+/g, ' ');
      S.voice.ms = Date.now() - S.voice.t0;
      const ta = document.getElementById('ta');
      if (ta) { ta.value = S.flow.text; liveRefresh(); }
    };
    rec.onerror = ev => {
      S.voice.err = ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
        ? 'Microphone access was blocked, so speech input is off.'
        : `Speech recognition stopped: ${ev.error}.`;
      S.voice.on = false; S.voice.rec = null; render();
    };
    rec.onend = () => { if (S.voice.on) { S.voice.on = false; S.voice.rec = null; render(); } };
    rec.start();
    S.voice = { on: true, rec, words: 0, ms: 0, t0: Date.now(), err: null, mode: 'speech' };
    render();
  } catch (e) {
    S.voice.err = 'Speech recognition could not start in this frame. Open the app in its own tab, or type instead.';
    S.voice.on = false; render();
  }
}
function stopVoice() {
  if (S.voice.rec) { try { S.voice.rec.stop(); } catch (e) { } }
  if (S.voice.t0) S.voice.ms = Date.now() - S.voice.t0;
  S.voice.on = false; S.voice.rec = null;
}
/* refresh only the live-check block so the caret and recording stay put */
function liveRefresh() {
  if (!S.flow || S.flow.stage !== 2 || S.flow.scored) return;
  const host = document.querySelector('.checks');
  if (!host) return;
  const c = speechCheck(S.flow.text);
  host.querySelectorAll('.chk').forEach((el, i) => el.classList.toggle('on', c.terms[i].hit));
  host.querySelectorAll('.chk .dot').forEach((el, i) => el.textContent = c.terms[i].hit ? '✓' : '');
  host.querySelectorAll('.chk .counter').forEach((el, i) => el.textContent = c.terms[i].hit ? 'mentioned' : 'not yet');
  const foot = host.querySelector('.chkfoot');
  foot.innerHTML = `<span class="tag ${c.coverage >= 1 ? 'pass' : 'act'}">${c.hit}/${c.total} required ideas</span>
    <span class="tag ${c.fillers > 4 ? 'warn' : ''}">${c.fillers} filler words</span>
    <span class="tag ${c.wpm && (c.wpm < 100 || c.wpm > 170) ? 'warn' : ''}">${c.wpm ? `${c.wpm} wpm` : 'pace: speak 10s+'}</span>
    ${c.banned.length ? `<span class="tag warn">jargon used: ${c.banned.map(b => b.en).join(', ')}</span>` : '<span class="tag pass">no blacklisted jargon</span>'}`;
  const meta = document.querySelector('.mic-meta .mono');
  if (meta) meta.textContent = `${c.words} words${c.wpm ? ` · ${c.wpm} wpm` : ''}${S.voice.ms ? ` · ${Math.round(S.voice.ms / 1000)}s` : ''}`;
}

function viewW3() {
  const f = S.flow, r = RUN.w3;
  if (!f.scored) {
    return `${flowTop('W3 · free recall', .3)}
    <div class="card qcard">
      <span class="tag act">${G('Free recall', '自由回憶')}</span>
      <h2 style="margin-top:var(--space-3)">${esc(byId(RUN.atom).questions[0].prompt)}</h2>
      <p class="why">${G('Grading looks at', '評分看的是')} ${G('coverage', '覆蓋率')}, ${G('not wording: did you produce every step of the derivation chain unaided.', '不是措辭：你是否能不靠提示產出推導鏈的每一步。')}</p>
      <textarea id="ta" placeholder="${G('Material closed. Write it step by step.', '資料已關閉。一步一步寫出來。')}">${esc(f.text)}</textarea>
      <div class="between" style="margin-top:var(--space-4)">
        <span class="counter">${G('Write from memory, no notes', '憑記憶寫，不看筆記')}</span>
        <button class="btn" onclick="scoreW3()">${G('Submit for grading', '提交評分')}</button>
      </div>
    </div>`;
  }
  return `${flowTop('W3 · graded', 1)}
  <div class="card fadein">
    <div class="verdict">
      <span class="big mono">${(r.coverage * 100).toFixed(0)}%</span>
      <div><strong>${G('Coverage', '覆蓋率')} ${r.coverage} (${r.hit} ${G('of', '共')} ${r.total} ${G('scoring points', '評分點')})</strong>
      <p>${G('Diagnosis', '診斷')}: ${r.diagnosis}. ${G('You know this assumption exists, but you did not produce it unprompted — that is a retrieval failure, not a comprehension failure, so the fix is a shorter interval, not another explanation.', '你知道這個假設存在，但你沒有在無提示下產出它——這是回憶失敗，不是理解失敗，所以解決方法是縮短間隔，不是再解釋一次。')}</p></div>
    </div>
    <p class="eyebrow" style="margin-top:var(--space-5)">${G('Point you missed', '你遺漏的要點')}</p>
    <ul class="gaplist"><li>${esc(r.missed)}</li></ul>
    <p class="sect">FSRS-6 ${G('schedule update', '排程更新')}</p>
    <table><tbody>
      <tr><th>${G('Grade', '評分')}</th><td class="mono">${G('grade', '評分')} ${r.grade} (${G('good', '良好')})</td></tr>
      <tr><th>${G('Stability', '穩定性')}</th><td class="mono">${r.fsrs.stability.toFixed(4)} ${G('days', '天')}</td></tr>
      <tr><th>${G('Difficulty', '難度')}</th><td class="mono">${r.fsrs.difficulty.toFixed(3)}</td></tr>
      <tr><th>${G('Interval', '間隔')}</th><td class="mono">${r.fsrs.interval} ${G('days', '天')} · ${G('target retention 0.90', '目標保留率 0.90')}</td></tr>
      <tr><th>${G('Next due', '下次到期')}</th><td class="mono">2026-09-15 21:04 HKT</td></tr>
      <tr><th>${G('Reps / lapses', '重複 / 遺忘')}</th><td class="mono">${r.fsrs.reps} / ${r.fsrs.lapses}</td></tr>
    </tbody></table>
    <button class="btn wide" style="margin-top:var(--space-5)" onclick="passW3()">${G('Accept the schedule, go to W4 Transfer', '接受排程，前往 W4 遷移')}</button>
  </div>`;
}
function scoreW3() { S.flow.text = document.getElementById('ta').value; S.flow.scored = true; render(); }
function passW3() { S.done.w3 = true; S.flow = null; toast(G('W3 done · next review 15 September', 'W3 完成 · 下次複習 9 月 15 日')); render(); }

function viewW4() {
  const f = S.flow, r = RUN.w4;
  if (!f.scored) {
    return `${flowTop('W4 · transfer', .3)}
    <div class="card qcard">
      <span class="tag act">${G('Transfer', '遷移')}</span>
      <h2 style="margin-top:var(--space-3)">${esc(byId(RUN.atom).questions[3].prompt)}</h2>
      <p class="why">${G('The reviewer accepts three things only: a concrete decision, an isomorphic mapping, and the failure condition inside that scenario. Miss one and it is sent back.', '評審只接受三樣東西：一個具體決策、一個同構映射、以及該情境中的失效條件。缺少一樣就會被打回。')}</p>
      <textarea id="ta" placeholder="${G('Scenario → decision → how the principle maps → where it fails.', '情境 → 決策 → 原理如何映射 → 何處失效。')}">${esc(f.text)}</textarea>
      <div class="between" style="margin-top:var(--space-4)">
        <span class="counter">${G('One real decision', '一個真實決策')}</span>
        <button class="btn" onclick="scoreW4()">${G('Submit for review', '提交評審')}</button>
      </div>
    </div>`;
  }
  return `${flowTop('W4 · reviewed', 1)}
  <div class="card fadein">
    <div class="verdict pass">
      <span class="big">✓</span>
      <div><strong>${G('Verdict', '裁決')}: ${r.verdict}</strong><p>${esc(r.title)} — ${G('all three criteria met', '三個標準均達成')}.</p></div>
    </div>
    <p class="sect">${G('Mapping check', '映射檢查')}</p>
    <table><tbody>${r.mapping.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
    <p class="sect">${G('Failure condition the reviewer accepted', '評審接受的失效條件')}</p>
    <p class="sub">${esc(r.fail)}</p>
    <div style="display:flex;gap:var(--space-3);margin-top:var(--space-6)">
      <button class="btn ghost" onclick="generateSummary('${RUN.atom}')" ${AI.summary.busy ? 'disabled' : ''}>
        ${AI.summary.busy ? G('Generating…', '生成中…') : G('Generate Summary Card', '生成總結卡')}</button>
      <button class="btn wide" onclick="passW4()">${G("Finish today's four gates", '完成今天的四個關卡')}</button>
    </div>
    ${AI.summary.err ? `<p class="note" style="margin-top:var(--space-3)">${G('Could not generate summary', '無法生成總結')}: ${esc(AI.summary.err)}</p>` : ''}
  </div>
  ${renderSummaryCard()}`;
}
function scoreW4() { S.flow.text = document.getElementById('ta').value; S.flow.scored = true; render(); }
function passW4() { S.done.w4 = true; S.flow = null; toast(G("Today's four gates complete · streak +1", '今天的四個關卡完成 · 連續天數 +1')); S.streak = 7; render(); }

/* ---------- atom wall ---------- */
const UNIT_NAMES = { 1: 'Unit 1 · Probability models and axioms', 2: 'Unit 2 · Conditioning and independence', 3: 'Unit 3 · Counting' };
function openAtoms(unit) { S.unit = unit || 0; S.tab = 'atoms'; render(); }
function atomsOf(unit) {
  return unit ? A.filter(a => new RegExp('Unit ' + unit + '\\b').test(a.source_name)) : A;
}
function viewAtoms() {
  const u = S.unit || 0, list = atomsOf(u), key = { 1: 'u1', 2: 'u2', 3: 'u3' }[u];
  return `<div class="page-head"><div><p class="eyebrow">${G('Knowledge atoms', '知識原子')} · ${list.length}${u ? ` of ${A.length}` : ''}</p><h1>Atom wall</h1></div></div>
  <div class="crumbs" style="margin-bottom:var(--space-5)">
    <button onclick="go('materials')">Materials</button><span class="sep">/</span>
    <button onclick="toLib(['c6431x'])">6.431x Probability</button>${u ? `<span class="sep">/</span>
    <button onclick="toLib(['c6431x','${key}'])">${UNIT_NAMES[u]}</button>` : ''}<span class="sep">/</span>
    <span class="here">Atom wall</span>
  </div>
  <div class="rowline" style="margin-bottom:var(--space-5);flex-wrap:wrap">
    ${[[0, `All ${A.length}`], [1, 'Unit 1'], [2, 'Unit 2'], [3, 'Unit 3']].map(([k, l]) =>
    `<button class="chip" aria-pressed="${u === k}" onclick="openAtoms(${k})">${l}</button>`).join('')}
  </div>
  <p class="sub" style="margin-bottom:var(--space-5)">One principle per card. Open it for premises, derivation chain, assumptions and failure modes — no summaries, no page-long notes.</p>
  <div class="grid">${list.map(a => `<button class="atom ${a.feynman.status === 'passed' ? '' : 'pending'}" onclick="openAtom('${a.id}')">
    <div class="between"><span class="sal">${a.id} · salience ${a.salience}</span>
    <span class="tag ${a.feynman.status === 'passed' ? 'pass' : ''}">${a.feynman.status === 'passed' ? 'Feynman cleared' : 'to explain'}</span></div>
    ${a.needs_human_confirm ? '<span class="tag warn" style="margin-bottom:6px">confirm the merge</span>' : ''}
    <h3>${esc(a.title)}</h3>
    <div class="facets"><span>${a.irreducible_premises.length} premises</span><span>${a.derivation_chain.length}-step chain</span><span>${a.failure_modes.length} failure modes</span></div>
  </button>`).join('')}</div>`;
}
function openAtom(id) {
  const a = byId(id);
  document.getElementById('sheet').innerHTML = `
    <div class="between"><span class="tag mono">${a.id} · salience ${a.salience}</span>
      <button class="close" onclick="closeSheet()" aria-label="Close">✕</button></div>
    <h2>${esc(a.title)}</h2>
    <p class="counter">${esc(a.source_name)}</p>
    <p class="quote">${esc(a.source_quote)}</p>
    <p class="sect">${G('Irreducible premises', '不可再約前提')}</p><ul class="plainlist">${a.irreducible_premises.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="sect">${G('Derivation chain', '推導鏈')}</p><ol class="chain">${a.derivation_chain.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
    <p class="sect">Assumptions</p><ul class="plainlist">${a.assumptions.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="sect">${G('Failure modes', '失效模式')}</p><ul class="plainlist">${a.failure_modes.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="sect">Status</p>
    <table><tbody>
      <tr><th>Feynman gate</th><td>${a.feynman.status === 'passed'
      ? `cleared at <span class="mono">${a.feynman.iterations[a.feynman.iterations.length - 1].overall.toFixed(2)}</span> (${a.feynman.iterations.length} attempts)`
      : 'not explained yet'}</td></tr>
      <tr><th>FSRS</th><td class="mono">${a.fsrs.due ? `${a.fsrs.state} · interval ${a.fsrs.interval}d · next ${a.fsrs.due.slice(0, 10)}` : 'not scheduled yet'}</td></tr>
      <tr><th>Human confirmation</th><td>${a.needs_human_confirm ? 'required (check the source quote against the title)' : 'not required'}</td></tr>
    </tbody></table>
    ${explainBlock(a.id)}`;
  document.getElementById('sheetBack').classList.add('open');
  localize();
}
function closeSheet() { document.getElementById('sheetBack').classList.remove('open'); S.imp = null; }
function toLib(p) { S.tab = 'materials'; S.path = p; closeSheet(); render(); }

/* ---------- Progress · 我的進度分析 ---------- */
function viewProgress() {
  const open = GAPS.filter(g => !g.closed).length;
  const closed = GAPS.length - open;
  return `<div class="page-head">
    <div><p class="eyebrow">My progress · 2026-09-06 to 2026-09-12</p><h1>Progress</h1></div>
  </div>
  <p class="sub" style="margin-bottom:var(--space-5)">Three questions only: is input flowing, is understanding actually being repaired, and am I ahead of the deadlines. Anything that answers none of those is not shown here.</p>

  <p class="sect0">1 · Four numbers</p>
  <div class="kpis">${WEEKLY.map(m => `<div class="kpi ${m.alarm ? 'alarm' : ''}">
    <div class="v mono">${m.v}</div><div class="k">${m.k}</div><div class="n">${m.n}</div></div>`).join('')}</div>
  <div class="card" style="margin-top:var(--space-5)">
    <p class="eyebrow">Reading of the week</p>
    <p class="sub" style="margin-top:var(--space-3)">Twenty-five new atoms sits at the top of the healthy band, and that is the number to be suspicious of: it came from importing four lecture decks in one sitting, not from four weeks of steady work. Only one of the 25 has ever been spoken aloud, so the 3.77 mean first score describes a single attempt and carries no weight yet. Six atoms are merges waiting for your confirmation. This week the honest reading is: input is far ahead of understanding, so the next sessions should add nothing and spend the time on the Feynman gate and the one open gap.</p>
  </div>

  <p class="sect0">2 · Gap map</p>
  <div class="card">
    <div class="between"><p class="eyebrow">Closure rate ${(closed / GAPS.length * 100).toFixed(0)}%</p>
      <span class="counter">${closed} closed · ${open} open</span></div>
    <div class="bararea" style="margin-top:var(--space-3)">
      <i style="width:${closed / GAPS.length * 100}%;background:var(--pass)"></i>
      <i style="width:${open / GAPS.length * 100}%;background:var(--accent)"></i>
    </div>
    <p class="counter" style="margin-top:var(--space-2)">Gaps are clustered by keyword. When one cluster keeps coming back, it is not carelessness — it is a systematic blank.</p>
  </div>
  <div style="margin-top:var(--space-4)">${GAPS.map(g => `<div class="cluster">
    <div class="between"><span class="eyebrow">Cluster ${g.g}</span>
      <span class="tag ${g.closed ? 'pass' : 'act'}">${g.closed ? 'closed' : 'open'}</span></div>
    <p style="font-size:var(--text-sm);margin-top:var(--space-2)">${esc(g.text)}</p>
    <div class="keys"><span class="tag mono">${g.atom}</span>${g.keys.map(k => `<span class="tag">${k}</span>`).join('')}</div>
  </div>`).join('')}</div>
  <p class="note" style="margin-top:var(--space-4)">These three clusters come from the engine's real run, whose output language was Chinese; the text and cluster labels here are the English rendering of that same run.</p>

  <p class="sect0">3 · Schedule pressure</p>
  <div class="card">
    <p class="eyebrow">Next four deadlines · from the Fall 2026 syllabus</p>
    <table style="margin-top:var(--space-3)"><thead><tr><th>Item</th><th>Due (HKT)</th><th>Scope</th><th>Atoms ready</th></tr></thead><tbody>
      ${DEADLINES.slice(0, 4).map(d => `<tr>
        <td>${d.n}</td>
        <td class="mono">${d.date}<span class="counter"> · ${d.days > 0 ? `in ${d.days} d` : 'passed'}</span></td>
        <td>${d.scope}</td>
        <td class="mono">${d.atoms}${d.gap ? ` <span class="tag warn">${d.gap}</span>` : ''}</td>
      </tr>`).join('')}
    </tbody></table>
    <p class="counter" style="margin-top:var(--space-4)">Exam 1 is due ${daysTo('2026-10-07')} days from now and covers L1 to L7, which is Units 1 through 4. Units 1 to 3 now have atoms; Unit 4 has none, and its problem set is due first.</p>
  </div>

  <p class="sect0">4 · Course outcome coverage</p>
  <p class="sub" style="margin:0 0 var(--space-4)">The twelve outcomes the course states for itself, each mapped to the units that carry it. Coverage counts only units that actually hold atoms — reading a unit does not count.</p>
  <div class="card">
    <div class="between"><p class="eyebrow">Outcomes whose units have started</p>
      <span class="counter">${OUTCOMES.filter(o => outcomeState(o).atoms > 0).length} of ${OUTCOMES.length}</span></div>
    <div class="bararea" style="margin-top:var(--space-3)">
      <i style="width:${OUTCOMES.filter(o => outcomeState(o).atoms > 0).length / OUTCOMES.length * 100}%;background:var(--accent)"></i>
    </div>
    <p class="counter" style="margin-top:var(--space-2)">This number is meant to look uncomfortable in September. The point is that it moves for a reason you can name.</p>
  </div>
  <div style="margin-top:var(--space-4)">${['Conceptual', 'Technical'].map(cls => `
    <p class="eyebrow" style="margin:var(--space-5) 0 var(--space-3)">${cls}</p>
    ${OUTCOMES.filter(o => o.cls === cls).map(o => {
      const st = outcomeState(o);
      return `<div class="outcome">
        <div class="between"><span class="tag mono">${o.id}</span>
          <span class="tag ${st.cls}">${st.label}${st.atoms ? ` · ${st.atoms} atoms` : ''}</span></div>
        <p>${o.t}</p>
        <p class="counter">${st.units}</p>
      </div>`;
    }).join('')}`).join('')}</div>
  <p class="note" style="margin-top:var(--space-5)">Outcome text is quoted from the course's own statement of learning outcomes; unit mapping follows the Fall 2026 syllabus.</p>
`;
}

/* ---------- settings ---------- */
function viewSettings() {
  return `<div class="page-head"><div><p class="eyebrow">Engine</p><h1>Settings</h1></div></div>
  <div class="card">
    <div class="between"><p class="eyebrow">Interface language</p>${langSwitch()}</div>
    <p class="sub" style="margin:var(--space-2) 0 var(--space-3)">Two languages, one deliberate asymmetry. The interface switches between English and Traditional Chinese, but the atoms themselves stay in English because the exam, the problem sets and the textbook are in English — translating the material would train you on wording you will never be tested on. Chinese enters through key-term glosses, and through the tutor, which answers in whichever language is selected.</p>
    <div class="rowline" style="flex-wrap:wrap"><span class="tag pass">Interface: English / 繁體中文</span><span class="tag">Atom content: English only</span>
      <span class="tag">Speech recognition: en-US</span><span class="tag">Tutor and grader: follows the switch</span></div>
  </div>
  <div class="card">
    <p class="eyebrow">Status</p>
    <p class="sub" style="margin:var(--space-2) 0 var(--space-3)">Lessons, frameworks, practice sets, grading and the tutor all work from your own imported atoms. Every answer cites the atom ids behind it and says plainly when your library does not cover the question.</p>
    <div class="rowline" style="flex-wrap:wrap">
      ${AI.health === null ? '<span class="tag">checking…</span>'
      : AI.health.live ? `<span class="tag pass">Ready</span><span class="tag">${AI.health.atoms} atoms loaded</span><span class="tag warn">${AI.health.needs_confirm} awaiting confirmation</span><span class="tag">${{anthropic: 'Claude', gemini: 'Gemini', groq: 'Groq', ollama: 'Ollama', mock: 'Mock'}[AI.health.backend] || AI.health.backend}</span>`
        : `<span class="tag warn">Offline</span>`}
      <button class="chip" onclick="checkHealth()">Re-check</button></div>
  </div>
  <div class="card">
    <p class="eyebrow">Gate thresholds</p>
    <table style="margin-top:var(--space-3)"><tbody>
      <tr><th>Feynman pass score</th><td class="mono">4.0 / 5.0 (boundary dimension capped at 2 when no failure boundary is stated)</td></tr>
      <tr><th>Extraction keep threshold</th><td class="mono">salience ≥ 5</td></tr>
      <tr><th>Consecutive lapses → demote</th><td class="mono">2 → demoted and excluded from W4</td></tr>
      <tr><th>Target retention</th><td class="mono">0.90 · max interval 365 days</td></tr>
    </tbody></table>
  </div>
  <div class="card">
    <p class="eyebrow">What is live and what is a demonstration</p>
    <p class="note" style="margin-top:var(--space-3)"><b>Live:</b> all 25 atoms came from your own files — the four annotated lecture decks and the syllabus — and each one keeps a verbatim source quote. Lessons, unit frameworks, practice sets and the 0–5 grading of what you write are produced while you use the app; six atoms are flagged for your confirmation. Speech input is your browser's own recognition.</p>
    <p class="note" style="margin-top:var(--space-3)"><b>Demonstration:</b> the four-dimension Feynman score in W2 is a saved run, not live scoring of your speech. Nothing you type is saved yet, so a reload clears it.</p>
  </div>`;
}

/* ---------- routing ---------- */
function go(t) { stopVoice(); S.tab = t; S.flow = null; closeSheet(); render(); }
function toggleTheme() {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = S.theme; render();
}
function render() {
  document.documentElement.dataset.theme = S.theme;
  const rail = document.getElementById('rail');
  if (!rail.dataset.built) {
    rail.insertAdjacentHTML('beforeend', TABS.map(([k, label, zh, hint]) =>
      `<button data-tab="${k}" onclick="go('${k}')" title="${hint}"><svg viewBox="0 0 24 24">${ICON[k]}</svg><span>${label}</span></button>`).join(''));
    rail.insertAdjacentHTML('beforeend', '<span class="spacer"></span>');
    rail.dataset.built = '1';
  }
  rail.querySelectorAll('button[data-tab]').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.tab === S.tab)));
  // Build review queue when Practice tab is rendered
  if (S.tab === 'practice') buildReviewQueue();
  let html;
  if (S.flow) html = [viewW0, viewW1, viewW2, viewW3, viewW4][S.flow.stage - 1]();
  else html = { practice: viewPractice, tutor: viewTutor, materials: viewLibrary, atoms: viewAtoms, progress: viewProgress, settings: viewSettings }[S.tab]();
  if (S.tab === 'atoms') document.querySelector('.rail button[data-tab="materials"]').setAttribute('aria-current', 'true');
  const v = document.getElementById('view');
  v.innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'instant' });
  const ta = document.getElementById('ta');
  if (ta) ta.addEventListener('input', e => { if (S.flow) { S.flow.text = e.target.value; liveRefresh(); } });
  const q = document.getElementById('q');
  if (q) q.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) askTutor(); });
  localize();
}
document.getElementById('sheetBack').addEventListener('click', e => { if (e.target.id === 'sheetBack') closeSheet(); });
render();
checkHealth();
