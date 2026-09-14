/* teach.js — W0 teaching gate and the unit framework layer.
   Both surfaces are backed by real model calls (/api/teach, /api/frame, /api/frame_grade).
   Teaching material for an atom is generated once and cached on disk, so re-entering a
   lesson costs nothing; only prediction grading and the framework recall grade call out. */

AI.teach = { busy: false, err: null, data: null, i: 0, pred: {}, sentence: '' };
AI.frame = { unit: '2', busy: false, err: null, data: {}, recall: {} };

const SHAPES = [
  ['reference', 'Reference framework', '參考已有框架', 'Adopt the structure the field already uses — textbook chapter logic, a standard classification. Cheapest and usually right for mathematics.'],
  ['why_chain', 'Why-chain', '層層追問為什麼', 'Each node answers why the node above it holds, ending at an axiom.'],
  ['timeline', 'Timeline', '從時間線入手', 'Only for content that is genuinely sequential in time. Most mathematics is not.'],
  ['process', 'Process steps', '梳理流程步驟', 'The ordered steps of doing something — how to actually compute the thing.']
];

/* ---------- W0: teach before testing ---------- */
function viewW0() {
  const atom = byId(RUN.atom), t = AI.teach;
  const full = atom.salience >= 8;
  const head = flowTop(t.data ? `W0 · step ${Math.min(t.i + 1, (t.data.steps || []).length)}/${(t.data.steps || []).length}`
    : 'W0 · not started', t.data ? t.i / Math.max((t.data.steps || []).length, 1) : 0);

  if (!t.data) {
    return `${head}
    <div class="card">
      <p class="eyebrow">Teaching gate · ${atom.id}</p>
      <h2 style="margin-top:var(--space-2)">${esc(atom.title)}</h2>
      <p class="sub" style="margin-top:var(--space-3)">This gate runs before you are questioned. It reconstructs the result from its premises instead of stating it: every step names the premise it uses, and every step stops to make you predict the next move before it is revealed. Reading a finished derivation feels like understanding; predicting and being wrong is what actually encodes it.</p>
      <div class="rowline" style="flex-wrap:wrap;margin-top:var(--space-4)">
        <span class="tag ${full ? 'act' : ''}">salience ${atom.salience} → ${full ? 'full lesson' : 'short lesson'}</span>
        <span class="tag">${full ? '4–5 steps, boundary, worked number' : '2 steps: derivation core + boundary'}</span>
      </div>
      <p class="note">Depth is rationed by salience, not by preference. Salience 8 and above gets the full chain; below that gets derivation plus boundary only, because 25 atoms × 20 minutes does not fit before ${esc('Exam 1 on 7 October')}.</p>
      <button class="btn wide" style="margin-top:var(--space-5)" onclick="startTeach()" ${t.busy ? 'disabled' : ''}>
        ${t.busy ? 'Building the lesson…' : 'Start the lesson'}</button>
      ${t.err ? `<p class="note">The lesson could not be built. Try again.</p>` : ''}
      ${t.busy ? `<div class="skel" style="margin-top:var(--space-5)"><i></i><i></i><i></i><i></i><i></i></div>
        <p class="counter">Rebuilding the chain from this atom, its unit and the course outcomes…</p>` : ''}
    </div>`;
  }

  const d = t.data, steps = d.steps || [];
  const done = t.i >= steps.length;
  const primer = d.primer || [];
  const frameworkType = d.framework_type || 'causal_chain';
  const frameworkLabels = {
    causal_chain: G('Causal Chain', '因果鏈'),
    timeline: G('Timeline', '時間線'),
    process_steps: G('Process Steps', '流程步驟'),
    comparison: G('Comparison', '對比'),
    hierarchy: G('Hierarchy', '層級結構')
  };

  // Handle both old format (term/zh/plain/everyday) and new bilingual format (term_en/term_zh/plain_en/plain_zh/everyday_en/everyday_zh)
  const everydayHTML = (() => {
    if (d.everyday_en && d.everyday_zh) {
      return `<div class="card">
    <p class="eyebrow">${G('Start here', '先從這裡開始')}</p>
    <div class="prose" style="margin-top:var(--space-3)"><b>EN</b> ${md(d.everyday_en)}</div>
    <div class="prose" style="margin-top:var(--space-2)"><b>中文</b> ${md(d.everyday_zh)}</div>
    <p class="note">Every step below says what it means inside this same situation, so the notation never arrives before the picture does. 下面每一步都會說明它在同一個情境中的意思，讓你先有畫面，符號才出現。</p>
  </div>`;
    }
    if (d.everyday) {
      return `<div class="card">
    <p class="eyebrow">${G('Start here', '先從這裡開始')}</p>
    <div class="prose" style="margin-top:var(--space-3)">${md(d.everyday)}</div>
    <p class="note">Every step below says what it means inside this same situation, so the notation never arrives before the picture does. 下面每一步都會說明它在同一個情境中的意思，讓你先有畫面，符號才出現。</p>
  </div>`;
    }
    return '';
  })();

  const primerHTML = primer.length ? `<div class="card">
    <div class="between"><p class="eyebrow">${G('Words you need first', '先搞清楚的詞')}</p>
      <span class="counter">${primer.length} ${G('terms', '個詞')}</span></div>
    <p class="sub" style="margin-top:var(--space-3)">Nothing below the line uses a term that is not defined here. If one of these is already obvious to you, skip it. 後面用到的每個術語都在這裡定義過。若某一項你已經很清楚，可以直接跳過。</p>
    <div class="terms">${primer.map((p, idx) => {
      // New bilingual format
      if (p.term_en !== undefined || p.term_zh !== undefined) {
        const termEn = p.term_en || '';
        const termZh = p.term_zh || '';
        const plainEn = p.plain_en || '';
        const plainZh = p.plain_zh || '';
        const everydayEn = p.everyday_en || '';
        const everydayZh = p.everyday_zh || '';
        return `<div class="term">
          <p class="th">${esc(termEn)} <i>${esc(termZh)}</i></p>
          <div class="prose tp"><b>EN</b> ${md(plainEn)}</div>
          <div class="prose tp" style="margin-top:var(--space-1)"><b>中文</b> ${md(plainZh)}</div>
          ${p.notation ? `<p class="tn"><b>${G('written as', '寫法')}</b> ${mdi(p.notation)}</p>` : ''}
          ${(everydayEn || everydayZh) ? `<div class="prose te"><b>EN</b> ${md(everydayEn)}</div><div class="prose te" style="margin-top:var(--space-1)"><b>中文</b> ${md(everydayZh)}</div>` : ''}
        </div>`;
      }
      // Old format (backward compatibility)
      return `<div class="term">
        <p class="th">${esc(p.term || '')}${p.zh ? `<i>${esc(p.zh)}</i>` : ''}</p>
        <div class="prose tp">${md(p.plain || '')}</div>
        ${p.notation ? `<p class="tn"><b>${G('written as', '寫法')}</b> ${mdi(p.notation)}</p>` : ''}
        ${p.everyday ? `<div class="prose te">${md(p.everyday)}</div>` : ''}
      </div>`;
    }).join('')}</div>
  </div>` : '';

  // Two-pass learning mode: overview vs deep
  const isOverview = S.learningMode === 'overview';

  // In overview mode, show only the framework structure (everyday + primer + why)
  // In deep mode, show everything including steps, boundary, worked number, closing
  const frameworkHTML = `
  ${everydayHTML}
  ${primerHTML}

  <div class="card">
    <div class="between"><p class="eyebrow">${G('Why this exists', '它為何存在')} · <span class="chip">${frameworkLabels[frameworkType] || frameworkType}</span></p>
      <span class="counter">${d.depth === 'full' ? 'full lesson' : 'short lesson'}</span></div>
    <div class="prose" style="margin-top:var(--space-3)">${d.why_it_exists_en ? `<b>EN</b> ${md(d.why_it_exists_en)}` : md(d.why_it_exists || '')}</div>
    ${d.why_it_exists_zh ? `<div class="prose" style="margin-top:var(--space-2)"><b>中文</b> ${md(d.why_it_exists_zh)}</div>` : ''}
    <div class="expect" style="margin-top:var(--space-4)">
      <p class="sect" style="margin-top:0">${G('Where intuition fails', '直覺會出錯之處')}</p>
      <div class="prose">${d.trap_en ? `<b>EN</b> ${md(d.trap_en)}` : md(d.trap || '')}</div>
      ${d.trap_zh ? `<div class="prose" style="margin-top:var(--space-2)"><b>中文</b> ${md(d.trap_zh)}</div>` : ''}
    </div>
  </div>`;

  const stepsHTML = steps.slice(0, t.i + 1).map((s, i) => {
    if (isOverview) {
      // In overview mode, show only step claims (no body, no predictions)
      return `<div class="card">
        <p class="eyebrow">Step ${i + 1}</p>
        <h2 style="font-size:var(--text-lg);margin:var(--space-2) 0">${s.claim_en ? `<b>EN</b> ${mdi(s.claim_en)}` : mdi(s.claim || '')}</h2>
        ${s.claim_zh ? `<h2 style="font-size:var(--text-lg);margin:var(--space-2) 0"><b>中文</b> ${mdi(s.claim_zh)}</h2>` : ''}
        <p class="why">Uses: ${mdi(s.uses || '')}</p>
      </div>`;
    }
    return teachStep(s, i, i === t.i && !done);
  }).join('');

  const deepEndHTML = done ? `
  <div class="card">
    <p class="eyebrow">${G('Boundary', '邊界')}</p>
    <p class="sect">Break this premise</p>
    <div class="prose">${(d.boundary || {}).change_en ? `<b>EN</b> ${md((d.boundary || {}).change_en)}` : md((d.boundary || {}).change || '')}</div>
    ${(d.boundary || {}).change_zh ? `<div class="prose" style="margin-top:var(--space-1)"><b>中文</b> ${md((d.boundary || {}).change_zh)}</div>` : ''}
    <p class="sect">And this fails</p>
    <div class="prose">${(d.boundary || {}).consequence_en ? `<b>EN</b> ${md((d.boundary || {}).consequence_en)}` : md((d.boundary || {}).consequence || '')}</div>
    ${(d.boundary || {}).consequence_zh ? `<div class="prose" style="margin-top:var(--space-1)"><b>中文</b> ${md((d.boundary || {}).consequence_zh)}</div>` : ''}
  </div>
  <div class="card">
    <p class="eyebrow">${G('Worked number', '手算驗算')}</p>
    <div class="prose">${md((d.numeric || {}).setup || '')}</div>
    <div class="expect" style="margin-top:var(--space-3)"><div class="prose">${md((d.numeric || {}).result || '')}</div></div>
  </div>
  <div class="card qcard">
    <p class="eyebrow">${G('Closing sentence', '收尾一句話')}</p>
    <h2 style="margin-top:var(--space-2)">${mdi(d.closing_prompt || '')}</h2>
    <p class="why">This sentence is not graded here. It is carried into W2 and compared with what you say out loud — if the two do not match, the understanding is not stable yet.</p>
    <textarea id="w0sent" placeholder="One sentence, no formulas.">${esc(t.sentence)}</textarea>
    <div class="between" style="margin-top:var(--space-4)">
      <span class="counter">W0 does not score you</span>
      <button class="btn" onclick="finishW0()">Finish W0 and unlock W1</button>
    </div>
  </div>` : '';

  const overviewEndHTML = done ? `
  <div class="card qcard">
    <p class="eyebrow">${G('Overview complete', '概覽完成')}</p>
    <p class="sub">${G('You now have the framework. Switch to Deep Dive to see full derivations, worked examples, and boundary conditions.', '你現在有了框架。切換到「深入」模式查看完整推導、例題和邊界條件。')}</p>
    <div class="between" style="margin-top:var(--space-4)">
      <button class="btn ghost" onclick="setLearningMode('deep')">${G('Switch to Deep Dive', '切換到深入模式')}</button>
      <button class="btn" onclick="finishW0()">Finish W0 and unlock W1</button>
    </div>
  </div>` : '';

  return `${head}
  ${frameworkHTML}
  ${stepsHTML}
  ${isOverview ? overviewEndHTML : deepEndHTML}`;
}

function teachStep(s, i, current) {
  const p = AI.teach.pred[i] || {};
  return `<div class="card">
    <p class="eyebrow">${G('Step', '步驟')} ${i + 1}</p>
    <h2 style="font-size:var(--text-lg);margin:var(--space-2) 0">${s.claim_en ? `<b>EN</b> ${mdi(s.claim_en)}` : mdi(s.claim || '')}</h2>
    ${s.claim_zh ? `<h2 style="font-size:var(--text-lg);margin:var(--space-2) 0"><b>中文</b> ${mdi(s.claim_zh)}</h2>` : ''}
    <p class="why">${G('Uses', '使用')}: ${mdi(s.uses || '')}</p>
    <div class="prose" style="margin-top:var(--space-3)">${s.body_en ? `<b>EN</b> ${md(s.body_en)}` : md(s.body || '')}</div>
    ${s.body_zh ? `<div class="prose" style="margin-top:var(--space-2)"><b>中文</b> ${md(s.body_zh)}</div>` : ''}
    ${s.concrete_en || s.concrete_zh || s.concrete ? `<div class="concrete">
      <p class="sect" style="margin-top:0">${G('In the same situation', '回到同一個情境')}</p>
      ${s.concrete_en ? `<div class="prose"><b>EN</b> ${md(s.concrete_en)}</div>` : ''}
      ${s.concrete_zh ? `<div class="prose" style="margin-top:var(--space-1)"><b>中文</b> ${md(s.concrete_zh)}</div>` : ''}
      ${s.concrete && !s.concrete_en && !s.concrete_zh ? `<div class="prose">${md(s.concrete)}</div>` : ''}
    </div>` : ''}
    <div class="qcard" style="margin-top:var(--space-4);padding:0;border:0;background:none">
      <p class="sect">${G('Predict before you read on', '先預測再看下一步')}</p>
      <p class="sub">${s.predict_en ? `<b>EN</b> ${mdi(s.predict_en)}` : mdi(s.predict || '')}</p>
      ${s.predict_zh ? `<p class="sub" style="margin-top:var(--space-1)"><b>中文</b> ${mdi(s.predict_zh)}</p>` : ''}
      ${current ? `<textarea id="pred${i}" placeholder="${G('Your prediction. Wrong is useful here — a blank is not.', '你的預測。答錯也有用——空白就沒有。')}">${esc(p.text || '')}</textarea>
      <div class="between" style="margin-top:var(--space-4)">
        <button class="btn ghost" onclick="gradePrediction(${i})" ${p.busy ? 'disabled' : ''}>${p.busy ? G('Grading…', '評分中…') : G('Grade my prediction', '評分我的預測')}</button>
        <button class="btn" onclick="revealStep(${i})">${p.shown ? G('Next step', '下一步') : G('Reveal and continue', '顯示並繼續')}</button>
      </div>` : ''}
      ${p.err ? `<p class="note">${G('Scoring did not come through. Try again.', '評分未通過。請再試一次。')}</p>` : ''}
      ${p.grade ? `<div class="graded ${p.grade.score >= 3 ? 'ok' : ''}" style="margin-top:var(--space-4)">
        <div class="between"><span class="sect" style="margin:0">${G('Prediction score', '預測分數')}</span><b class="mono">${Number(p.grade.score).toFixed(1)}/5</b></div>
        ${(p.grade.hit || []).length ? `<p class="sect">${G('Covered', '已涵蓋')}</p><ul class="plainlist ok">${p.grade.hit.map(h => `<li>${md(h)}</li>`).join('')}</ul>` : ''}
        ${(p.grade.missed || []).length ? `<p class="sect">${G('Missed', '遺漏')}</p><ul class="plainlist miss">${p.grade.missed.map(m => `<li>${md(m)}</li>`).join('')}</ul>` : ''}
        ${(p.grade.wrong || []).length ? `<p class="sect">${G('Incorrect', '錯誤')}</p><ul class="plainlist miss">${p.grade.wrong.map(w => `<li>${md(w)}</li>`).join('')}</ul>` : ''}
        ${p.grade.next_probe ? `<p class="sect">${G('Next probe', '下一步探究')}</p><p class="note">${md(p.grade.next_probe)}</p>` : ''}
        <p class="sub" style="margin-top:var(--space-3)">${esc(p.grade.verdict || '')}</p>
      </div>` : ''}
      ${p.shown ? `<div class="expect" style="margin-top:var(--space-4)">
        <p class="sect" style="margin-top:0">${G('Expected answer', '預期答案')}</p>
        <div class="prose">${s.answer_en ? `<b>EN</b> ${md(s.answer_en)}` : md(s.answer || '')}</div>
        ${s.answer_zh ? `<div class="prose" style="margin-top:var(--space-2)"><b>中文</b> ${md(s.answer_zh)}</div>` : ''}
      </div>` : ''}
    </div>
  </div>`;
}

async function startTeach() {
  AI.teach.busy = true; AI.teach.err = null; render();
  try {
    const res = await api('/api/teach', { atom_id: RUN.atom, lang: S.lang });
    if (res.error) throw new Error(res.error);
    AI.teach.data = res; AI.teach.i = 0; AI.teach.pred = {};
  } catch (e) { AI.teach.err = String(e.message || e); }
  AI.teach.busy = false; render();
}

function revealStep(i) {
  const box = document.getElementById(`pred${i}`);
  const p = AI.teach.pred[i] || {};
  if (box) p.text = box.value;
  if (p.shown) { AI.teach.i = i + 1; } else { p.shown = true; }
  AI.teach.pred[i] = p; render();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

async function gradePrediction(i) {
  const box = document.getElementById(`pred${i}`);
  const text = box ? box.value.trim() : '';
  if (!text) { toast('Write the prediction first — grading an empty box teaches nothing'); return; }
  const step = AI.teach.data.steps[i];
  AI.teach.pred[i] = { text, busy: true, shown: (AI.teach.pred[i] || {}).shown }; render();
  try {
    const res = await api('/api/grade', {
      atom_id: RUN.atom, question: step.predict, expected: [step.answer], answer: text, lang: S.lang
    });
    if (res.error) throw new Error(res.error);
    AI.teach.pred[i] = { text, grade: res, shown: true };
  } catch (e) { AI.teach.pred[i] = { text, err: String(e.message || e) }; }
  render();
}

function finishW0() {
  const box = document.getElementById('w0sent');
  AI.teach.sentence = box ? box.value.trim() : '';
  if (!AI.teach.sentence) { toast('Write the one sentence first — it is the input W2 checks against'); return; }
  S.done.w0 = true; S.flow = null;
  toast('W0 cleared · your sentence is carried into W2 for comparison');
  render();
}

/* ---------- framework layer ---------- */
function unitsWithAtoms() {
  const s = new Set();
  A.forEach(a => { const m = /Unit (\d+)/.exec(a.source_name); if (m) s.add(m[1]); });
  return [...s].sort();
}

function viewFrameSection() {
  const f = AI.frame, d = f.data[f.unit];
  return `<div class="card" style="margin-top:var(--space-6)">
    <div class="between"><p class="eyebrow">${G('Unit framework', '單元框架')}</p>
      ${d && !d.error ? `<span class="counter">${(d.nodes || []).length} nodes · ${d.atom_count} atoms</span>` : ''}</div>
    <p class="sub" style="margin-top:var(--space-3)">Atoms are the parts; this is the shape they sit in. The system picks one of four shapes for the unit and has to say why the other three were rejected — a framework chosen for looks organises nothing.</p>
    <div class="framelegend">${SHAPES.map(([k, en, zh, why]) =>
      `<div class="fl ${d && d.shape === k ? 'on' : ''}"><b>${en}</b><span>${why}</span></div>`).join('')}</div>
    <p class="sect">Unit</p>
    <div class="rowline" style="flex-wrap:wrap">${unitsWithAtoms().map(u =>
        `<button class="chip" aria-pressed="${f.unit === u}" onclick="AI.frame.unit='${u}'; render()">Unit ${u}</button>`).join('')}
      ${['4', '5'].map(u => `<button class="chip" disabled title="No material imported yet">Unit ${u}</button>`).join('')}</div>
    <button class="btn wide" style="margin-top:var(--space-5)" onclick="buildFrame()" ${f.busy ? 'disabled' : ''}>
      ${f.busy ? 'Building the framework…' : d ? `Rebuild Unit ${f.unit}` : `Build the Unit ${f.unit} framework`}</button>
    ${f.err ? `<p class="note">The framework could not be built. Try again.</p>` : ''}
    ${f.busy ? `<div class="skel" style="margin-top:var(--space-5)"><i></i><i></i><i></i><i></i></div>
      <p class="counter">Laying out the nodes, the dependencies and the gaps in this unit…</p>` : ''}
  </div>
  ${d ? frameCard(d) : ''}`;
}

function frameCard(d) {
  if (d.error) return `<div class="card"><p class="note">${esc(d.error)}</p></div>`;
  const r = AI.frame.recall[AI.frame.unit] || {};
  const g = r.grade;
  return `<div class="card">
    <div class="between"><p class="eyebrow">${esc((SHAPES.find(s => s[0] === d.shape) || [, d.shape])[1])} · Unit ${esc(d.unit)}</p>
      <span class="tag act">${esc(d.shape)}</span></div>
    <h2 style="font-size:var(--text-lg);margin:var(--space-3) 0">${mdi(d.core_question || '')}</h2>
    <p class="why">Shape chosen because: ${esc(d.shape_reason || '')}</p>
    <div class="fnodes">${(d.nodes || []).map((n, i) => `
      <div class="fnode ${n.gap ? 'gap' : ''}">
        <span class="fn">${esc(n.id || `N${i + 1}`)}</span>
        <div><h3>${mdi(n.label || '')}</h3><p>${mdi(n.claim || '')}</p>
          <div class="wrap">${(n.atoms || []).map(a => `<span class="tag mono">${esc(a)}</span>`).join('')
    || `<span class="tag warn">no atom covers this — ${esc(n.missing || 'material not imported')}</span>`}</div>
        </div>
      </div>`).join('')}</div>
    ${(d.edges || []).length ? `<p class="sect">Dependencies</p>
      <ul class="plainlist">${d.edges.map(e => `<li><span class="mono">${esc(e.from)} → ${esc(e.to)}</span> · ${esc(e.why)}</li>`).join('')}</ul>` : ''}
    ${(d.process_steps || []).length ? `<p class="sect">Ordered steps</p>
      <ul class="plainlist ok">${d.process_steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <div class="expect" style="margin-top:var(--space-5)">
      <p class="sect" style="margin-top:0">${G('Two passes over the material', '兩遍閱讀法')}</p>
      <p class="sub"><b>First pass — skim for the shape.</b> ${esc((d.two_pass || {}).pass1 || '')}</p>
      <p class="sub" style="margin-top:var(--space-2)"><b>Second pass — summarise into this framework.</b> ${esc((d.two_pass || {}).pass2 || '')}</p>
    </div>
    <div class="qcard" style="margin-top:var(--space-5)">
      <p class="eyebrow">${G('Output it from memory', '輸出知識以鞏固記憶')}</p>
      <p class="sub" style="margin-top:var(--space-2)">${mdi(d.recall_prompt || 'Reproduce this framework from memory.')}</p>
      <p class="why">Reading a framework is not owning it. Write the nodes and the dependencies without scrolling back up; what you cannot reproduce is graded as missing structure, not as a wrong detail.</p>
      <textarea id="frecall" placeholder="Node names and what depends on what. Rough wording is fine — structure is what gets graded.">${esc(r.text || '')}</textarea>
      <div class="between" style="margin-top:var(--space-4)">
        <span class="counter">graded against the stored framework</span>
        <button class="btn" onclick="gradeFrame()" ${r.busy ? 'disabled' : ''}>${r.busy ? 'Grading…' : 'Grade my reproduction'}</button>
      </div>
      ${r.err ? `<p class="note">Scoring did not come through. Try again.</p>` : ''}
      ${g ? `<div class="graded" style="margin-top:var(--space-4)">
        <div class="between"><span class="sect" style="margin:0">Structure score</span><b class="mono">${Number(g.score).toFixed(1)}/5</b></div>
        ${(g.nodes_hit || []).length ? `<p class="sect">Reproduced</p><ul class="plainlist ok">${g.nodes_hit.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(g.nodes_missed || []).length ? `<p class="sect">Missing nodes</p><ul class="plainlist miss">${g.nodes_missed.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(g.edges_wrong || []).length ? `<p class="sect">Dependencies stated wrongly</p><ul class="plainlist miss">${g.edges_wrong.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(g.extra || []).length ? `<p class="sect">Added by you</p><ul class="plainlist">${g.extra.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <p class="sub" style="margin-top:var(--space-3)">${esc(g.verdict || '')}</p>
        ${g.next_probe ? `<p class="sect">Next probe</p><p class="sub">${esc(g.next_probe)}</p>` : ''}
      </div>` : ''}
    </div>
  </div>`;
}

async function buildFrame() {
  const u = AI.frame.unit;
  AI.frame.busy = true; AI.frame.err = null; render();
  try {
    const res = await api('/api/frame', { unit: u, lang: S.lang });
    if (res.error) throw new Error(res.error);
    AI.frame.data[u] = res;
  } catch (e) { AI.frame.err = String(e.message || e); }
  AI.frame.busy = false; render();
}

async function gradeFrame() {
  const u = AI.frame.unit;
  const box = document.getElementById('frecall');
  const text = box ? box.value.trim() : '';
  if (!text) { toast('Write the framework from memory first'); return; }
  AI.frame.recall[u] = { text, busy: true }; render();
  try {
    const res = await api('/api/frame_grade', { unit: u, answer: text, lang: S.lang });
    if (res.error) throw new Error(res.error);
    AI.frame.recall[u] = { text, grade: res };
  } catch (e) { AI.frame.recall[u] = { text, err: String(e.message || e) }; }
  render();
}
