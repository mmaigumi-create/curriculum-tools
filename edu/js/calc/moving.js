// 이동수업 배정표 계산: 학기마다 2·3학년 세트별 과목·인원·강의실·담당 교사
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduMoving = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const A = typeof require === 'function' ? require('../core/assign.js') : root.EduAssign;

  const GRADES = [2, 3];
  const editKey = (sem, grade, set, idx) => `${sem}|${grade}|${set}|${idx}`;

  function build({ sem, assignments, assignFix, candidatesFor, edits }) {
    const grades = [];
    for (const g of GRADES) {
      const key = `${g}-${sem}`;
      const a = assignments && assignments[key];
      if (!a) continue;
      const fix = (assignFix && assignFix[key]) || {};
      const auto = A.matchNames(a, candidatesFor(g, sem));
      const sets = a.sets.map(set => {
        const items = [];
        a.subjects.forEach((s, si) => {
          const c = A.cellOf(a, fix, si, set);
          if (!c.present || !c.sections) return;
          const subj = A.nameOf(fix, si, auto[si]) || s.raw;
          const counts = c.counts.length === c.sections ? c.counts : A.split(c.total, c.sections);
          counts.forEach(cnt => {
            const idx = items.length;
            const e = (edits || {})[editKey(sem, g, set, idx)] || {};
            const hasCount = e.count !== undefined && e.count !== '';
            const hasRoom = e.room !== undefined && e.room !== '';
            const hasTeacher = e.teacher !== undefined && e.teacher !== '';
            items.push({
              idx, subj, count: hasCount ? Number(e.count) : cnt, room: hasRoom ? String(e.room) : '', teacher: hasTeacher ? String(e.teacher) : '',
              auto: { count: cnt }, edited: { count: hasCount, room: hasRoom, teacher: hasTeacher },
            });
          });
        });
        return { name: set, items };
      });
      grades.push({ grade: g, sets });
    }
    return { grades };
  }

  return { build, editKey, GRADES };
});
