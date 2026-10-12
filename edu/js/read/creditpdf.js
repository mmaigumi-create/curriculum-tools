// 나이스 "반별 교육과정 이수현황" PDF(한 쪽 = 학생 한 명)를 읽는다.
// 글자 위치로 열(이수완료·이수 중·학교공통·선택과목·필수)을 가르고, 교과(군) 줄 이름으로 줄을 찾는다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CreditPdf = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const COLS = [['done', /이수완료/], ['doing', /이수\s*중/], ['common', /학교공통/], ['elective', /선택과목/], ['required', /필수/]];
  const LABEL_MIN_X = 90; // 교과영역(보통교과·기초 등) 글자는 이보다 왼쪽

  function lines(items) {
    const out = [];
    for (const it of [...items].sort((a, b) => a.y - b.y)) {
      const l = out.find(x => Math.abs(x.y - it.y) <= 2.5);
      if (l) l.items.push(it); else out.push({ y: it.y, items: [it] });
    }
    for (const l of out) l.items.sort((a, b) => a.x - b.x);
    return out;
  }
  const cleanLabel = s => s.replace(/\s+/g, '').replace(/[∙・•ㆍ]/g, '·');

  function parsePage(items) {
    const ls = lines(items);
    let year = null, grade = null, cls = null, name = '';
    for (const l of ls) {
      const t = l.items.map(i => i.s).join(' ');
      const m = t.match(/(\d{4})학년도\s*(\d)학년/);
      if (!m) continue;
      year = Number(m[1]); grade = Number(m[2]);
      const m2 = t.match(/(\d+)반\s+(\S+)/);
      if (m2) { cls = Number(m2[1]); name = m2[2]; }
      break;
    }
    if (!year || !cls) return null;
    const xs = {};
    for (const it of items) for (const [k, re] of COLS) if (xs[k] === undefined && re.test(it.s)) xs[k] = it.x;
    if (COLS.some(([k]) => xs[k] === undefined)) return null;
    const order = COLS.map(([k]) => k).sort((a, b) => xs[a] - xs[b]);
    const colOf = x => { let col = null; for (const k of order) if (x >= xs[k] - 1) col = k; return col; };
    const rows = [];
    let total = null;
    for (const l of ls) {
      const label = cleanLabel(l.items.filter(i => i.x >= LABEL_MIN_X && i.x < xs.done - 1 && !/^\d+$/.test(i.s)).map(i => i.s).join(''));
      if (!label) continue;
      const v = { done: 0, doing: 0, common: 0, elective: 0, required: 0 };
      let has = false;
      for (const i of l.items) {
        if (!/^\d+$/.test(i.s)) continue;
        const k = colOf(i.x);
        if (k) { v[k] = Number(i.s); has = true; }
      }
      if (!has) continue;
      if (/^소계\(교과/.test(label)) { total = v; continue; }
      if (/소계|활동$/.test(label)) continue;
      rows.push({ label, done: v.done, doing: v.doing, common: v.common, required: v.required, elective: v.elective });
    }
    if (!total) return null;
    return { year, grade, cls, name, rows, total };
  }

  async function parseCreditPdf(pdfjs, data, opts = {}) {
    const doc = await pdfjs.getDocument({ data, ...opts }).promise;
    const out = { year: null, students: [] };
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: vp.height - i.transform[5], s: i.str.trim() }));
      const st = parsePage(items);
      if (!st) continue;
      st.page = p;
      out.students.push(st);
      if (!out.year) out.year = st.year;
    }
    return out;
  }

  return { parseCreditPdf, parsePage };
});
