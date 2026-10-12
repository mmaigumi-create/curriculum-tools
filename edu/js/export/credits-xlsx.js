// 이수학점 확인 결과 → 엑셀(학생별 / 교과별 부족 학생 / 확인 필요)
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduCreditsXlsx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const thin = { style: 'thin', color: { argb: 'FF9CA3AF' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const HEAD = 'FFDDEBF7';
  const SHORT = 'FFFDE2E2';
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  function put(cell, value, { bold, bg, align = 'center', color } = {}) {
    cell.value = value;
    cell.font = { name: '맑은 고딕', size: 10, bold: !!bold, ...(color ? { color: { argb: color } } : {}) };
    cell.alignment = { horizontal: align, vertical: 'middle' };
    cell.border = BORDER;
    if (bg) cell.fill = fill(bg);
  }
  function title(ws, text, cols) {
    ws.mergeCells(1, 1, 1, cols);
    const c = ws.getCell(1, 1);
    c.value = text;
    c.font = { name: '맑은 고딕', size: 14, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;
  }
  const page = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  function studentSheet(wb, { result, gradCredits }) {
    const ws = wb.addWorksheet('학생별 이수학점', { views: [{ state: 'frozen', xSplit: 5, ySplit: 3 }], pageSetup: page });
    const cap = result.basicCap;
    const heads = ['학번', '학년', '반', '번호', '이름', '① 이수완료', '② 이수 중', '③ 이수예정(학교공통)', '④ 신청한 선택과목', '합계(①+②+③+④)', `졸업까지 부족(${gradCredits} 이상)`, ...result.areas.map(a => `${a} 부족(필수 이상)`), `국·수·영 합(${cap} 이하)`, '국·수·영 여유(음수=초과)', '아직 신청 안 한 선택'];
    title(ws, `${result.year}학년도 학생별 이수학점 확인 (졸업 ${gradCredits}학점 이상)`, heads.length);
    ws.getCell(2, 1).value = `합계 = ① 이수완료 + ② 이수 중 + ③ 이수예정(학교공통, 앞으로 모두 듣는 과목) + ④ 수강신청한 선택과목 학점 · 기준: 졸업 ${gradCredits}학점 이상, 교과(군) 필수 학점 이상, 국·수·영 합 ${cap}학점 이하 · 졸업까지 부족 = ${gradCredits} - 합계(미달 학점) · 교과(군)별 내역은 "학생별 교과 상세" 시트 · 국·수·영 합은 ${cap}학점 이하(여유가 음수면 초과)`;
    ws.getCell(2, 1).font = { name: '맑은 고딕', size: 9, color: { argb: 'FF6B7280' } };
    ws.columns = heads.map((h, i) => ({ width: i === 4 ? 10 : i < 4 ? 7 : 11 }));
    heads.forEach((h, i) => put(ws.getCell(3, i + 1), h, { bold: true, bg: HEAD }));
    result.students.forEach((s, k) => {
      const r = 4 + k;
      const vals = [s.id || null, s.grade, s.cls, s.no, s.name, s.done, s.doing, s.common, s.applied,
        { formula: `SUM(F${r}:I${r})`, result: s.sum }, { formula: `MAX(0,${gradCredits}-J${r})`, result: s.gradNeed },
        ...result.areas.map(a => (s.areas[a] && s.areas[a].need) || null), s.basic, s.basicRoom, s.electiveLeft || null];
      const bi = 11 + result.areas.length; // 국·수·영 합 열 위치(0부터)
      vals.forEach((v, i) => {
        const short = ((i === 10 && s.gradNeed) || (i >= 11 && i < bi && v)) || ((i === bi || i === bi + 1) && s.basicOver > 0);
        put(ws.getCell(r, i + 1), v, { bg: short ? SHORT : undefined, color: short ? 'FFB42318' : undefined, bold: !!short });
      });
    });
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: heads.length } };
  }

  // 학생 × 교과(군): 어느 칸에서 온 학점인지 그대로 보인다
  function detailSheet(wb, { result }) {
    const ws = wb.addWorksheet('학생별 교과 상세', { views: [{ state: 'frozen', xSplit: 5, ySplit: 3 }], pageSetup: page });
    const heads = ['학번', '학년', '반', '이름', '교과(군)', '① 이수완료', '② 이수 중', '③ 이수예정(학교공통)', '④ 신청한 선택과목', '합계(①+②+③+④)', '필수(이상)', '부족(미달)'];
    title(ws, `${result.year}학년도 학생별 교과(군) 이수학점 상세`, heads.length);
    ws.getCell(2, 1).value = '부족 = 필수 - 합계(0보다 작으면 0) · 생활·교양 = 기술·가정/정보 + 제2외국어/한문 + 교양';
    ws.getCell(2, 1).font = { name: '맑은 고딕', size: 9, color: { argb: 'FF6B7280' } };
    ws.columns = heads.map((h, i) => ({ width: i === 3 ? 10 : i === 4 ? 11 : i < 3 ? 7 : 12 }));
    heads.forEach((h, i) => put(ws.getCell(3, i + 1), h, { bold: true, bg: HEAD }));
    let r = 4;
    for (const s of result.students) {
      for (const a of result.areas) {
        const x = s.areas[a];
        if (!x) continue;
        [s.id || null, s.grade, s.cls, s.name, a, x.done, x.doing, x.common, x.applied,
          { formula: `SUM(F${r}:I${r})`, result: x.sum }, x.required || null, { formula: `MAX(0,K${r}-J${r})`, result: x.need }]
          .forEach((v, i) => put(ws.getCell(r, i + 1), v, i === 11 && x.need ? { bg: SHORT, color: 'FFB42318', bold: true } : {}));
        r++;
      }
    }
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: heads.length } };
  }

  function areaSheet(wb, { result }) {
    const ws = wb.addWorksheet('교과별 부족 학생', { views: [{ state: 'frozen', ySplit: 2 }], pageSetup: { ...page, orientation: 'portrait' } });
    const heads = ['교과(군)', '학번', '이름', '기준', '합계', '미달·초과'];
    title(ws, `${result.year}학년도 교과(군)별 필수 학점 부족·국수영 상한 초과 학생`, heads.length);
    ws.columns = [{ width: 12 }, { width: 9 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 10 }];
    heads.forEach((h, i) => put(ws.getCell(2, i + 1), h, { bold: true, bg: HEAD }));
    let r = 3;
    for (const a of result.areas) {
      for (const s of result.students) {
        const x = s.areas[a];
        if (!x || !x.need) continue;
        [a, s.id || `${s.grade}-${s.cls}`, s.name, `${x.required} 이상`, x.sum, `${x.need} 미달`].forEach((v, i) => put(ws.getCell(r, i + 1), v));
        r++;
      }
    }
    // 국·수·영 합 상한 초과: 필수(상한) 칸에 상한, 더 필요 칸에 "초과 n"
    for (const s of result.students) {
      if (!s.basicOver) continue;
      ['국·수·영 합', s.id || `${s.grade}-${s.cls}`, s.name, `${result.basicCap} 이하`, s.basic, `${s.basicOver} 초과`].forEach((v, i) => put(ws.getCell(r, i + 1), v, { color: i === 5 ? 'FFB42318' : undefined, bold: i === 5 }));
      r++;
    }
  }

  function issueSheet(wb, { result }) {
    const ws = wb.addWorksheet('확인 필요', { pageSetup: { ...page, orientation: 'portrait' } });
    title(ws, '확인 필요', 3);
    ws.columns = [{ width: 8 }, { width: 10 }, { width: 80 }];
    ['구분', '대상', '내용'].forEach((h, i) => put(ws.getCell(2, i + 1), h, { bold: true, bg: HEAD }));
    const rows = [...result.notices.map(n => ({ kind: '알림', who: '', text: n })), ...result.issues];
    rows.forEach((x, k) => [x.kind, x.who, x.text].forEach((v, i) => put(ws.getCell(3 + k, i + 1), v || null, { align: i === 2 ? 'left' : 'center' })));
  }

  function build(ExcelJS, opts) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '교육과정 자동화';
    studentSheet(wb, opts);
    detailSheet(wb, opts);
    areaSheet(wb, opts);
    issueSheet(wb, opts);
    return wb;
  }

  return { build };
});
