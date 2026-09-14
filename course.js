/* course.js — real 6.431x Fall 2026 syllabus and the course's stated learning outcomes.
   Source: 6.431x Fall 2026 Syllabus (uploaded) + course outcome statement (uploaded).
   Deadlines are stated in the syllabus as 11:59 AM UTC; shown here in HKT (UTC+8) = 19:59. */

const SYLLABUS = [
  { u: 0, name: 'Overview', secs: '—', lec: [], due: null, atoms: 0, exam: null },
  { u: 1, name: 'Probability models and axioms', secs: '1.1–1.2', lec: ['L1'], due: '2026-09-09', atoms: 0, exam: 1 },
  { u: 2, name: 'Conditioning and independence', secs: '1.3–1.5', lec: ['L2', 'L3'], due: '2026-09-16', atoms: 0, exam: 1 },
  { u: 3, name: 'Counting', secs: '1.6', lec: ['L4'], due: '2026-09-23', atoms: 0, exam: 1 },
  { u: 4, name: 'Discrete random variables', secs: '2.1–2.7', lec: ['L5', 'L6', 'L7'], due: '2026-10-02', atoms: 0, exam: 1 },
  { u: 5, name: 'Continuous random variables', secs: '3.1–3.5', lec: ['L8', 'L9', 'L10'], due: '2026-10-16', atoms: 0, exam: 2 },
  { u: 6, name: 'Further topics on random variables', secs: '4.1–4.3, 4.5', lec: ['L11', 'L12', 'L13'], due: '2026-10-28', atoms: 0, exam: 2 },
  { u: 7, name: 'Bayesian inference', secs: '3.6, 8.1–8.4', lec: ['L14', 'L15', 'L16', 'L17*'], due: '2026-11-11', atoms: 0, exam: 2 },
  { u: 8, name: 'Limit theorems and classical statistics', secs: '5.1–5.4, pp. 466–475', lec: ['L18', 'L19', 'L20'], due: '2026-11-25', atoms: 0, exam: 3 },
  { u: 9, name: 'Bernoulli and Poisson processes', secs: '6.1–6.2', lec: ['L21', 'L22', 'L23'], due: '2026-12-09', atoms: 0, exam: 3 },
  { u: 10, name: 'Markov chains', secs: '7.1–7.4', lec: ['L24', 'L25', 'L26*'], due: '2026-12-18', atoms: 0, exam: 3 }
];

const EXAMS = [
  { n: 'Exam 1', scope: 'L1 – L7', units: [1, 2, 3, 4], due: '2026-10-07' },
  { n: 'Exam 2', scope: 'L8 – L17', units: [5, 6, 7], due: '2026-11-16' },
  { n: 'Final exam', scope: 'Everything', units: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], due: '2026-12-21' }
];

/* The twelve outcomes the course states for itself, mapped to the units that carry them.
   Coverage is computed from how many atoms exist in those units — nothing else. */
const OUTCOMES = [
  { id: 'C1', cls: 'Conceptual', t: 'Master the basic concepts associated with probability models（機率模型）', u: [1, 2] },
  { id: 'C2', cls: 'Conceptual', t: 'Translate models described in words into mathematical ones', u: [1, 2, 3, 4] },
  { id: 'C3', cls: 'Conceptual', t: 'Understand the concepts and assumptions underlying Bayesian（貝氏）and classical inference（古典推論）', u: [7, 8] },
  { id: 'C4', cls: 'Conceptual', t: 'Gain familiarity with the range of applications of inference methods', u: [7, 8] },
  { id: 'T1', cls: 'Technical', t: 'Become familiar with basic and common probability distributions（機率分佈）', u: [4, 5] },
  { id: 'T2', cls: 'Technical', t: 'Use conditioning（條件化）to simplify the analysis of complicated models', u: [2, 4, 5, 6] },
  { id: 'T3', cls: 'Technical', t: 'Manipulate probability mass functions（機率質量函數）, densities（密度）and expectations（期望值）with facility', u: [4, 5, 6] },
  { id: 'T4', cls: 'Technical', t: 'Develop a solid understanding of conditional expectation（條件期望）and its role in inference', u: [6, 7] },
  { id: 'T5', cls: 'Technical', t: 'Understand the laws of large numbers（大數法則）and use them when appropriate', u: [8] },
  { id: 'T6', cls: 'Technical', t: 'Apply the basic inference methodologies — estimation（估計）and hypothesis testing（假設檢定）', u: [7, 8] },
  { id: 'T7', cls: 'Technical', t: 'Understand the Bernoulli（伯努利）and Poisson（泊松）processes and their use in modelling', u: [9] },
  { id: 'T8', cls: 'Technical', t: 'Formulate simple dynamical models as Markov chains（馬可夫鏈）and analyse them', u: [10] }
];

/* per-unit atom counts, derived from the live atom set rather than typed in */
function unitAtomCounts() {
  const c = {};
  (typeof ATOMS !== 'undefined' ? ATOMS : []).forEach(a => {
    const m = /Unit (\d+)/.exec(a.source_name || '');
    const u = m ? +m[1] : 0;
    c[u] = (c[u] || 0) + 1;
  });
  SYLLABUS.forEach(s => s.atoms = c[s.u] || 0);
  return c;
}

function outcomeState(o) {
  unitAtomCounts();
  const rel = SYLLABUS.filter(s => o.u.includes(s.u));
  const withAtoms = rel.filter(s => s.atoms > 0);
  const atoms = rel.reduce((a, s) => a + s.atoms, 0);
  const frac = rel.length ? withAtoms.length / rel.length : 0;
  return {
    atoms, frac,
    label: frac === 0 ? 'not started' : frac < 1 ? 'partial' : 'units covered',
    cls: frac === 0 ? '' : frac < 1 ? 'act' : 'pass',
    units: rel.map(s => `Unit ${s.u}${s.atoms ? ` · ${s.atoms}` : ''}`).join(' · ')
  };
}

function daysTo(d) {
  const t = new Date(d + 'T11:59:00Z') - new Date('2026-09-13T05:09:00Z');
  return Math.ceil(t / 86400000);
}

/* one merged, date-sorted deadline list: problem sets from SYLLABUS + the three exams */
function buildDeadlines() {
  unitAtomCounts();
  const ps = SYLLABUS.filter(s => s.due).map(s => ({
    n: `Problem Set ${s.u}`, date: s.due, scope: `Unit ${s.u} · ${s.lec.join(', ')}`,
    atoms: s.atoms, gap: s.atoms ? '' : 'no atoms yet'
  }));
  const ex = EXAMS.map(e => {
    const a = e.units.reduce((t, u) => t + (SYLLABUS.find(s => s.u === u) || { atoms: 0 }).atoms, 0);
    const empty = e.units.filter(u => !(SYLLABUS.find(s => s.u === u) || { atoms: 0 }).atoms);
    return {
      n: e.n, date: e.due, scope: e.scope, atoms: a,
      gap: empty.length ? `${empty.length} unit${empty.length === 1 ? '' : 's'} empty` : ''
    };
  });
  return ps.concat(ex)
    .map(d => ({ ...d, days: daysTo(d.date) }))
    .filter(d => d.days > 0)
    .sort((a, b) => a.date < b.date ? -1 : 1);
}
const DEADLINES = buildDeadlines();
