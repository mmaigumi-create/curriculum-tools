// 수강신청 프로그램에서 받은 학생별 세트 배정 엑셀을 읽어 과목·세트별 인원만 센다.
// 학생 이름·학번은 세기만 하고 결과에 남기지 않는다.
// 엑셀 모양: 1행 = 묶음("1학기[택4]"), 2행 = 과목명, 3행~ = 학생(과목 칸에 세트 글자 A~H)
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduXlsxParse = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GROUP_RE = /학기\s*\[\s*택\s*\d+\s*\]/;
  const SET_RE = /^[A-Z]$/;

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

  // 학생 줄: 학번(2열)이 다섯 자리 숫자
  function isStudentRow(row) {
    return /^\d{5}$/.test(text(row.getCell(2).value).trim());
  }

  // '시험시간표' 시트의 "과목 | 합계" 줄 → { 과목: 인원 }
  function readTotals(ws) {
    const out = {};
    if (!ws) return out;
    ws.eachRow(row => {
      const name = text(row.getCell(1).value).trim();
      const n = Number(text(row.getCell(2).value).trim());
      if (name && Number.isFinite(n) && !/^(과목|대기자|합계)$/.test(name) && !(name in out)) out[name] = n;
    });
    return out;
  }

  // wb: ExcelJS Workbook. 반환: Assign
  function parseAssignmentWorkbook(wb, fileName) {
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('엑셀에 시트가 없습니다.');
    const head = ws.getRow(1);
    const names = ws.getRow(2);
    const cols = [];
    head.eachCell({ includeEmpty: false }, (cell, col) => {
      const g = text(cell.value).trim();
      const name = text(names.getCell(col).value).trim();
      if (GROUP_RE.test(g) && name) cols.push({ col, group: g.replace(/\s+/g, ''), name });
    });
    if (!cols.length) throw new Error('과목 열을 찾지 못했습니다. 1행에 "1학기[택4]"처럼 묶음 이름이 있는 수강신청 배정 엑셀인지 확인해 주세요.');
    const counts = cols.map(() => ({}));
    const seen = new Set();
    let students = 0;
    ws.eachRow((row, r) => {
      if (r < 3 || !isStudentRow(row)) return;
      students++;
      cols.forEach((c, k) => {
        const v = text(row.getCell(c.col).value).trim().toUpperCase();
        if (!SET_RE.test(v)) return;
        counts[k][v] = (counts[k][v] || 0) + 1;
        seen.add(v);
      });
    });
    if (!students) throw new Error('학생 줄을 찾지 못했습니다. 2열에 학번이 있는 배정 엑셀인지 확인해 주세요.');
    const sets = [...seen].sort();
    const totals = readTotals(wb.getWorksheet('시험시간표'));
    const subjects = cols.map((c, k) => {
      const cells = {};
      for (const s of sets) if (counts[k][s]) cells[s] = counts[k][s];
      return { raw: c.name, group: c.group, cells, total: c.name in totals ? totals[c.name] : null };
    }).filter(s => Object.keys(s.cells).length);
    return { source: 'xlsx', fileName: fileName || '', sets, subjects, students, warnings: [] };
  }

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ImgParse.readAssignmentImage 결과 → Assign (타임 n번째 행 = 세트 n번째 글자)
  function fromImageResult(res, fileName) {
    const n = res.setCount || Math.max(0, ...res.subjects.flatMap(s => s.rowIdx || [])) + 1;
    const sets = LETTERS.slice(0, n).split('');
    const subjects = res.subjects.map(s => {
      const cells = {};
      const reds = {};
      (s.counts || []).forEach((c, k) => {
        const set = sets[(s.rowIdx || [])[k] ?? k];
        if (!set) return;
        cells[set] = c;
        if (s.reds && s.reds[k]) reds[set] = true;
      });
      return { raw: s.raw, name: s.name || null, sure: !!s.sure, cells, reds, total: s.total ?? null };
    });
    return { source: 'image', fileName: fileName || '', sets, subjects, warnings: res.warnings || [] };
  }

  return { parseAssignmentWorkbook, fromImageResult, readTotals };
});
