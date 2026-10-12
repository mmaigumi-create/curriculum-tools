// 편제표 → 엑셀(화면 표와 같은 칸 배치, 합친 칸·테두리 포함)
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduPyeonjeXlsx = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const Y = typeof require === 'function' ? require('../core/pyeonje-layout.js') : root.EduPyeonjeLayout;

  const FILL = { head: 'FFF1F2F8', g1: 'FFDFE3FF', g2: 'FFCDF3E4', g3: 'FFFFE0CC', h1: 'FFEEF0FF', h2: 'FFE6F9F1', h3: 'FFFFF0E5', sum: 'FFF1F2F8', blk: 'FFEEF0FF', kyo: 'FFFAFBFD' };
  const thin = { style: 'thin', color: { argb: 'FF9CA3AF' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const colLetter = n => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

  function build(ExcelJS, cur) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '교육과정 자동화';
    const ws = wb.addWorksheet('편제표', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      views: [{ showGridLines: false }],
    });
    ws.columns = Y.COL_WIDTHS.map(w => ({ width: w }));
    const last = colLetter(Y.COLS - 1);
    ws.mergeCells(`A1:${last}1`);
    const title = ws.getCell('A1');
    title.value = `${cur.year}학년도 입학생 교육과정 편제`;
    title.font = { bold: true, size: 15 };
    title.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(1).height = 28;
    ws.mergeCells(`A2:${last}2`);
    const legend = ws.getCell('A2');
    legend.value = '↔: 학기 단위 교차 이수';
    legend.alignment = { horizontal: 'right' };
    legend.font = { size: 9, color: { argb: 'FF64748B' } };

    const START = 3;
    const rows = Y.addresses(Y.layout(cur).rows);
    rows.forEach((line, ri) => {
      const r = START + ri;
      ws.getRow(r).height = ri < 2 ? 22 : 18;
      for (const c of line) {
        const a = `${colLetter(c.col)}${r}`;
        const b = `${colLetter(c.col + (c.colspan || 1) - 1)}${r + (c.rowspan || 1) - 1}`;
        if (a !== b) ws.mergeCells(`${a}:${b}`);
        const cell = ws.getCell(a);
        cell.value = c.text === '' || c.text === null || c.text === undefined ? null : c.text;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.font = { size: 10, bold: !!(c.head || /sum|blk|kyo|secsum|ccsum/.test(c.cls || '')) };
        const key = c.head ? (c.cls || 'head') : /blk/.test(c.cls || '') ? 'blk' : /sum|secsum|ccsum/.test(c.cls || '') ? 'sum' : /kyo|gubun/.test(c.cls || '') ? 'kyo' : null;
        if (key && FILL[key]) cell.fill = fill(FILL[key]);
        // 합친 칸 전체에 테두리
        for (let rr = r; rr < r + (c.rowspan || 1); rr++) for (let cc = c.col; cc < c.col + (c.colspan || 1); cc++) ws.getCell(`${colLetter(cc)}${rr}`).border = BORDER;
      }
    });
    ws.pageSetup.printArea = `A1:${last}${START + rows.length - 1}`;
    return wb;
  }

  return { build };
});
