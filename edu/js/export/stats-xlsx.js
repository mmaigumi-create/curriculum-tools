// 교과별 수업 시수 통계(공유용) → 엑셀 (예시 "교과별 수업 시수 통계" 모양)
// 교과마다 시트 하나: 제목 / 1학기 표(순번·정식과목명·시수·개설반 수·합계) / 2학기 표
// 맨 앞에 교과별 학기 합계 요약 시트
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduStatsXlsx = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const M = typeof require === 'function' ? require('../core/mapping.js') : root.EduMapping;
  const SEMS = ['1', '2'];

  // 배당표 계산 결과 → 교과마다 학기별 [{ name, hours, sections }]
  // 개설반 수 = 시수 ÷ 학점(나누어떨어지지 않으면 빈칸)
  function collect(allocBySem) {
    const out = {};
    for (const sheet of M.SHEETS) {
      const bySem = {};
      for (const s of SEMS) {
        const rows = ((allocBySem[s] && allocBySem[s].sheets[sheet]) || []).filter(r => r.total);
        bySem[s] = rows.map(r => {
          const credit = Number(r.credit) || 0;
          const sec = credit ? r.total / credit : NaN;
          return { name: r.name, hours: r.total, sections: Number.isInteger(sec) ? sec : null };
        });
      }
      if (SEMS.some(s => bySem[s].length)) out[sheet] = bySem;
    }
    return out;
  }
  const sum = rows => rows.reduce((a, r) => a + (Number(r.hours) || 0), 0);

  const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const FONT = '맑은 고딕';
  const HEAD = 'FFDDEBF7';
  const SUM = 'FFF2F2F2';
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  function put(cell, value, { bold, size = 11, bg, align = 'center', border = true } = {}) {
    cell.value = value;
    cell.font = { name: FONT, size, bold: !!bold };
    cell.alignment = { horizontal: align, vertical: 'middle' };
    if (bg) cell.fill = fill(bg);
    if (border) cell.border = BORDER;
  }

  function subjectSheet(wb, sheet, bySem, planYear) {
    const ws = wb.addWorksheet(sheet, { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 6 }, { width: 26 }, { width: 9 }, { width: 11 }];
    ws.mergeCells(1, 1, 1, 4);
    put(ws.getCell(1, 1), `${planYear}학년도 시수 (${sheet})과`, { bold: true, size: 14, border: false });
    ws.getRow(1).height = 26;
    let r = 2;
    for (const s of SEMS) {
      const rows = bySem[s];
      ws.mergeCells(r, 1, r, 4);
      put(ws.getCell(r, 1), `${s}학기`, { bold: true, align: 'left', border: false });
      r++;
      ['순번', '정식과목명', '시수', '개설반 수'].forEach((t, i) => put(ws.getCell(r, i + 1), t, { bold: true, bg: HEAD }));
      r++;
      const first = r;
      rows.forEach((row, k) => {
        put(ws.getCell(r, 1), k + 1);
        put(ws.getCell(r, 2), row.name, { align: 'left' });
        put(ws.getCell(r, 3), row.hours);
        put(ws.getCell(r, 4), row.sections);
        r++;
      });
      put(ws.getCell(r, 2), null, { bg: SUM });
      ws.mergeCells(r, 1, r, 2);
      put(ws.getCell(r, 1), '합계', { bold: true, bg: SUM });
      put(ws.getCell(r, 3), rows.length ? { formula: `SUM(C${first}:C${r - 1})`, result: sum(rows) } : 0, { bold: true, bg: SUM });
      put(ws.getCell(r, 4), null, { bg: SUM });
      r += 2;
    }
    return ws;
  }

  function summarySheet(wb, stats, planYear) {
    const ws = wb.addWorksheet('교과별 합계', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 6 }, { width: 14 }, { width: 11 }, { width: 11 }, { width: 11 }];
    ws.mergeCells(1, 1, 1, 5);
    put(ws.getCell(1, 1), `${planYear}학년도 교과별 수업 시수 통계`, { bold: true, size: 14, border: false });
    ws.getRow(1).height = 26;
    ['순번', '교과', '1학기 시수', '2학기 시수', '합계'].forEach((t, i) => put(ws.getCell(2, i + 1), t, { bold: true, bg: HEAD }));
    let r = 3;
    Object.entries(stats).forEach(([sheet, bySem], k) => {
      put(ws.getCell(r, 1), k + 1);
      put(ws.getCell(r, 2), sheet);
      put(ws.getCell(r, 3), sum(bySem['1']));
      put(ws.getCell(r, 4), sum(bySem['2']));
      put(ws.getCell(r, 5), { formula: `C${r}+D${r}`, result: sum(bySem['1']) + sum(bySem['2']) });
      r++;
    });
    put(ws.getCell(r, 2), null, { bg: SUM });
    ws.mergeCells(r, 1, r, 2);
    put(ws.getCell(r, 1), '합계', { bold: true, bg: SUM });
    for (const c of [3, 4, 5]) {
      const L = String.fromCharCode(64 + c);
      put(ws.getCell(r, c), r > 3 ? { formula: `SUM(${L}3:${L}${r - 1})` } : 0, { bold: true, bg: SUM });
    }
  }

  function build(ExcelJS, { planYear, allocBySem }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '교육과정 자동화';
    const stats = collect(allocBySem);
    summarySheet(wb, stats, planYear);
    for (const [sheet, bySem] of Object.entries(stats)) subjectSheet(wb, sheet, bySem, planYear);
    return wb;
  }

  return { build, collect };
});
