// 반 배정 자료(Assign) 공통 처리: 과목 이름 맞추기, 세트 칸별 반 수·반별 인원, 과목별 반 수 합
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduAssign = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const req = typeof require === 'function';
  const U = req ? require('./util.js') : root.EduUtil;
  const I = req ? require('../read/imgparse.js') : root.ImgParse;
  const L = req ? require('../calc/orgplan.js') : root.OrgLogic;

  const MATCH_MIN = 0.6;

  // 과목마다 자동으로 맞춘 편제 과목 이름(못 맞추면 null). candidates: 편제 순서의 과목 이름
  function matchNames(assign, candidates) {
    const used = new Set();
    const byCompact = new Map(candidates.map(c => [U.compact(c), c]));
    const out = assign.subjects.map(s => {
      if (s.name && candidates.includes(s.name)) { used.add(s.name); return s.name; }
      const hit = byCompact.get(U.compact(s.raw));
      if (hit) { used.add(hit); return hit; }
      return undefined;
    });
    return out.map((v, k) => {
      if (v !== undefined) return v;
      const s = assign.subjects[k];
      const rest = candidates.filter(c => !used.has(c));
      const m = s.raw && rest.length ? I.bestMatch(s.raw, s.raw.replace(/\s/g, '').length, rest) : null;
      if (m && m.score >= MATCH_MIN) { used.add(m.name); return m.name; }
      return null;
    });
  }

  function nameOf(fix, idx, auto) {
    if (fix && U.has(fix.names, idx)) return fix.names[idx] || null;
    return auto ?? null;
  }

  function split(total, sections) {
    if (!(sections > 0)) return [total];
    const base = Math.floor(total / sections);
    const extra = total % sections;
    return Array.from({ length: sections }, (_, i) => base + (i < extra ? 1 : 0));
  }

  // 세트 칸 하나. present: 그 세트에 개설됐는지
  function cellOf(assign, fix, idx, set) {
    const s = assign.subjects[idx];
    const raw = s ? s.cells[set] : undefined;
    const f = fix && fix.cells ? fix.cells[`${idx}|${set}`] : null;
    const edited = { sections: !!(f && U.has(f, 'sections')), counts: !!(f && Array.isArray(f.counts)) };
    if (raw === undefined && !edited.counts && !edited.sections) {
      return { present: false, total: 0, sections: 0, counts: [], flags: [], edited };
    }
    const flags = [];
    let counts;
    let sections;
    if (edited.counts) {
      counts = f.counts.slice();
      sections = 0;
      for (const c of counts) {
        const r = I.sectionsFor(c);
        sections += r.sections;
        if (r.flag && !edited.sections) flags.push(r.flag);
      }
    } else {
      const total = raw ?? 0;
      const r = I.sectionsFor(total);
      sections = r.sections;
      if (r.flag && !edited.sections) flags.push(r.flag);
      counts = null;
    }
    if (edited.sections) sections = Math.max(0, Number(f.sections) || 0);
    const total = counts ? counts.reduce((a, c) => a + (c || 0), 0) : (raw ?? 0);
    if (!counts) counts = sections > 0 ? split(total, sections) : [total];
    return { present: true, total, sections, counts, flags, edited };
  }

  // 과목 비고: 세트 칸 비고 + 전체 인원 검산
  function subjectFlags(assign, fix, idx) {
    const s = assign.subjects[idx];
    const flags = [];
    let sum = 0;
    for (const set of assign.sets) {
      const c = cellOf(assign, fix, idx, set);
      if (!c.present) continue;
      flags.push(...c.flags.map(m => `${set}세트: ${m}`));
      sum += c.total;
    }
    if (s && s.total !== null && s.total !== undefined && sum !== s.total) {
      flags.push(`세트 인원 합(${sum}명)이 전체합계(${s.total}명)와 다릅니다`);
    }
    return flags;
  }

  function sectionsOfSubject(assign, fix, idx) {
    return assign.sets.reduce((a, set) => a + cellOf(assign, fix, idx, set).sections, 0);
  }

  // 반 배정 자료 키 '2-1' → { grade: 2, sem: '1' }
  function parseKey(key) {
    const [g, s] = key.split('-');
    return { grade: Number(g), sem: s };
  }

  // 모든 반 배정 자료 → { OrgLogic.itemKey(입학년도, {sem, name}): 반 수 }
  function sectionCounts({ planYear, assignments, assignFix, candidatesFor }) {
    const out = {};
    for (const [key, a] of Object.entries(assignments || {})) {
      if (!a) continue;
      const { grade, sem } = parseKey(key);
      const year = planYear - grade + 1;
      const fix = (assignFix || {})[key] || {};
      const auto = matchNames(a, candidatesFor(grade, sem));
      a.subjects.forEach((s, idx) => {
        const name = nameOf(fix, idx, auto[idx]);
        if (!name) return;
        const k = L.itemKey(year, { sem, name });
        out[k] = (out[k] || 0) + sectionsOfSubject(a, fix, idx);
      });
    }
    return out;
  }

  return { matchNames, nameOf, cellOf, subjectFlags, sectionsOfSubject, sectionCounts, parseKey, split };
});
