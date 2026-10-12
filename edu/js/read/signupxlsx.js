// 수강신청 엑셀(수강신청통계·교육과정편성 배정내역)을 읽는다.
// 1행: 학번·이름 머리와 학기 묶음("1학기 [택4]"), 2행: 과목명, 학생 줄: 과목 칸이 비어 있지 않으면 신청.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SignupXlsx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function text(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
      if ('result' in v) return text(v.result);
      if ('text' in v) return String(v.text);
      return '';
    }
    return String(v);
  }
  const cellText = (ws, r, c) => text(ws.getCell(r, c).value).trim();

  function findSheet(wb) {
    for (const ws of wb.worksheets) {
      for (let c = 1; c <= Math.min(ws.columnCount, 20); c++) if (cellText(ws, 1, c) === '학번') return ws;
    }
    return null;
  }

  function parseSignupWorkbook(wb, fileName) {
    const ws = findSheet(wb);
    if (!ws) throw new Error('1행에 "학번" 머리가 있는 시트를 찾지 못했습니다.');
    let idCol = 0, nameCol = 0;
    for (let c = 1; c <= ws.columnCount; c++) {
      const t = cellText(ws, 1, c);
      if (t === '학번' && !idCol) idCol = c;
      if (t === '이름' && !nameCol) nameCol = c;
    }
    if (!nameCol) throw new Error('"이름" 열을 찾지 못했습니다.');
    const subjects = [];
    for (let c = nameCol + 1; c <= ws.columnCount; c++) {
      const head = cellText(ws, 1, c);
      const name = cellText(ws, 2, c);
      if (!name || name === head) continue; // 세로로 합친 칸(교사·교실·메모 등)은 과목이 아니다
      const m = head.match(/([12])\s*학기/);
      subjects.push({ col: c, name, sem: m ? m[1] : null });
    }
    if (!subjects.length) throw new Error('2행에서 과목 이름을 찾지 못했습니다.');
    const students = [];
    for (let r = 3; r <= ws.rowCount; r++) {
      const id = cellText(ws, r, idCol);
      if (!/^\d{5}$/.test(id)) continue;
      const picks = [];
      subjects.forEach((s, i) => { const v = cellText(ws, r, s.col); if (v && v !== '0') picks.push(i); });
      students.push({ id, grade: Number(id[0]), cls: Number(id.slice(1, 3)), no: Number(id.slice(3)), name: cellText(ws, r, nameCol), picks });
    }
    return { fileName, subjects, students };
  }

  return { parseSignupWorkbook };
});
