// 교과별 수업시수 배당표 → 엑셀 (예시 파일과 같은 시트 구성)
// 유의사항 / 선택교과 이동수업 반배정 / 교과별 시트(YY-S 교과) / 참고사항 / 제출현황
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduAllocXlsx = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const req = typeof require === 'function';
  const M = req ? require('../core/mapping.js') : root.EduMapping;
  const MX = req ? require('./moving-xlsx.js') : root.EduMovingXlsx;

  const DEFAULT_NOTICE = [
    '각 세트에 배정된 교과는 동시에 진행되는 수업이므로 이를 참고하여 시수표를 배정하셔야 합니다!',
    '① 각 세트에서 한 교사가 2개 이상의 교과목을 담당할 수 없음',
    '   (예를 들어, 3학년 A세트에 화법과 작문, 언어와 매체, 심화 국어가 편성되어 있으면 A세트 수업을 위해 최소 3명의 국어 교사가 필요함)',
    '② 각 세트에서 한 교과에 한 개 이상의 반이 편성될 수 있음. 이 경우 편성된 반 개수만큼 시수가 배정되고, 편성된 반 개수만큼의 교사가 배정되어야 함.',
    '   (예를 들어, 3학년 A세트 화법과 작문이 8시수이면 4시수 수업이 2개 반 운영되는 것임 [4시수 × 2개 반 = 8시수])',
    '③ 2학년 원반 수업의 경우 1교사 최대 15시간까지만 배정 가능함.',
  ].join('\n');

  const thin = { style: 'thin', color: { argb: 'FF9CA3AF' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const HEAD = 'FFF1F2F8';
  const GRADE_TOP = { 1: 'FFDFE3FF', 2: 'FFCDF3E4', 3: 'FFFFE0CC' };
  const GRADE_SUB = { 1: 'FFEEF0FF', 2: 'FFE6F9F1', 3: 'FFFFF0E5' };
  const colLetter = n => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const L = c => colLetter(c - 1); // 1부터 세는 열 번호 → 글자
  const TEACHER_ROWS = 20;

  function style(cell, { bold, bg, align = 'center', wrap } = {}) {
    cell.border = BORDER;
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText: !!wrap };
    if (bold) cell.font = { bold: true };
    if (bg) cell.fill = fill(bg);
  }
  const labelValue = label => (/^\d+$/.test(label) ? Number(label) : label);

  function noticeSheet(wb, notice) {
    const ws = wb.addWorksheet('시수배당 시 유의사항', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 4 }, { width: 120 }];
    ws.mergeCells('A1:B1');
    ws.getCell('A1').value = '교과별 수업 시수 배당 시 유의사항';
    ws.getCell('A1').font = { bold: true, size: 15 };
    ws.getRow(1).height = 28;
    String(notice || '').split('\n').forEach((line, i) => {
      const c = ws.getCell(i + 2, 2);
      c.value = line;
      c.alignment = { wrapText: true, vertical: 'top' };
      if (i === 0) c.font = { bold: true, color: { argb: 'FFB42318' } };
    });
  }

  function subjectSheet(wb, name, sheet, { planYear, sem, alloc, short }) {
    const ws = wb.addWorksheet(name, {
      views: [{ showGridLines: false, state: 'frozen', xSplit: 4, ySplit: 3 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const cols = alloc.columns;
    const first = 5; // E열부터 반·세트 열
    const lastCol = first + cols.length - 1;
    const lastData = Math.max(lastCol, 4);
    const tcol = lastData + 1; // 교사 줄의 합계 열
    ws.columns = [{ width: 5 }, { width: 22 }, { width: 10 }, { width: 7 }, ...cols.map(() => ({ width: 4.6 })), { width: 7 }];
    // 1행 제목
    ws.mergeCells(1, 1, 1, tcol);
    ws.getCell(1, 1).value = `${planYear}학년도 ${sem}학기 수업배당표 - (${sheet})과`;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.getCell(1, 1).alignment = { horizontal: 'center' };
    ws.getRow(1).height = 26;
    // 2행 학년 머리, 3행 열 이름
    ['순번', '정식과목명', '단축과목명', '시수'].forEach((t, i) => {
      style(ws.getCell(2, i + 1), { bg: HEAD });
      ws.getCell(3, i + 1).value = t;
      style(ws.getCell(3, i + 1), { bold: true, bg: HEAD });
    });
    for (const g of [1, 2, 3]) {
      const idx = cols.map((c, i) => (c.grade === g ? i : -1)).filter(i => i >= 0);
      if (!idx.length) continue;
      const a = first + idx[0]; const b = first + idx[idx.length - 1];
      if (b > a) ws.mergeCells(2, a, 2, b);
      ws.getCell(2, a).value = `${g}  학  년`;
      for (let c = a; c <= b; c++) style(ws.getCell(2, c), { bold: true, bg: GRADE_TOP[g] });
    }
    cols.forEach((col, i) => { const c = ws.getCell(3, first + i); c.value = labelValue(col.label); style(c, { bold: true, bg: GRADE_SUB[col.grade] }); });

    // 과목 줄
    const rows = (alloc.sheets && alloc.sheets[sheet]) || [];
    let r = 4;
    rows.forEach((row, k) => {
      ws.getCell(r, 1).value = k + 1;
      ws.getCell(r, 2).value = row.name;
      ws.getCell(r, 3).value = (short && short[row.name]) || null;
      cols.forEach((col, i) => { const v = row.cells[col.key]; ws.getCell(r, first + i).value = v ? v : null; });
      ws.getCell(r, 4).value = cols.length ? { formula: `SUM(${L(first)}${r}:${L(lastCol)}${r})`, result: row.total } : row.total;
      for (let c = 1; c <= lastData; c++) style(ws.getCell(r, c), { align: c === 2 ? 'left' : 'center' });
      r++;
    });
    // 합계 줄
    ws.mergeCells(r, 1, r, 3);
    ws.getCell(r, 1).value = '합계';
    for (let c = 4; c <= lastData; c++) ws.getCell(r, c).value = r > 4 ? { formula: `SUM(${L(c)}4:${L(c)}${r - 1})` } : null;
    for (let c = 1; c <= lastData; c++) style(ws.getCell(r, c), { bold: true, bg: HEAD });
    r++;

    // 교사 줄(교과에서 채움)
    const th = r;
    ['순번', '정식과목명', '단축과목명', '교사명'].forEach((t, i) => { ws.getCell(th, i + 1).value = t; style(ws.getCell(th, i + 1), { bold: true, bg: HEAD }); });
    cols.forEach((col, i) => { const c = ws.getCell(th, first + i); c.value = labelValue(col.label); style(c, { bold: true, bg: GRADE_SUB[col.grade] }); });
    ws.getCell(th, tcol).value = '합계';
    style(ws.getCell(th, tcol), { bold: true, bg: HEAD });
    for (let k = 1; k <= TEACHER_ROWS; k++) {
      const rr = th + k;
      ws.getCell(rr, 1).value = k;
      ws.getCell(rr, tcol).value = cols.length ? { formula: `SUM(${L(first)}${rr}:${L(lastCol)}${rr})` } : null;
      for (let c = 1; c <= tcol; c++) style(ws.getCell(rr, c));
    }
    const sr = th + TEACHER_ROWS + 1;
    ws.mergeCells(sr, 1, sr, 3);
    ws.getCell(sr, 1).value = '합계';
    for (let c = first; c <= tcol; c++) ws.getCell(sr, c).value = { formula: `SUM(${L(c)}${th + 1}:${L(c)}${th + TEACHER_ROWS})` };
    for (let c = 1; c <= tcol; c++) style(ws.getCell(sr, c), { bold: true, bg: HEAD });
    const nr = sr + 1;
    ws.getCell(nr, 1).value = '참고사항';
    ws.mergeCells(nr, 2, nr, tcol);
    for (let c = 1; c <= tcol; c++) style(ws.getCell(nr, c), { bold: c === 1, bg: c === 1 ? HEAD : undefined, align: 'left', wrap: true });
    ws.getRow(nr).height = 40;
    return ws;
  }

  function refSheet(wb, refRows) {
    const ws = wb.addWorksheet('참고사항', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 6 }, { width: 18 }, { width: 70 }];
    ['순번', '이름', '내용'].forEach((t, i) => { ws.getCell(1, i + 1).value = t; style(ws.getCell(1, i + 1), { bold: true, bg: HEAD }); });
    const rows = refRows && refRows.length ? refRows : [['', '']];
    rows.forEach(([a, b], k) => {
      ws.getCell(k + 2, 1).value = k + 1;
      ws.getCell(k + 2, 2).value = a || null;
      ws.getCell(k + 2, 3).value = b || null;
      for (let c = 1; c <= 3; c++) style(ws.getCell(k + 2, c), { align: c === 3 ? 'left' : 'center', wrap: true });
    });
  }

  function submitSheet(wb) {
    const ws = wb.addWorksheet('제출현황', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 6 }, { width: 14 }, { width: 10 }];
    ['순번', '과목', '제출여부'].forEach((t, i) => { ws.getCell(1, i + 1).value = t; style(ws.getCell(1, i + 1), { bold: true, bg: HEAD }); });
    M.SHEETS.forEach((s, k) => {
      ws.getCell(k + 2, 1).value = k + 1;
      ws.getCell(k + 2, 2).value = s;
      for (let c = 1; c <= 3; c++) style(ws.getCell(k + 2, c));
    });
  }

  // sems: ['1'] | ['2'] | ['1','2'], allocBySem: { '1': Alloc }, movingBySem: { '1': Moving }(없으면 이동수업 시트 생략)
  function build(ExcelJS, { planYear, sems, allocBySem, movingBySem, notice, refRows, short }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '교육과정 자동화';
    noticeSheet(wb, notice === null || notice === undefined ? DEFAULT_NOTICE : notice);
    if (movingBySem && MX) {
      for (const s of sems) {
        if (!movingBySem[s]) continue;
        MX.addSheet(wb, sems.length > 1 ? `이동수업 반배정(${s}학기)` : '선택교과 이동수업 반배정', planYear, s, movingBySem[s]);
      }
    }
    const yy = String(planYear % 100).padStart(2, '0');
    for (const s of sems) {
      const alloc = allocBySem[s] || { columns: [], sheets: {} };
      for (const sheet of M.SHEETS) subjectSheet(wb, `${yy}-${s} ${sheet}`, sheet, { planYear, sem: s, alloc, short });
    }
    refSheet(wb, refRows);
    submitSheet(wb);
    return wb;
  }

  return { build, DEFAULT_NOTICE };
});
