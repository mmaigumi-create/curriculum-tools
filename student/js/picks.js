// 학생용 계산: 편제 → 고를 칸(묶음·택1 줄), 고정 학점, 고른 과목 요약
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StudentPicks = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const req = typeof require === 'function';
  const U = req ? require('../shared/js/core/util.js') : root.EduUtil;
  const C = req ? require('../shared/js/core/curriculum.js') : root.EduCurriculum;
  const { SEM_KEYS } = U;
  const GRAD = 174;
  const BASIC_CAP = 81;
  const BASIC = ['국어', '수학', '영어'];
  const AREA_MIN = { 국어: 8, 수학: 8, 영어: 8, 한국사: 6, 사회: 8, 과학: 10, 체육: 10, 예술: 10, '생활·교양': 16 };

  const noteText = (cur, i) => (C.noteAt(cur, i) || {}).text || '';
  const isMulti = r => !r.cross && r.names.length > 1;

  function slots(cur) {
    const out = cur.blocks.map(b => {
      const pick = C.blockPick(cur, b);
      const options = [];
      for (let i = b.from; i <= b.to; i++) {
        const r = cur.rows[i];
        if (!r) continue;
        for (const name of r.names) options.push({ name, kyo: r.kyo, area: U.areaOf(r.kyo), credit: U.num(r.credit) || pick.credit, row: i });
      }
      return { id: `${b.sem}|${b.from}`, sem: b.sem, from: b.from, to: b.to, value: U.num(b.value), count: pick.count, credit: pick.credit, warn: pick.warn, note: noteText(cur, b.from), options };
    });
    cur.rows.forEach((r, i) => {
      if (!isMulti(r)) return;
      for (const sem of SEM_KEYS) {
        const v = U.num(r.sem[sem]);
        if (!v || C.blockAt(cur, i, sem)) continue;
        out.push({ id: `${sem}|r${i}`, sem, from: i, to: i, value: v, count: 1, credit: v, warn: '', note: noteText(cur, i), options: r.names.map(name => ({ name, kyo: r.kyo, area: U.areaOf(r.kyo), credit: v, row: i })) });
      }
    });
    return out.sort((a, b) => a.sem.localeCompare(b.sem) || a.from - b.from);
  }

  function fixedItems(cur) {
    const out = [];
    cur.rows.forEach((r, i) => {
      if (isMulti(r)) return;
      for (const sem of SEM_KEYS) {
        const v = U.num(r.sem[sem]);
        if (!v || C.blockAt(cur, i, sem)) continue;
        out.push({ row: i, sem, name: r.names.join(r.cross ? '↔' : ', '), kyo: r.kyo, area: U.areaOf(r.kyo), credit: v });
      }
    });
    return out;
  }

  // 칸 순서대로: 없는 과목·앞 칸에서 이미 고른 과목·개수 넘침은 버린다
  function cleanPicks(sl, picks) {
    const out = {};
    const seen = new Set();
    for (const s of sl) {
      const ok = [];
      const list = picks && picks[s.id];
      for (const n of Array.isArray(list) ? list : []) {
        if (ok.length >= s.count || seen.has(n) || !s.options.some(o => o.name === n)) continue;
        ok.push(n); seen.add(n);
      }
      if (ok.length) out[s.id] = ok;
    }
    return out;
  }

  function takenElsewhere(sl, picks, slotId) {
    const m = new Map();
    for (const s of sl) if (s.id !== slotId) for (const n of Array.isArray(picks[s.id]) ? picks[s.id] : []) m.set(n, s.sem);
    return m;
  }

  function summarize(cur, picks) {
    const sl = slots(cur);
    const p = cleanPicks(sl, picks);
    const byArea = {};
    const add = (a, c) => { byArea[a] = (byArea[a] || 0) + c; };
    let fixed = 0;
    let chosen = 0;
    for (const f of fixedItems(cur)) { fixed += f.credit; add(f.area, f.credit); }
    for (const s of sl) for (const n of p[s.id] || []) {
      const o = s.options.find(x => x.name === n);
      chosen += o.credit; add(o.area, o.credit);
    }
    const total = fixed + chosen;
    const basic = BASIC.reduce((t, a) => t + (byArea[a] || 0), 0);
    const areas = Object.entries(AREA_MIN).map(([area, min]) => ({ area, min, sum: byArea[area] || 0, ok: (byArea[area] || 0) >= min }));
    const unfilled = sl.filter(s => (p[s.id] || []).length < s.count).length;
    return { fixed, chosen, total, grad: GRAD, gradOk: total >= GRAD, basic, basicCap: BASIC_CAP, basicOk: basic <= BASIC_CAP, areas, unfilled, slots: sl, picks: p };
  }

  // 학년은 3월에 바뀐다
  function gradeNow(year, today = new Date()) {
    const sy = today.getMonth() + 1 >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    return sy - Number(year) + 1;
  }
  function cohortLabel(year, today = new Date()) {
    const g = gradeNow(year, today);
    const tail = g >= 1 && g <= 3 ? `현재 ${g}학년` : g > 3 ? '졸업' : '입학 예정';
    return `${year}학년도 입학생 (${tail})`;
  }

  function findSubject(list, name) {
    const key = U.compact(name);
    return list.find(s => U.compact(s.name) === key)
      || list.find(s => U.compact(s.name) === key.replace(/\d+$/, ''))
      || null;
  }

  return { GRAD, BASIC_CAP, AREA_MIN, slots, fixedItems, cleanPicks, takenElsewhere, summarize, gradeNow, cohortLabel, findSubject };
});
