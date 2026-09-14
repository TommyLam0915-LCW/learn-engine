/* Materials · 原始內容檔案室 — folders, file import, AI tidy-up suggestions */
const ICO = {
  folder: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h4l2 2.5h9A2.5 2.5 0 0 1 24 11v11.5A2.5 2.5 0 0 1 21.5 25h-15A2.5 2.5 0 0 1 4 22.5v-14Z" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  doc: '<path d="M7 4h9l5 5v19H7V4Z" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 4v5h5M11 16h9M11 21h9" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  atoms: '<circle cx="16" cy="16" r="2.6" fill="currentColor"/><ellipse cx="16" cy="16" rx="11" ry="5" stroke="currentColor" stroke-width="1.7" fill="none"/><ellipse cx="16" cy="16" rx="11" ry="5" stroke="currentColor" stroke-width="1.7" fill="none" transform="rotate(60 16 16)"/>',
  up: '<path d="M16 22V10m0 0-5 5m5-5 5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M6 24v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" fill="none"/>'
};

const LIB = {
  id: 'root', name: 'Materials', type: 'folder', children: [
    {
      id: 'c6431x', type: 'folder', name: '6.431x Probability', sub: 'MITx · Fall 2026 · 10 units · 25 atoms so far', children: [
        {
          id: 'course', type: 'folder', name: 'Course documents', sub: 'Syllabus and stated learning outcomes', children: [
            {
              id: 'd-syl', type: 'doc', name: '3T2026_syllabus.pdf', kind: 'PDF syllabus', pages: 2, status: 'ref',
              excerpt: 'Unit 1: Probability models and axioms\nL1 · PS1 due Sep 9\nUnit 2: Conditioning and independence\nL2, L3 · PS2 due Sep 16\nUnit 3: Counting\nL4 · PS3 due Sep 23\nExam 1 covers L1–L7, due Oct 7'
            },
            {
              id: 'd-out', type: 'doc', name: 'learning_outcomes.txt', kind: 'Course outcome statement', pages: 1, status: 'ref',
              excerpt: 'At a conceptual level:\nMaster the basic concepts …\nTranslate models described in words …\nAt a more technical level:\nBecome familiar with basic and common\nprobability distributions …'
            }
          ]
        },
        {
          id: 'u1', type: 'folder', name: 'Unit 1 · Probability models and axioms', sub: 'Sections 1.1–1.2 · L1 · 6 atoms', children: [
            {
              id: 'd-l01', type: 'doc', name: 'L01_annotated_slides.pdf', kind: 'PDF slides · image only, text read automatically', pages: 20, status: 'done', atoms: 6,
              excerpt: 'Probability models and axioms\nSample space\nAxioms: nonnegativity, normalization,\nadditivity\nCountable additivity axiom\nDiscrete uniform law'
            },
            { id: 'a-u1', type: 'atoms', name: 'Atom wall', n: 6, unit: 1, sub: '6 cards from L1 · none through the Feynman gate yet' }
          ]
        },
        {
          id: 'u2', type: 'folder', name: 'Unit 2 · Conditioning and independence', sub: 'Sections 1.3–1.5 · L2, L3 · 14 atoms', children: [
            {
              id: 'd-txt', type: 'doc', name: 'MITRES_6_012S18_Textbook.pdf', kind: 'PDF extract, pp. 5–6', pages: 2, status: 'done', atoms: 7,
              excerpt: 'Let A1,...,An be disjoint events\nthat form a partition of the\nsample space and assume\nP(Ai) > 0 for all i. Then for\nany event B, we have\nP(B) = ΣP(Ai)P(B|Ai).'
            },
            {
              id: 'd-l02', type: 'doc', name: 'L02_annotated_slides.pdf', kind: 'PDF slides · image only, text read automatically', pages: 10, status: 'done', atoms: 4, merged: 1,
              excerpt: "Conditioning and Bayes' rule\nP(A|B) = P(A∩B)/P(B)\nMultiplication rule\nTotal probability theorem\nBayes' rule: inferring causes"
            },
            {
              id: 'd-l03', type: 'doc', name: 'L03_annotated_slides.pdf', kind: 'PDF slides · image only, text read automatically', pages: 10, status: 'done', atoms: 3, merged: 3,
              excerpt: 'Independence\nP(A∩B) = P(A)P(B)\nConditional independence\nIndependence of a collection\nReliability: series and parallel'
            },
            { id: 'a-u2', type: 'atoms', name: 'Atom wall', n: 14, unit: 2, sub: '14 cards from textbook + L2 + L3 · 1 through the gate' }
          ]
        },
        {
          id: 'u3', type: 'folder', name: 'Unit 3 · Counting', sub: 'Section 1.6 · L4 · 5 atoms · PS3 due 23 Sep', children: [
            {
              id: 'd-l04', type: 'doc', name: 'L04_annotated_slides.pdf', kind: 'PDF slides · image only, text read automatically', pages: 12, status: 'done', atoms: 5, merged: 1,
              excerpt: 'Counting\nBasic counting principle\nPermutations, subsets\nBinomial coefficient n!/(k!(n−k)!)\nPartitions: multinomial coefficient'
            },
            { id: 'a-u3', type: 'atoms', name: 'Atom wall', n: 5, unit: 3, sub: '5 cards from L4 · none through the gate yet' }
          ]
        },
        {
          id: 'u4', type: 'folder', name: 'Unit 4 · Discrete random variables', sub: 'Sections 2.1–2.7 · L5–L7 · nothing imported yet', children: []
        },
        {
          id: 'ps', type: 'folder', name: 'Problem sets and exams', sub: 'PS2 due 16 Sep · PS3 due 23 Sep · Exam 1 due 7 Oct', children: [
            {
              id: 'd-ps2', type: 'doc', name: 'PS2_problem_set.pdf', kind: 'PDF problems', pages: 4, status: 'ref',
              excerpt: "Problem 1. Bayes' rule\nProblem 2. Independence\nProblem 3. Total probability\nDue Sep 16, 19:59 HKT"
            }
          ]
        }
      ]
    },
    { id: 'c18650', type: 'folder', name: '18.6501x Fundamentals of Statistics', sub: 'Not decided whether to take it in parallel', children: [] },
    {
      id: 'toefl', type: 'folder', name: 'TOEFL', sub: 'Target total 105', children: [
        {
          id: 'd-err', type: 'doc', name: 'writing_error_taxonomy.md', kind: 'Markdown', pages: 1, status: 'ref',
          excerpt: 'Grammar: tense agreement / articles\nVocabulary: wrong collocation\nStructure: concession without rebuttal'
        }
      ]
    },
    { id: 'work', type: 'folder', name: 'Work · Alibaba Cloud', sub: 'Carrying the quantitative material back into account work', children: [] }
  ]
};

const STATUS = {
  done: ['extracted', 'pass'], none: ['not extracted', 'act'], ref: ['reference only', ''], skip: ['reference only', '']
};

/* AI tidy-up suggestions — derived from the real state of the atom set after the import */
const SUGS = [
  { id: 's1', h: 'Six atoms were merged across sources and need one look from you', p: 'A0001, A0003, A0004, A0005, A0006 and A0013 each absorbed content from a second source, so the engine set needs_human_confirm back to true. They stay out of scheduling until you confirm the title still matches the source quote. This is the shortest high-value task in the archive right now.', c: 'audit · 6 of 25 atoms' },
  { id: 's2', h: 'Unit 4 is empty and its problem set is due before Exam 1', p: 'Exam 1 covers L1 to L7 and is due 7 October. Units 1 to 3 now hold atoms; Unit 4 (L5–L7, discrete random variables) has nothing imported, and Problem Set 4 is due 2 October. Import L05–L07 next rather than adding depth to counting.', c: 'schedule risk · from the syllabus' },
  { id: 's3', h: 'Two Unit 2 atoms are applications, not principles', p: 'A0019 (system reliability) and A0020 (the king\u2019s sibling puzzle) came from slide-only material. They do have derivation chains and failure boundaries, but they apply independence rather than establish it. Consider dropping their salience to 6 so they are scheduled less often than the definition atoms they depend on.', c: 'definition check · suggested, not applied' },
  { id: 's4', h: 'Keep the writing error taxonomy as reference', p: 'The file in the TOEFL folder is a checklist, not a principle — no derivation chain, no failure modes — so it does not meet the atom definition. Keep it as reference material and out of FSRS scheduling.', c: 'suggested: no action' }
];

/* the four real files you uploaded, as they appear at import time */
const PICKS = [
  { id: 'p1', k: 'PDF', n: 'L04_annotated_slides.pdf', d: '12 pages · counting · image-only, needs OCR' },
  { id: 'p2', k: 'PDF', n: 'L01_annotated_slides.pdf', d: '20 pages · axioms · already imported' },
  { id: 'p3', k: 'PDF', n: '3T2026_syllabus.pdf', d: '2 pages · schedule, not learning content' }
];

/* the log below replays the run that actually happened on L04 */
const IMPORT_LOG = [
  ['pdftotext -layout -f 1 -l 12 → 12 bytes of text: the deck is a scan, there is no text layer', 'no'],
  ['fallback: render 12 pages to PNG at 130 dpi', 'ok'],
  ['read every page: printed LaTeX plus the handwritten red and blue annotations', 'ok'],
  ['P0 extraction: 6 candidate atoms, each with a verbatim source quote and a page number', 'ok'],
  ['check_schema: source_quote required, salience 1–10, no fields outside the contract', 'ok'],
  ['audit: salience floor 5 — nothing discarded, the lowest candidate scored 8', 'ok'],
  ['dedupe: keyword containment 0.62 against A0013 (discrete uniform law) → merge, not a new atom', 'no']
];

/* the six candidates returned from L04, with the engine's real decision */
const CANDS = [
  {
    t: 'The discrete uniform law converts probability into counting only because equal likelihood makes every outcome carry the same weight 1/n', sal: 10, dup: 'A0013', jac: 0.62, act: 'merge',
    why: 'Keyword containment 0.62 against A0013, which came from the L01 deck. Same principle, stated from a different slide, so the new derivation steps and failure modes are merged into A0013 and the atom is re-flagged for your confirmation.'
  },
  {
    t: 'The basic counting principle multiplies stage counts, and is valid only when the number of choices at each stage is the same no matter what was chosen earlier', sal: 10, dup: null, act: 'new',
    why: 'New atom. 4-step chain, 3 failure modes, including a stage whose choice count depends on earlier choices — the case where the product silently gives the wrong count.'
  },
  {
    t: 'The binomial coefficient divides by k! because the two-route construction of an ordered k-sequence over-counts each subset exactly k! times', sal: 10, dup: null, act: 'new',
    why: 'New atom. This is the derivation, not the formula: counting ordered sequences two ways forces (n choose k)·k! = n!/(n−k)!, so k! is the over-count factor rather than a memorised denominator.'
  },
  {
    t: 'A binomial probability factors into one probability times one count because every k-head sequence has the same probability p^k(1−p)^{n−k}', sal: 9, dup: null, act: 'new',
    why: 'New atom. Its failure mode is the one that matters in practice: tosses that are dependent or not identically distributed break the shared weight, and the count can no longer be factored out.'
  },
  {
    t: 'The multinomial coefficient counts partitions by dividing n! by the internal orderings each group absorbs', sal: 9, dup: null, act: 'new',
    why: 'New atom, same over-counting device as the binomial case with ∏ nᵢ! as the absorbed orderings.'
  },
  {
    t: 'A counting-based probability is only as good as the sample space chosen, so switching to a coarser equally likely space can replace a huge count with a short product', sal: 8, dup: null, act: 'new',
    why: 'New atom. Kept because it states when the shortcut is legitimate — fair-deal symmetry — rather than presenting coarsening as generally safe.'
  }
];

/* ---------- navigation ---------- */
function libNode(path) {
  let n = LIB;
  for (const id of path) n = n.children.find(c => c.id === id);
  return n;
}
function countAtoms(n) {
  if (n.type === 'atoms') return n.n;
  return (n.children || []).reduce((a, c) => a + countAtoms(c), 0);
}
function countItems(n) { return (n.children || []).length; }

function viewLibrary() {
  const node = libNode(S.path);
  const kids = node.children || [];
  const crumbs = [{ id: 'root', name: 'Materials' }].concat(S.path.map((id, i) => {
    const nn = libNode(S.path.slice(0, i + 1)); return { id, name: nn.name };
  }));
  const openSug = SUGS.filter(s => !S.sugDone[s.id]).length;
  return `
  <div class="page-head">
    <div><p class="eyebrow">Raw material archive${S.path.length ? ` · ${countItems(node)} items · ${countAtoms(node)} atoms` : ` · 4 subjects · ${countAtoms(LIB)} atoms`}</p>
    <h1>${esc(node.name)}</h1></div>
  </div>
  <div class="toolbar">
    <div class="crumbs">
      ${S.path.length === 0 ? '<span class="here">All subjects</span>' : crumbs.map((c, i) => i === crumbs.length - 1
    ? `<span class="here">${esc(c.name)}</span>`
    : `<button onclick="libGo(${i})">${esc(c.name)}</button><span class="sep">/</span>`).join('')}
    </div>
    <button class="btn sm ghost" onclick="openSugs()">AI tidy-up${openSug ? ` · ${openSug}` : ''}</button>
    <button class="btn sm" onclick="openImport()">Import files</button>
  </div>
  ${node.sub ? `<p class="sub" style="margin:-8px 0 var(--space-5)">${esc(node.sub)}</p>` : ''}
  ${kids.length === 0 ? `<div class="card" style="text-align:center;padding:var(--space-12)">
      <p class="sub">This folder is still empty. Import a slide deck, a textbook extract or a photo of handwritten notes, and the engine will extract atoms before filing anything.</p>
      <button class="btn" style="margin-top:var(--space-5)" onclick="openImport()">Import the first file</button>
    </div>`
    : `<div class="libgrid">${kids.map(k => nodeCard(k)).join('')}</div>`}
  ${S.path.length === 0 ? viewFrameSection() : ''}
  ${S.path.length === 0 ? `<p class="note" style="margin-top:var(--space-6)">Filing rule: a folder holds only two kinds of things — source material and the atom wall extracted from it. Summaries, reflections and transcribed passages stay out, because they can neither be scheduled for retrieval nor scored.</p>` : ''}`;
}

function fname(t) { return esc(t).replace(/_/g, '_<wbr>').replace(/\.(pdf|md|txt)$/, '<wbr>.$1'); }
function nodeCard(n) {
  if (n.type === 'folder') {
    const items = countItems(n), atoms = countAtoms(n);
    return `<button class="node ${items ? '' : 'empty'}" onclick="libOpen('${n.id}')">
      <svg class="ico" viewBox="0 0 32 32">${ICO.folder}</svg>
      <h3>${esc(n.name)}</h3>
      ${n.sub ? `<p>${esc(n.sub)}</p>` : ''}
      <div class="foot"><span class="tag">${items} item${items === 1 ? '' : 's'}</span>
        <span class="tag ${atoms ? 'pass' : ''}">${atoms} atom${atoms === 1 ? '' : 's'}</span></div>
    </button>`;
  }
  if (n.type === 'atoms') {
    return `<button class="node" onclick="openAtoms(${n.unit || 0})">
      <svg class="ico" viewBox="0 0 32 32">${ICO.atoms}</svg>
      <h3>${esc(n.name)}</h3><p>${esc(n.sub)}</p>
      <div class="foot"><span class="tag pass">${n.n} cards</span><span class="tag act">${n.n - (n.unit === 2 ? 1 : 0)} to explain</span></div>
    </button>`;
  }
  const [label, cls] = STATUS[n.status];
  return `<button class="node doc" onclick="openDoc('${n.id}')">
    <div class="thumb">${esc(n.excerpt)}</div>
    <h3>${fname(n.name)}</h3>
    <p>${esc(n.kind)} · ${n.pages} page${n.pages === 1 ? '' : 's'}</p>
    <div class="foot"><span class="tag ${cls}">${label}</span>
      ${n.atoms ? `<span class="tag">${n.atoms} new atom${n.atoms === 1 ? '' : 's'}</span>` : ''}
      ${n.merged ? `<span class="tag warn">${n.merged} merged</span>` : ''}</div>
  </button>`;
}

function libOpen(id) { S.path = S.path.concat([id]); render(); }
function libGo(i) { S.path = S.path.slice(0, i); render(); }

/* ---------- file detail ---------- */
function findDoc(id) {
  let hit = null;
  (function walk(n) { (n.children || []).forEach(c => { if (c.id === id) hit = c; walk(c); }); })(LIB);
  return hit;
}
function openDoc(id) {
  const d = findDoc(id), [label, cls] = STATUS[d.status];
  document.getElementById('sheet').innerHTML = `
    <div class="between"><span class="tag ${cls}">${label}</span>
      <button class="close" onclick="closeSheet()" aria-label="Close">✕</button></div>
    <h2>${esc(d.name)}</h2>
    <p class="counter">${esc(d.kind)} · ${d.pages} page${d.pages === 1 ? '' : 's'}</p>
    <div class="thumb" style="height:auto;min-height:120px;margin-top:var(--space-4)">${esc(d.excerpt)}</div>
    <p class="sect">Processing state</p>
    <table><tbody>
      <tr><th>Text extraction</th><td>${d.kind.startsWith('PDF') ? 'pdftotext -layout (done)' : d.kind === 'Markdown' ? 'read directly' : 'OCR pending'}</td></tr>
      <tr><th>Atom extraction</th><td>${d.status === 'done' ? `${d.atoms} atoms extracted, all passed schema validation` : d.status === 'none' ? 'not extracted yet' : 'marked reference only'}</td></tr>
      <tr><th>Audit thresholds</th><td class="mono">salience ≥ 5 to keep · source_quote required</td></tr>
    </tbody></table>
    ${d.status === 'none' ? `<button class="btn wide" style="margin-top:var(--space-6)" onclick="closeSheet();openImport('${d.id}')">Extract atoms from this file</button>`
      : d.status === 'done' ? `<button class="btn wide ghost" style="margin-top:var(--space-6)" onclick="closeSheet();go('atoms')">See the 7 atoms from this file</button>` : ''}`;
  document.getElementById('sheetBack').classList.add('open');
}

/* ---------- import flow ---------- */
function openImport(docId) {
  S.imp = { step: 1, pick: docId ? 'p1' : null, logAt: 0, acts: {} };
  CANDS.forEach((c, i) => S.imp.acts[i] = c.act);
  renderImport();
  document.getElementById('sheetBack').classList.add('open');
}
function renderImport() {
  const im = S.imp, sheet = document.getElementById('sheet');
  const bar = `<div class="steps">${[1, 2, 3].map(i => `<i class="${im.step >= i ? 'on' : ''}"></i>`).join('')}</div>`;
  const head = t => `<div class="between"><span class="eyebrow">Import · step ${im.step} of 3</span>
    <button class="close" onclick="closeSheet()" aria-label="Close">✕</button></div>
    ${bar}<h2 style="margin-bottom:var(--space-2)">${t}</h2>`;

  if (im.step === 1) {
    sheet.innerHTML = `${head('Choose what to import')}
      <p class="sub" style="margin-bottom:var(--space-5)">PDF, Markdown, plain text and photos of notes. What you import is the source itself — the engine extracts atoms from it and keeps no summary.</p>
      <div class="dropzone"><svg viewBox="0 0 32 32">${ICO.up}</svg>
        <p class="sub" style="margin-top:var(--space-3)">Drop files here</p>
        <p class="counter">40 MB per file · multiple files allowed</p></div>
      <p class="eyebrow" style="margin-top:var(--space-6)">Or use an example file already on this machine</p>
      <div class="picks">${PICKS.map(p => `<button class="pick" onclick="pickFile('${p.id}')"
        style="${im.pick === p.id ? 'border-color:var(--accent)' : ''}">
        <span class="k">${p.k}</span><span><strong>${esc(p.n)}</strong><span class="counter">${esc(p.d)}</span></span></button>`).join('')}</div>
      <button class="btn wide" style="margin-top:var(--space-6)" ${im.pick ? '' : 'disabled'} onclick="runImport()">Start extraction</button>`;
    return;
  }
  if (im.step === 2) {
    sheet.innerHTML = `${head('The engine is working')}
      <p class="sub" style="margin-bottom:var(--space-5)">${esc(PICKS.find(p => p.id === im.pick).n)}</p>
      <div class="log">${IMPORT_LOG.slice(0, im.logAt).map(([t, s]) =>
      `<div><span class="${s}">${s === 'ok' ? '✓' : '!'}</span> ${esc(t)}</div>`).join('')}
      ${im.logAt < IMPORT_LOG.length ? '<div><span class="ok">·</span> working…</div>' : ''}</div>`;
    return;
  }
  const keep = Object.entries(im.acts).filter(([i, a]) => a === 'new' || a === 'confirm').length;
  const merge = Object.values(im.acts).filter(a => a === 'merge').length;
  const drop = Object.values(im.acts).filter(a => a === 'drop').length;
  sheet.innerHTML = `${head('Extraction result, waiting on you')}
    <p class="sub">Suggested destination</p>
    <div class="rowline" style="margin:var(--space-3) 0 var(--space-5);flex-wrap:wrap">
      <span class="tag act">6.431x Probability</span><span class="sep">/</span>
      <span class="tag act">Unit 3 · Counting</span>
      <span class="conf">confidence 0.93</span>
      <button class="chip" onclick="toast('Prototype: the shipped version lets you pick any folder')">Change</button>
    </div>
    <p class="eyebrow">${CANDS.length} candidate atoms · ${keep} new · ${merge} merged · ${drop} discarded</p>
    <div style="margin-top:var(--space-3)">${CANDS.map((c, i) => {
    const a = im.acts[i];
    return `<div class="cand ${a === 'drop' ? 'drop' : ''}">
        <div class="between"><span class="tag mono">salience ${c.sal}</span>
          ${c.dup ? `<span class="tag warn">${c.jac} similar to ${c.dup}</span>` : ''}</div>
        <h4>${esc(c.t)}</h4>
        <p class="why">${esc(c.why)}</p>
        <div class="choice">
          ${[['new', 'New'], ['merge', 'Merge'], ['confirm', 'Confirm first'], ['drop', 'Discard']].map(([k, l]) =>
      `<button class="chip" aria-pressed="${a === k}" onclick="setAct(${i},'${k}')">${l}</button>`).join('')}
        </div></div>`;
  }).join('')}</div>
    <p class="note" style="margin-top:var(--space-5)">The AI reads, decomposes, judges duplication and formats. Filing and admission are yours. Anything marked "confirm first" enters the archive but is not scheduled until you have checked its source quote.</p>
    <button class="btn wide" style="margin-top:var(--space-5)" onclick="finishImport()">Confirm import</button>`;
}
function pickFile(id) { S.imp.pick = id; renderImport(); }
function setAct(i, k) { S.imp.acts[i] = k; renderImport(); }
function runImport() {
  S.imp.step = 2; S.imp.logAt = 0; renderImport();
  const tick = () => {
    S.imp.logAt++; renderImport();
    if (S.imp.logAt < IMPORT_LOG.length) setTimeout(tick, 420);
    else setTimeout(() => { S.imp.step = 3; renderImport(); }, 500);
  };
  setTimeout(tick, 350);
}
function finishImport() {
  const im = S.imp;
  const add = Object.values(im.acts).filter(a => a === 'new').length;
  const mer = Object.values(im.acts).filter(a => a === 'merge').length;
  const con = Object.values(im.acts).filter(a => a === 'confirm').length;
  const u3 = libNode(['c6431x', 'u3']);
  const d = u3.children.find(c => c.id === 'd-l04');
  if (d) { d.status = 'done'; d.atoms = add + con; d.merged = mer; }
  const a = u3.children.find(c => c.id === 'a-u3');
  if (a) { a.n = add + con; a.sub = `${a.n} cards from L4 · ${mer} merged into earlier units`; }
  closeSheet();
  S.tab = 'materials'; S.path = ['c6431x', 'u3'];
  toast(`Filed · ${add} new · ${mer} merged · ${con} awaiting your confirmation`);
  render();
}

/* ---------- AI tidy-up suggestions ---------- */
function openSugs() {
  const list = SUGS.map(s => `<div class="sug ${S.sugDone[s.id] ? 'gone' : ''}">
    <div><h4>${esc(s.h)}</h4><p>${esc(s.p)}</p><p class="conf" style="margin-top:6px">${esc(s.c)}</p></div>
    <div class="acts">${S.sugDone[s.id]
      ? '<span class="tag pass">handled</span>'
      : `<button class="chip" onclick="doSug('${s.id}',1)">Accept</button>
         <button class="chip" onclick="doSug('${s.id}',0)">Ignore</button>`}</div>
  </div>`).join('');
  document.getElementById('sheet').innerHTML = `
    <div class="between"><span class="eyebrow">AI tidy-up suggestions</span>
      <button class="close" onclick="closeSheet()" aria-label="Close">✕</button></div>
    <h2 style="margin:var(--space-2) 0 var(--space-2)">The assistant sees four things</h2>
    <p class="sub" style="margin-bottom:var(--space-5)">It proposes and explains; it never moves a file or creates an atom by itself. Every line states its evidence, so you can overrule it.</p>
    ${list}
    <p class="note" style="margin-top:var(--space-5)">The four judgements rest on, in order: keyword similarity, the difference between assignment scope and the atom set, the gap between exam scope and atom count, and a definition check for whether a derivation chain and failure modes exist. None of them come from "this looks untidy".</p>`;
  document.getElementById('sheetBack').classList.add('open');
}
function doSug(id, take) {
  S.sugDone[id] = true;
  if (id === 's1' && take) { closeSheet(); openImport('d-l03'); return; }
  openSugs();
  toast(take ? 'Accepted and added to your queue' : 'Ignored for the rest of this week');
}
