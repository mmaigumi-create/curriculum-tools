// 교과별 수업시수 배당표 계산: 교과 시트마다 과목 × (학년별 반·세트 열) 시수
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduAlloc = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const req = typeof require === 'function';
  const U = req ? require('../core/util.js') : root.EduUtil;
  const C = req ? require('../core/curriculum.js') : root.EduCurriculum;
  const A = req ? require('../core/assign.js') : root.EduAssign;
  const M = req ? require('../core/mapping.js') : root.EduMapping;
  const L = req ? require('./orgplan.js') : root.OrgLogic;

  // 예시 배당표처럼 3학년 전원 이수 과목은 반별이 아니라 "13개" 한 열에 모은다
  const AGGREGATE_GRADES = [3];

  function editKey(sem, sheet, name, col) {
    return `${sem}|${sheet}|${U.norm(name)}|${col}`;
  }

  // 직접 고친 값을 얹는다. 빈칸('')은 그 칸을 비운다.
  function applyEdits(row, edits, sem, sheet) {
    const cells = { ...row.auto };
    const edited = {};
    const prefix = `${sem}|${sheet}|${U.norm(row.name)}|`;
    for (const [k, v] of Object.entries(edits || {})) {
      if (!k.startsWith(prefix)) continue;
      const col = k.slice(prefix.length);
      edited[col] = true;
      if (v === '' || v === null) delete cells[col]; else cells[col] = Number(v);
    }
    const total = Object.values(cells).reduce((a, v) => a + (Number(v) || 0), 0);
    return { ...row, cells, edited, total };
  }

  function build({ sem, classes, cohortsByGrade, assignments, assignFix, candidatesFor, overrides, sheetOverrides, edits, sectionsInput, planYear }) {
    const columns = [];
    const sheets = Object.fromEntries(M.SHEETS.map(s => [s, []]));
    const unassigned = [];

    for (const g of [1, 2, 3]) {
      const cur = cohortsByGrade[g];
      if (!cur) continue;
      const items = L.planItems(C.toLegacyRows(cur), g).filter(i => i.sem === sem);
      const year = planYear ? planYear - g + 1 : cur.year;
      // 개설 반 수 직접 입력(없으면 null)
      const typed = name => {
        const v = sectionsInput && sectionsInput[L.itemKey(year, { sem, name })];
        return v === undefined || v === null || v === '' ? null : U.num(v);
      };
      const n = Math.max(U.num(classes[g]), ...items.map(it => typed(it.name) || 0));
      const key = `${g}-${sem}`;
      const assign = assignments && assignments[key];
      const fix = (assignFix && assignFix[key]) || {};
      // 반 배정 자료의 과목 이름 → 과목 번호들
      const byName = new Map();
      if (assign) {
        const auto = A.matchNames(assign, candidatesFor(g, sem));
        assign.subjects.forEach((s, idx) => {
          const name = A.nameOf(fix, idx, auto[idx]);
          if (!name) return;
          if (!byName.has(name)) byName.set(name, []);
          byName.get(name).push(idx);
        });
      }
      const inAssign = name => byName.has(name);
      const needClass = items.some(it => it.kind !== 'group' && !inAssign(it.name));
      const aggregate = AGGREGATE_GRADES.includes(g);
      if (needClass) {
        if (aggregate) columns.push({ key: `g${g}all`, grade: g, kind: 'all', label: `${n}개` });
        else for (let k = 1; k <= n; k++) columns.push({ key: `g${g}c${k}`, grade: g, kind: 'class', label: String(k) });
      }
      if (assign) for (const s of assign.sets) columns.push({ key: `g${g}s${s}`, grade: g, kind: 'set', label: s });

      const seen = new Set();
      for (const it of items) {
        if (seen.has(it.name)) continue;
        seen.add(it.name);
        const k = U.norm(it.name);
        let sheet;
        if (it.kind === 'tech') sheet = U.has(sheetOverrides, k) ? sheetOverrides[k] || null : '기술가정';
        else sheet = M.sheetFor(it.name, it.kyo, L.columnFor(it.name, it.kyo, overrides), sheetOverrides);
        const cells = {};
        if (inAssign(it.name)) {
          for (const s of assign.sets) {
            const sec = byName.get(it.name).reduce((a, idx) => a + A.cellOf(assign, fix, idx, s).sections, 0);
            if (sec) cells[`g${g}s${s}`] = it.credit * sec;
          }
        } else if (it.kind === 'fixed') {
          const k2 = typed(it.name) ?? U.num(classes[g]);
          if (aggregate) { if (k2) cells[`g${g}all`] = it.credit * k2; } else for (let c = 1; c <= k2; c++) cells[`g${g}c${c}`] = it.credit;
        } else if (it.kind === 'cross' || it.kind === 'tech') {
          // 교차이수: 앞 과목이 1반부터, 뒤 과목은 그다음 반부터(입력 없으면 학급 수를 반씩)
          const pair = it.pair || [it.name];
          const idx = Math.max(0, pair.indexOf(it.name));
          const nc = U.num(classes[g]);
          const firstCnt = typed(pair[0]) ?? Math.ceil(nc / 2);
          const range = idx === 0 ? [1, firstCnt] : [firstCnt + 1, firstCnt + (typed(it.name) ?? Math.max(0, nc - firstCnt))];
          if (aggregate) { const cnt = range[1] - range[0] + 1; if (cnt > 0) cells[`g${g}all`] = it.credit * cnt; } else for (let c = range[0]; c <= range[1]; c++) cells[`g${g}c${c}`] = it.credit;
        }
        const hours = Object.values(cells).reduce((a, v) => a + v, 0);
        if (!sheet) { if (hours) unassigned.push({ grade: g, name: it.name, hours }); continue; }
        let row = sheets[sheet].find(r => r.name === it.name);
        if (!row) { row = { name: it.name, credit: it.credit, auto: {}, grades: [] }; sheets[sheet].push(row); }
        Object.assign(row.auto, cells);
        row.grades.push(g);
      }
    }
    for (const s of Object.keys(sheets)) {
      sheets[s] = sheets[s].map(r => applyEdits(r, edits, sem, s));
    }
    return { columns, sheets, unassigned };
  }

  return { build, applyEdits, editKey, AGGREGATE_GRADES };
});
