// 계산 결과를 교원 조직계획표 양식(엑셀)에 채운다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrgExcel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // 양식 행 번호: 1학기 1~3학년 = 11~13, 2학기 1~3학년 = 16~18
  const ROW = { '1-1': 11, '1-2': 12, '1-3': 13, '2-1': 16, '2-2': 17, '2-3': 18 };
  const TEMPLATE_PLAN_YEAR = 2027;

  function base64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64');
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // 양식 안의 "2027", "2026" 같은 연도를 계획 학년도에 맞춘다.
  function shiftYears(text, planYear) {
    const d = planYear - TEMPLATE_PLAN_YEAR;
    if (!d) return text;
    return text.replace(/20\d{2}/g, y => String(Number(y) + d));
  }

  // ExcelJS 워크북에 채운다. columns: OrgLogic.COLUMNS
  function fillWorkbook(wb, { planYear, grid, columns, staff, staffYears }) {
    const ws = wb.worksheets[0];
    ws.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        if (cell.isMerged && cell.master.address !== cell.address) return;
        if (typeof cell.value === 'string') {
          const next = shiftYears(cell.value, planYear);
          if (next !== cell.value) cell.value = next;
        }
      });
    });
    ws.getCell('S3').value = null; // 작성기준일은 비워 두고 학교에서 적는다
    // 9행: 정원(1인 평균의 기준), 10행: 현원
    // 학년도는 사용자가 고칠 수 있다(staffYears). 없으면 둘 다 계획 학년도의 전 해
    ws.getCell('B9').value = `${staffYears?.정원 ?? planYear - 1} 정원`;
    ws.getCell('B10').value = `${staffYears?.현원 ?? planYear - 1} 현원`;
    for (const [r, kind] of [[9, '정원'], [10, '현원']]) {
      for (const { name, col } of columns) {
        const v = staff?.[kind]?.[name];
        ws.getCell(`${col}${r}`).value = v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
      }
    }
    for (const [key, r] of Object.entries(ROW)) {
      for (const { name, col } of columns) {
        const v = grid[key]?.[name] || 0;
        ws.getCell(`${col}${r}`).value = v ? v : null;
      }
    }
    trimColumns(ws, LAST_COL);
    wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
    return wb;
  }

  // 전문교과 소계(AO열)까지만 남긴다. 걸친 병합(제목 B1:BC1)은 AO에서 자르고, 오른쪽 병합·열은 지운다.
  const LAST_COL = 41; // AO
  function trimColumns(ws, last) {
    const merges = [...(ws.model.merges || [])];
    for (const range of merges) {
      const [a, b] = range.split(':').map(ref => ws.getCell(ref));
      if (b.col <= last) continue;
      ws.unMergeCells(range);
      if (a.col < last) ws.mergeCells(a.row, a.col, b.row, last);
    }
    if (ws.columnCount > last) ws.spliceColumns(last + 1, ws.columnCount - last);
    if (Array.isArray(ws._columns)) ws._columns.splice(last); // 지운 열의 너비·서식 정의도 없앤다
    ws.pageSetup.printArea = `A1:AO45`;
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 1;
  }

  return { ROW, LAST_COL, base64ToBytes, fillWorkbook, shiftYears };
});
