// 편제표를 칸 배열로 펼친다. 화면·엑셀·한글·PDF가 모두 같은 배치를 쓴다.
// 열(13): 교과 | 구분 | 과목 | 기본단위 | 편성단위 | 1-1 1-2 | 2-1 2-2 | 3-1 3-2 | 비고(선택) | 편성단위합
// 칸: { text, rowspan?, colspan?, cls, head?, grade?, align?, edit?: {...}, row? }
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduPyeonjeLayout = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const req = typeof require === 'function';
  const U = req ? require('./util.js') : root.EduUtil;
  const C = req ? require('./curriculum.js') : root.EduCurriculum;
  const { SEM_KEYS } = U;
  const COLS = 13;
  // 엑셀 열 너비(글자 수) — 한글 표 열 비율에도 쓴다
  const COL_WIDTHS = [10, 5, 36, 5, 5, 6, 6, 6, 6, 6, 6, 10, 6];

  const gradeOf = sem => Number(sem[0]);
  const blank = v => (U.isBlank(v) ? '' : v);

  function subjText(r) {
    return r.names.join(r.cross ? '↔' : ', ');
  }

  function layout(cur) {
    const rows = [];
    // 머리 2줄
    rows.push([
      { text: '교과', rowspan: 2, head: true },
      { text: '과목', colspan: 2, rowspan: 2, head: true },
      { text: '기본\n단위', rowspan: 2, head: true },
      { text: '편성\n단위', rowspan: 2, head: true },
      { text: '1학년', colspan: 2, head: true, grade: 1, cls: 'g1' },
      { text: '2학년', colspan: 2, head: true, grade: 2, cls: 'g2' },
      { text: '3학년', colspan: 2, head: true, grade: 3, cls: 'g3' },
      { text: '비고\n(선택)', rowspan: 2, head: true },
      { text: '편성\n단위합', rowspan: 2, head: true },
    ]);
    rows.push(SEM_KEYS.map(k => ({ text: `${k[2]}학기`, head: true, grade: gradeOf(k), cls: `h${gradeOf(k)}` })));

    const n = cur.rows.length;
    const kyoKey = i => U.norm(cur.rows[i].kyo);
    const gubunKey = i => `${kyoKey(i)}|${U.norm(cur.rows[i].gubun)}`;
    const runLen = (i, keyFn) => { let j = i; while (j + 1 < n && keyFn(j + 1) === keyFn(i)) j++; return j - i + 1; };
    const secs = C.sections(cur);

    for (let i = 0; i < n; i++) {
      const r = cur.rows[i];
      const line = [];
      if (i === 0 || kyoKey(i) !== kyoKey(i - 1)) {
        const len = runLen(i, kyoKey);
        line.push({ text: r.kyo, rowspan: len, cls: 'kyo', edit: { kind: 'kyo', from: i, to: i + len - 1 } });
      }
      if (i === 0 || gubunKey(i) !== gubunKey(i - 1)) {
        const len = runLen(i, gubunKey);
        line.push({ text: r.gubun, rowspan: len, cls: 'gubun', edit: { kind: 'gubun', from: i, to: i + len - 1 } });
      }
      line.push({ text: subjText(r), cls: 'subj', align: 'left', edit: { kind: 'row', idx: i, field: 'names' } });
      line.push({ text: blank(r.base), edit: { kind: 'row', idx: i, field: 'base' } });
      line.push({ text: blank(r.credit), edit: { kind: 'row', idx: i, field: 'credit' } });
      for (const sem of SEM_KEYS) {
        const g = gradeOf(sem);
        const b = C.blockAt(cur, i, sem);
        if (b) {
          if (b.from === i) line.push({ text: blank(b.value), rowspan: b.to - b.from + 1, cls: `blk c${g}`, grade: g, edit: { kind: 'block', sem, from: b.from } });
          continue;
        }
        line.push({ text: blank(r.sem[sem]), cls: `c${g}`, grade: g, edit: { kind: 'sem', idx: i, sem } });
      }
      const note = C.noteAt(cur, i);
      if (note) {
        if (note.from === i) line.push({ text: note.text, rowspan: note.to - note.from + 1, cls: 'note', edit: { kind: 'note', from: note.from, to: note.to } });
      } else line.push({ text: '', cls: 'note-empty', edit: { kind: 'note', from: i, to: i } });
      const sec = secs.find(s => s.from === i);
      if (sec) line.push({ text: sec.sum, rowspan: sec.to - sec.from + 1, cls: 'secsum', edit: { kind: 'sec', from: sec.from, to: sec.to } });
      line.row = i;
      rows.push(line);
    }

    // 교과 합계 줄
    const t = C.semTotals(cur);
    rows.push(Object.assign([
      { text: '', colspan: 3, cls: 'sum' },
      { text: t.total, colspan: 2, cls: 'sum' },
      ...SEM_KEYS.map(k => ({ text: t[k], cls: `sum c${gradeOf(k)}`, grade: gradeOf(k) })),
      { text: '', cls: 'sum' },
      { text: t.total, cls: 'sum' },
    ], { kind: 'total' }));

    // 창의적 체험활동 3줄: 학기 시간을 넣으면 왼쪽 칸은 학기 합(학기가 모두 비면 직접 입력)
    const cc = C.ccTotals(cur);
    C.CC_KINDS.forEach((kind, k) => {
      const v = cur.cc?.[kind] || {};
      const line = [];
      if (k === 0) line.push({ text: '창의적 체험활동', rowspan: 3, cls: 'kyo' });
      line.push({ text: C.CC_LABELS[kind], colspan: 2, cls: 'cc-label' });
      const auto = SEM_KEYS.some(s => !U.isBlank(v[s]));
      line.push(auto
        ? { text: C.ccKindTotal(cur, kind), colspan: 2, cls: 'cc-auto' }
        : { text: blank(v.total), colspan: 2, edit: { kind: 'cc', ccKind: kind, key: 'total' } });
      for (const sem of SEM_KEYS) line.push({ text: blank(v[sem]), cls: `c${gradeOf(sem)}`, grade: gradeOf(sem), edit: { kind: 'cc', ccKind: kind, key: sem } });
      line.push({ text: '' });
      if (k === 0) line.push({ text: cc.total, rowspan: 3, cls: 'ccsum' });
      line.kind = 'cc';
      rows.push(line);
    });

    // 이수 단위 계
    const add = (a, b) => (b === '' ? '' : Math.round((a + b) * 100) / 100);
    rows.push(Object.assign([
      { text: '이수 단위 계', colspan: 3, cls: 'sum' },
      { text: add(t.total, cc.total), colspan: 2, cls: 'sum' },
      ...SEM_KEYS.map(k => ({ text: add(t[k], cc[k]), cls: `sum c${gradeOf(k)}`, grade: gradeOf(k) })),
      { text: '', cls: 'sum' },
      { text: add(t.total, cc.total), cls: 'sum' },
    ], { kind: 'grand' }));

    return { rows, head: 2, cols: COLS };
  }

  // rowspan·colspan을 따라 각 칸의 실제 격자 위치(행, 열)를 붙인다(한글 표 주소용)
  function addresses(rows) {
    const taken = [];
    return rows.map((r, ri) => {
      let col = 0;
      return r.map(c => {
        while (taken[ri] && taken[ri][col]) col++;
        const at = { row: ri, col };
        for (let dr = 0; dr < (c.rowspan || 1); dr++) for (let dc = 0; dc < (c.colspan || 1); dc++) (taken[ri + dr] ||= [])[col + dc] = true;
        col += c.colspan || 1;
        return { ...c, ...at };
      });
    });
  }

  return { layout, addresses, COLS, COL_WIDTHS, subjText };
});
