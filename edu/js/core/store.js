// 화면 전체가 같이 쓰는 상태. 브라우저(localStorage)에 자동 저장하고, 예전 앱 저장값을 옮겨 온다.
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduStore = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const C = typeof require === 'function' ? require('./curriculum.js') : root.EduCurriculum;

  const KEY = 'edu-auto.v2';
  const OLD_KEY = 'orgplan.v1';

  function defaultState(now = new Date()) {
    const planYear = now.getFullYear() + 1;
    return {
      version: 2,
      planYear,
      classes: {},
      cohorts: {},
      authored: {},
      pyeonjeYear: null,
      assignments: {},
      assignFix: {},
      overrides: {},
      sheetOverrides: {},
      tech: {},
      fixedHours: {},
      sectionsInput: {}, // 개설 반 수 직접 입력 { OrgLogic.itemKey: 반 수 }
      staff: { 정원: {}, 현원: {} },
      staffYears: {},
      alloc: { edits: {}, short: {}, notice: null, refRows: [] },
      moving: { edits: {} },
      share: { school: '', years: [] },
      ui: { tab: 'prep', menuCollapsed: false, allocSem: '1', allocSheet: '국어', movingSem: '1', creditsGrade: 'all', creditsOnlyShort: false, orgGrade: 1, mapOnlyChanged: false, showAllCols: false },
    };
  }

  // 빠진 칸은 기본값으로 채운다(나중에 칸이 늘어나도 예전 저장값이 깨지지 않게)
  function withDefaults(s) {
    const d = defaultState();
    const out = { ...d, ...s };
    for (const k of ['alloc', 'moving', 'ui', 'staff', 'share']) out[k] = { ...d[k], ...(s[k] || {}) };
    out.staff = { 정원: {}, 현원: {}, ...out.staff };
    return out;
  }

  // 예전 교원조직계획 앱의 저장값 → 새 상태
  function migrate(old) {
    const state = defaultState();
    const notices = [];
    if (!old || typeof old !== 'object') return { state, notices };
    if (Number.isFinite(old.planYear)) state.planYear = old.planYear;
    for (const k of ['classes', 'overrides', 'tech', 'fixedHours', 'staffYears']) if (old[k]) state[k] = { ...old[k] };
    if (old.staff) state.staff = { 정원: { ...(old.staff.정원 || {}) }, 현원: { ...(old.staff.현원 || {}) } };
    for (const [y, c] of Object.entries(old.cohorts || {})) {
      try { state.cohorts[y] = C.fromLegacy({ ...c, year: c.year ?? Number(y) }); } catch (e) { /* 못 옮긴 편제는 버린다 */ }
    }
    if (old.images && Object.keys(old.images).length) notices.push('예전에 올린 반 배정 이미지는 새 방식(세트별 계산)으로 다시 읽어야 합니다. 사전 작업에서 다시 올려 주세요.');
    return { state, notices };
  }

  function read(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }

  function create(storage) {
    const notices = [];
    let state;
    const raw = read(storage, KEY);
    if (raw) {
      try { state = withDefaults(JSON.parse(raw)); } catch (e) {
        state = defaultState();
        notices.push('저장된 값이 깨져 처음 상태로 시작합니다.');
      }
    } else {
      const oldRaw = read(storage, OLD_KEY);
      let old = null;
      try { old = oldRaw ? JSON.parse(oldRaw) : null; } catch (e) { old = null; }
      const m = migrate(old);
      state = m.state;
      notices.push(...m.notices);
    }
    const subs = new Set();
    const api = {
      get state() { return state; },
      notices,
      save() {
        try { storage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 저장 못 해도 계산은 된다 */ }
      },
      // fn(state)로 고치고 저장한 뒤 구독자에게 알린다. opts.silent면 알리지 않는다(입력 중 다시 그리기 방지)
      update(fn, opts = {}) {
        fn(state);
        api.save();
        if (!opts.silent) subs.forEach(f => f(state));
      },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      reset() {
        state = defaultState();
        api.save();
        subs.forEach(f => f(state));
      },
    };
    return api;
  }

  return { KEY, OLD_KEY, defaultState, migrate, create, withDefaults };
});
