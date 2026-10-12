// 이수학점 확인: 이수현황 PDF + 수강신청 → 학생마다 졸업·교과(군)별 더 신청해야 할 학점
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduCredits = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const A = typeof require === 'function' ? require('../core/assign.js') : root.EduAssign;
  const U = typeof require === 'function' ? require('../core/util.js') : root.EduUtil;
  const { AREAS, areaOf } = U;
  const BASIC = ['국어', '수학', '영어']; // 국·수·영 합은 81학점 이하
  const GRAD_CREDITS = 174; // 졸업: 교과 174학점 이상
  const BASIC_CAP = 81;
  const newArea = () => ({ done: 0, doing: 0, common: 0, confirmed: 0, applied: 0, sum: 0, required: 0, need: 0 });
  const keyOf = (grade, cls, name) => `${grade}|${cls}|${name}`;

  function compute({ pdfs, signups, itemsFor, gradCredits = GRAD_CREDITS, basicCap = BASIC_CAP }) {
    const grad = Number(gradCredits) || 0;
    const cap = Number(basicCap) || 0;
    const issues = [];
    const notices = [];
    // PDF 학생(같은 키는 마지막 것)
    const byKey = new Map();
    let year = null;
    for (const p of pdfs) for (const s of p.students) { byKey.set(keyOf(s.grade, s.cls, s.name), s); year = year || s.year; }
    const pdfClasses = new Set([...byKey.values()].map(s => `${s.grade}|${s.cls}`));
    const noPdfClass = new Map(); // 이수현황 PDF를 올리지 않은 반의 신청 학생 수(한 줄로 알림)
    // 신청 학생 → 과목 학점
    const picksByKey = new Map();
    const matchCache = new Map();
    const missingCohort = new Set();
    for (const f of signups) {
      for (const st of f.students) {
        const k = keyOf(st.grade, st.cls, st.name);
        const p = byKey.get(k);
        if (!p) {
          const ck0 = `${st.grade}|${st.cls}`;
          if (pdfClasses.has(ck0)) issues.push({ kind: '학생', who: st.id, text: `${st.name}: 이수현황 PDF에서 찾지 못했습니다(${f.fileName}).` });
          else noPdfClass.set(ck0, (noPdfClass.get(ck0) || 0) + 1);
          continue;
        }
        const cohort = p.year - p.grade + 1;
        const ck = `${f.fileName}|${cohort}|${p.grade}`;
        if (!matchCache.has(ck)) matchCache.set(ck, matchSubjects(f, cohort, p.grade, itemsFor, issues, missingCohort));
        const credits = matchCache.get(ck);
        const prev = picksByKey.get(k) || { id: st.id, no: st.no, list: [] };
        for (const i of st.picks) if (credits[i]) prev.list.push(credits[i]);
        picksByKey.set(k, prev);
      }
    }
    for (const [ck0, n] of [...noPdfClass.entries()].sort((x, y) => x[0].localeCompare(y[0], 'ko', { numeric: true }))) {
      const [g, c] = ck0.split('|');
      issues.push({ kind: '반', who: `${g}학년 ${c}반`, text: `이수현황 PDF를 올리지 않아 신청 학생 ${n}명을 계산하지 않았습니다.` });
    }
    for (const y of missingCohort) notices.push(`${y}학년도 입학생 편제가 사전 작업에 없어 그 학생들의 신청 학점을 0으로 계산했습니다.`);

    const used = new Set();
    const students = [...byKey.entries()].map(([key, p]) => {
      const sp = picksByKey.get(key);
      const areas = {};
      for (const r of p.rows) {
        const a = areaOf(r.label);
        const x = areas[a] || (areas[a] = newArea());
        x.done += r.done; x.doing += r.doing; x.common += r.common;
        x.confirmed += r.done + r.doing + r.common;
        x.required = Math.max(x.required, r.required);
      }
      let applied = 0;
      for (const c of (sp ? sp.list : [])) {
        applied += c.credit;
        const x = areas[c.area] || (areas[c.area] = newArea());
        x.applied += c.credit;
      }
      for (const a of Object.keys(areas)) {
        const x = areas[a];
        x.sum = x.confirmed + x.applied;
        x.need = Math.max(0, x.required - x.sum);
        used.add(a);
      }
      const basic = BASIC.reduce((t, a) => t + (areas[a] ? areas[a].sum : 0), 0);
      const confirmed = p.total.done + p.total.doing + p.total.common;
      const sum = confirmed + applied;
      return {
        key, id: sp ? sp.id : '', grade: p.grade, cls: p.cls, no: sp ? sp.no : null, name: p.name,
        done: p.total.done, doing: p.total.doing, common: p.total.common,
        confirmed, applied, sum, gradNeed: Math.max(0, grad - sum),
        electivePlanned: p.total.elective, electiveLeft: Math.max(0, p.total.elective - applied), hasSignup: !!sp, areas,
        basic, basicRoom: cap - basic, basicOver: Math.max(0, basic - cap),
      };
    });
    students.sort((a, b) => a.grade - b.grade || a.cls - b.cls || (a.no ?? 999) - (b.no ?? 999) || a.name.localeCompare(b.name, 'ko'));
    const areas = [...AREAS.filter(a => used.has(a)), ...[...used].filter(a => !AREAS.includes(a))];
    return { year, areas, students, issues, notices, basicCap: cap, gradCredits: grad };
  }

  // 파일의 과목마다 { credit, area } (못 찾으면 null). 다음 학년 이후 학기의 선택 과목만 후보.
  function matchSubjects(file, cohort, grade, itemsFor, issues, missingCohort) {
    const items = [];
    let any = false;
    for (let g = grade + 1; g <= 3; g++) {
      const list = itemsFor(cohort, g);
      if (list) any = true;
      for (const it of list || []) if (it.kind === 'group' || it.kind === 'cross') items.push({ ...it, grade: g });
    }
    if (!any) { missingCohort.add(cohort); return file.subjects.map(() => null); }
    const out = file.subjects.map(() => null);
    for (const sem of ['1', '2', null]) {
      const idx = file.subjects.map((s, i) => (s.sem === sem ? i : -1)).filter(i => i >= 0);
      if (!idx.length) continue;
      const cand = items.filter(it => sem === null || it.sem === sem);
      const names = [...new Set(cand.map(it => it.name))];
      const auto = A.matchNames({ subjects: idx.map(i => ({ raw: file.subjects[i].name })) }, names);
      idx.forEach((i, k) => {
        const it = auto[k] && cand.find(c => c.name === auto[k]);
        if (it) out[i] = { credit: it.credit, area: areaOf(it.kyo), name: it.name };
        else issues.push({ kind: '과목', who: `${grade}학년`, text: `${file.subjects[i].name}${sem ? `(${sem}학기)` : ''}: 내년 이후 선택과목에서 찾지 못해 0학점으로 셌습니다(${file.fileName}).` });
      });
    }
    return out;
  }

  return { compute, areaOf, AREAS, BASIC, GRAD_CREDITS, BASIC_CAP };
});
