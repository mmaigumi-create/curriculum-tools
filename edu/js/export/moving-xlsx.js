// 이동수업 배정표 → 엑셀 (예시 "선택교과 세트배정표" 모양)
// 제목 띠 / 학년마다 열 번호 줄 + 세트당 4줄(과목·인원·강의실·담당 교사) / 2·3학년 담임 줄 / 안내 문구 / 요일·교시 가안 표
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduMovingXlsx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const FONT = '맑은 고딕';
  const TITLE_FILL = 'FF2F75B5';
  const SUBJ_FILL = 'FFDDEBF7';
  const BAND_FILL = 'FFFCE4D6';
  const HOMEROOM_FILL = { 2: 'FFFFFF00', 3: 'FF92D050' };
  const DAYS = ['월', '화', '수', '목', '금'];
  const PERIODS = 7;
  const NOTE = '*특별실 옆 괄호 안의 반 배정은 전국연합평가 운영시 배정된 반 입니다.';
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const colLetter = n => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const center = { horizontal: 'center', vertical: 'middle' };

  function put(cell, value, { bold, size = 11, color, bg, border = true, align = center } = {}) {
    if (value !== undefined) cell.value = value;
    cell.font = { name: FONT, size, bold: !!bold, ...(color ? { color: { argb: color } } : {}) };
    cell.alignment = align;
    if (bg) cell.fill = fill(bg);
    if (border) cell.border = BORDER;
  }

  function addSheet(wb, sheetName, planYear, sem, moving) {
    const ws = wb.addWorksheet(sheetName, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    });
    const grades = moving.grades.filter(g => g.sets.length);
    const maxItems = Math.max(1, ...grades.flatMap(g => g.sets.map(s => s.items.length)));
    const lastCol = Math.max(2 + maxItems, 2 + DAYS.length * 2); // A=학년, B=세트, C~ 과목
    ws.columns = [{ width: 7.5 }, { width: 9 }, ...Array.from({ length: lastCol - 2 }, () => ({ width: 15 }))];

    // 제목 띠
    ws.mergeCells(1, 1, 1, lastCol);
    put(ws.getCell(1, 1), `${planYear}학년도 ${sem}학기 선택교과 이동수업 강의실 배정표`, { bold: true, size: 20, color: 'FFFFFFFF', bg: TITLE_FILL, border: false });
    ws.getRow(1).height = 36;

    let r = 2;
    grades.forEach((g, gi) => {
      // 열 번호 줄
      for (let k = 1; k <= maxItems; k++) put(ws.getCell(r, 2 + k), k, { color: 'FFFF0000', border: false });
      ws.getRow(r).height = 16;
      r++;
      const top = r;
      for (const s of g.sets) {
        ws.mergeCells(r, 2, r + 3, 2);
        put(ws.getCell(r, 2), `${s.name}세트`, { bold: true });
        for (let k = 0; k < maxItems; k++) {
          const it = s.items[k];
          const c = 3 + k;
          put(ws.getCell(r, c), it ? it.subj : null, { bold: true, color: 'FF111111', bg: it ? SUBJ_FILL : undefined, align: { ...center, shrinkToFit: true } });
          put(ws.getCell(r + 2, c), it && it.room ? it.room : null, { bold: true, color: 'FF333333' });
          const cnt = ws.getCell(r + 1, c);
          put(cnt, it && it.count !== '' && it.count !== undefined ? Number(it.count) : null, { size: 10, color: 'FF595959' });
          cnt.numFmt = '0"명"';
          put(ws.getCell(r + 3, c), it && it.teacher ? it.teacher : null, { bold: true, color: 'FF333333', bg: it ? BAND_FILL : undefined });
        }
        for (let rr = r; rr <= r + 3; rr++) ws.getRow(rr).height = 18;
        r += 4;
      }
      ws.mergeCells(top, 1, r - 1, 1);
      put(ws.getCell(top, 1), `${g.grade}\n학\n년`, { bold: true, size: 18, align: { ...center, wrapText: true } });
      // 첫 학년 묶음 뒤에 2·3학년 담임 줄(담임 교사 이름을 적는 칸)
      if (gi === 0) {
        for (const hg of [2, 3]) {
          put(ws.getCell(r, 2), `${hg}학년담임`, { bold: true, bg: HOMEROOM_FILL[hg], border: false });
          for (let c = 3; c <= lastCol; c++) put(ws.getCell(r, c), null, { bg: HOMEROOM_FILL[hg], border: false });
          ws.getRow(r).height = 18;
          r++;
        }
      }
    });

    // 마지막 세트 바로 아래 안내 문구(2027 예시에서는 58행)
    put(ws.getCell(r, 2), NOTE, { size: 9, color: 'FFFF0000', border: false, align: { horizontal: 'left', vertical: 'middle' } });
    ws.getRow(r).height = 18;
    r++;
    // 요일·교시 가안 표(세트를 몇 교시에 둘지 적는 칸)
    const gr = r;
    ws.mergeCells(gr, 2, gr + 1, 2);
    put(ws.getCell(gr, 2), '가안', { bold: true, color: 'FFFF0000' });
    DAYS.forEach((d, i) => {
      const c = 3 + i * 2;
      put(ws.getCell(gr, c), '2학년', { bold: true });
      put(ws.getCell(gr, c + 1), '3학년', { bold: true });
      ws.mergeCells(gr + 1, c, gr + 1, c + 1);
      put(ws.getCell(gr + 1, c), d, { bold: true });
    });
    for (let p = 1; p <= PERIODS; p++) {
      const rr = gr + 1 + p;
      put(ws.getCell(rr, 2), `${p}교시`, { bold: true });
      for (let c = 3; c < 3 + DAYS.length * 2; c++) put(ws.getCell(rr, c), null, { color: 'FF0000FF' });
      ws.getRow(rr).height = 18;
    }
    r = gr + 1 + PERIODS;
    ws.pageSetup.printArea = `A1:${colLetter(lastCol - 1)}${r}`;
    return ws;
  }

  const sheetNameFor = sem => `선택교과 이동수업 반배정_${sem}학기(세트표)`;

  // sems: ['1'] | ['2'] | ['1','2']
  function build(ExcelJS, { planYear, sems, movingBySem }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '교육과정 자동화';
    for (const s of sems) addSheet(wb, sheetNameFor(s), planYear, s, movingBySem[s] || { grades: [] });
    return wb;
  }

  return { addSheet, build, sheetNameFor };
});
