// 상태에서 여러 탭이 같이 쓰는 값을 뽑는다(학년별 편제, 과목 후보, 과목별 반 수, 교원조직 계산)
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduDerive = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const req = typeof require === 'function';
  const C = req ? require('./curriculum.js') : root.EduCurriculum;
  const A = req ? require('./assign.js') : root.EduAssign;
  const L = req ? require('../calc/orgplan.js') : root.OrgLogic;

  const ASSIGN_KEYS = ['2-1', '2-2', '3-1', '3-2'];

  const gradeYear = (state, g) => state.planYear - g + 1;

  // 정원·현원 줄의 학년도: 직접 넣은 값, 없으면 계획 학년도의 전 해
  function staffYear(state, kind) {
    const v = state.staffYears && state.staffYears[kind];
    return Number.isFinite(v) ? v : state.planYear - 1;
  }

  // 학년 g의 편제: 편제표 탭에서 작성한 것이 우선, 없으면 PDF
  function cohortFor(state, g) {
    const y = gradeYear(state, g);
    return (state.authored && state.authored[y]) || (state.cohorts && state.cohorts[y]) || null;
  }

  // PDF로 읽은 편제를 쓴다. 같은 입학년도에 편제표 탭에서 작성한 편제가 있으면 지운다(작성한 편제가 PDF보다 먼저 쓰이므로)
  function usePdfCohort(state, cur) {
    state.cohorts[cur.year] = cur;
    if (state.authored) delete state.authored[cur.year];
  }

  function legacyRows(state, g) {
    const cur = cohortFor(state, g);
    return cur ? C.toLegacyRows(cur) : null;
  }

  // 학년 g, 학기 s('1'|'2')의 과목 목록(OrgLogic.planItems)
  function itemsFor(state, g, s) {
    const rows = legacyRows(state, g);
    if (!rows) return [];
    const items = L.planItems(rows, g);
    return s ? items.filter(i => i.sem === s) : items;
  }

  // 반 배정 자료의 과목 이름을 맞춰 볼 후보(편제 순서, 중복 없음)
  function candidatesFor(state) {
    return (g, s) => [...new Set(itemsFor(state, g, s).map(i => i.name))];
  }

  // 과목별 반 수: 반 배정 자료에서 센 값 위에 개설 반 수 직접 입력을 얹는다
  function sectionCounts(state) {
    const auto = A.sectionCounts({ planYear: state.planYear, assignments: state.assignments, assignFix: state.assignFix, candidatesFor: candidatesFor(state) });
    return { ...auto, ...(state.sectionsInput || {}) };
  }
  function autoSectionCounts(state) {
    return A.sectionCounts({ planYear: state.planYear, assignments: state.assignments, assignFix: state.assignFix, candidatesFor: candidatesFor(state) });
  }

  function orgCohorts(state) {
    return [1, 2, 3].map(g => ({ grade: g, year: gradeYear(state, g), rows: legacyRows(state, g) })).filter(c => c.rows);
  }

  function orgCompute(state) {
    return L.compute(orgCohorts(state), {
      classes: state.classes, counts: sectionCounts(state), tech: state.tech, fixedHours: state.fixedHours, overrides: state.overrides,
    });
  }

  // 반 배정 자료 키 → 그 자료의 과목별 자동 이름
  function autoNames(state, key) {
    const a = state.assignments[key];
    if (!a) return [];
    const { grade, sem } = A.parseKey(key);
    return A.matchNames(a, candidatesFor(state)(grade, sem));
  }

  // 사전 작업 완료 개수(기본 설정, 편제, 반 배정, 과목 배정)
  function prepStatus(state) {
    const basic = Number.isFinite(state.planYear) && [1, 2, 3].every(g => Number(state.classes[g]) > 0);
    const cohorts = [1, 2, 3].filter(g => cohortFor(state, g)).length;
    const assigns = ASSIGN_KEYS.filter(k => state.assignments[k]).length;
    const missingCols = cohorts ? unmappedSubjects(state).length : 0;
    return {
      basic, cohorts, assigns, mapping: cohorts > 0 && missingCols === 0, missingCols,
      done: (basic ? 1 : 0) + (cohorts === 3 ? 1 : 0) + (assigns === 4 ? 1 : 0) + (cohorts > 0 && missingCols === 0 ? 1 : 0),
    };
  }

  // 모든 학년 과목 목록(이름 하나에 한 줄): [{ key, name, kyo, grades:Set, kinds:Set }]
  function allSubjects(state) {
    const seen = new Map();
    for (const g of [1, 2, 3]) {
      for (const it of itemsFor(state, g)) {
        const k = L.norm(it.name);
        if (!seen.has(k)) seen.set(k, { key: k, name: it.name, kyo: it.kyo, grades: new Set(), kinds: new Set() });
        seen.get(k).grades.add(g);
        seen.get(k).kinds.add(it.kind);
      }
    }
    return [...seen.values()];
  }

  function unmappedSubjects(state) {
    return allSubjects(state).filter(s => !s.kinds.has('tech') && !L.columnFor(s.name, s.kyo, state.overrides));
  }

  // 배당표·이동수업 계산(계산 모듈은 이 파일보다 뒤에 불러올 수 있어 부를 때 찾는다)
  const AL = () => (req ? require('../calc/allocation.js') : root.EduAlloc);
  const MV = () => (req ? require('../calc/moving.js') : root.EduMoving);
  function allocFor(state, sem) {
    return AL().build({
      sem, classes: state.classes, cohortsByGrade: { 1: cohortFor(state, 1), 2: cohortFor(state, 2), 3: cohortFor(state, 3) },
      assignments: state.assignments, assignFix: state.assignFix, candidatesFor: candidatesFor(state),
      overrides: state.overrides, sheetOverrides: state.sheetOverrides, edits: state.alloc.edits,
      sectionsInput: state.sectionsInput || {}, planYear: state.planYear,
    });
  }
  function movingFor(state, sem) {
    return MV().build({ sem, assignments: state.assignments, assignFix: state.assignFix, candidatesFor: candidatesFor(state), edits: state.moving.edits });
  }

  return { allocFor, movingFor, ASSIGN_KEYS, gradeYear, staffYear, cohortFor, usePdfCohort, legacyRows, itemsFor, candidatesFor, sectionCounts, autoSectionCounts, orgCohorts, orgCompute, autoNames, prepStatus, allSubjects, unmappedSubjects };
});
