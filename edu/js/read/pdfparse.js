// 편제표 PDF(한글에서 PDF로 저장한 파일)를 읽어 입학생별 과목 행을 뽑아낸다.
// 한글이 만든 PDF는 표의 칸마다 사각형 클립 경로를 그리므로, 그 사각형을 "셀"로 보고
// 글자를 셀에 담아 표를 다시 짠다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PdfParse = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const GUBUN = new Set(['공통', '일반', '진로', '융합']);
  const TOL = 1.0;

  function mul(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }
  function apply(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  // 클립 사각형 = 표 셀
  function extractCells(opList, OPS, pageW, pageH) {
    const seen = new Map();
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const { fnArray, argsArray } = opList;
    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, argsArray[i]);
      else if (fn === OPS.constructPath && (fnArray[i + 1] === OPS.eoClip || fnArray[i + 1] === OPS.clip)) {
        const b = argsArray[i][2];
        if (!b) continue;
        const [ax, ay] = apply(ctm, b[0], b[2]);
        const [bx, by] = apply(ctm, b[1], b[3]);
        const c = { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
        if (c.x1 - c.x0 < 2 || c.y1 - c.y0 < 2) continue;
        if (c.x1 - c.x0 > pageW * 0.9 && c.y1 - c.y0 > pageH * 0.5) continue;
        const key = [c.x0, c.x1, c.y0, c.y1].map(v => v.toFixed(1)).join(',');
        if (!seen.has(key)) seen.set(key, c);
      }
    }
    return [...seen.values()];
  }

  function area(c) { return (c.x1 - c.x0) * (c.y1 - c.y0); }

  function cellAt(cells, x, y) {
    let best = null;
    for (const c of cells) {
      if (x >= c.x0 - TOL && x <= c.x1 + TOL && y >= c.y0 - TOL && y <= c.y1 + TOL) {
        if (!best || area(c) < area(best)) best = c;
      }
    }
    return best;
  }

  // 셀 안 글자들을 줄 → 칸 순서로 이어 붙인다. 글자 사이가 벌어져 있으면 띄어 쓴다.
  function joinText(items) {
    const sorted = [...items].sort((a, b) => (Math.abs(b.y - a.y) > a.h * 0.5 ? b.y - a.y : a.x - b.x));
    let out = '';
    let prev = null;
    for (const it of sorted) {
      if (prev) {
        const newLine = Math.abs(prev.y - it.y) > prev.h * 0.5;
        const gap = it.x - (prev.x + prev.w);
        if (newLine || gap > Math.max(0.8, prev.h * 0.12)) out += ' ';
      }
      out += it.s;
      prev = it;
    }
    return out.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/\s*↔\s*/g, '↔').trim();
  }

  function compact(s) { return (s || '').replace(/\s+/g, ''); }
  function firstInt(s) { const m = /^\s*(\d+)/.exec(s || ''); return m ? parseInt(m[1], 10) : null; }

  async function readPage(page, OPS) {
    const view = page.view;
    const pageW = view[2] - view[0];
    const pageH = view[3] - view[1];
    const opList = await page.getOperatorList();
    const cells = extractCells(opList, OPS, pageW, pageH);
    const tc = await page.getTextContent();
    const loose = [];
    for (const c of cells) c.items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const h = Math.abs(it.transform[3]) || 8;
      const t = { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h };
      const c = cellAt(cells, t.x + t.w / 2, t.y + h * 0.3);
      if (c) c.items.push(t); else loose.push(t);
    }
    for (const c of cells) c.text = joinText(c.items);
    return { cells, looseText: joinText(loose), allText: joinText(tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 8 }))) };
  }

  // 머리글(과목, 기본단위, 편성단위, 학년·학기, 비고) 위치 찾기
  function findHeader(cells) {
    const by = name => cells.filter(c => compact(c.text) === name).sort((a, b) => b.y1 - a.y1)[0];
    const subj = by('과목');
    const base = by('기본단위');
    const credit = by('편성단위');
    const note = cells.filter(c => compact(c.text).startsWith('비고')).sort((a, b) => b.y1 - a.y1)[0];
    const sems = {};
    for (const g of [1, 2, 3]) {
      const gc = by(`${g}학년`);
      if (!gc) continue;
      const kids = cells
        .filter(c => /^[12]학기$/.test(compact(c.text)) && c.x0 >= gc.x0 - TOL && c.x1 <= gc.x1 + TOL && c.y1 <= gc.y0 + TOL && c.y1 >= gc.y0 - 30)
        .sort((a, b) => a.x0 - b.x0);
      for (const k of kids) sems[`${g}-${compact(k.text)[0]}`] = { x0: k.x0, x1: k.x1, bottom: k.y0 };
    }
    if (!subj || !credit || Object.keys(sems).length < 2) return null;
    const bottom = Math.min(...Object.values(sems).map(s => s.bottom));
    return { subj, base, credit, note, sems, bottom };
  }

  function splitNames(text) {
    const cross = text.includes('↔');
    const parts = text.split(/,\s*/).map(s => s.replace(/^\*+\s*/, '').replace(/\s*\*+\s*/g, '').trim()).filter(Boolean);
    if (cross) {
      const out = [];
      for (const p of parts) for (const q of p.split('↔')) out.push(q.replace(/^\*+/, '').trim());
      return { cross, names: out.filter(Boolean) };
    }
    return { cross, names: parts };
  }

  function rowsFromPage(cells, header) {
    const { subj } = header;
    const rowCells = cells
      .filter(c => Math.abs(c.x1 - subj.x1) < TOL * 2 && c.x0 >= subj.x0 - TOL && c.y1 <= header.bottom + TOL)
      .sort((a, b) => b.y1 - a.y1);
    const rows = [];
    for (const rc of rowCells) {
      const text = rc.text;
      if (!text) { if (rows.length) break; else continue; }
      const ym = (rc.y0 + rc.y1) / 2;
      const mid = col => (col.x0 + col.x1) / 2;
      const valCell = col => (col ? cellAt(cells, mid(col), ym) : null);
      const left = cells
        .filter(c => c.x1 <= rc.x0 + TOL && c.y0 <= ym && c.y1 >= ym && c.text)
        .sort((a, b) => a.x0 - b.x0);
      // 창의적 체험활동, 이수 단위 계 행부터는 교과가 아니다
      if (left.some(c => compact(c.text).includes('창의적')) || /이수\s*(단위|학점)|\(시간\)/.test(text)) break;
      const gubunCell = left.filter(c => GUBUN.has(compact(c.text))).pop();
      const kyoCell = left.filter(c => !GUBUN.has(compact(c.text))).pop();
      const { cross, names } = splitNames(text);
      const sem = {};
      for (const [key, col] of Object.entries(header.sems)) {
        const c = valCell(col);
        if (!c) continue;
        const v = firstInt(c.text);
        if (v === null) continue;
        const own = Math.abs(c.y0 - rc.y0) < TOL * 1.5 && Math.abs(c.y1 - rc.y1) < TOL * 1.5;
        sem[key] = own
          ? { type: 'own', value: v }
          : { type: 'block', value: v, blockId: [c.x0, c.y0].map(n => n.toFixed(1)).join(',') };
      }
      const noteCell = valCell(header.note);
      rows.push({
        kyo: kyoCell ? kyoCell.text : '',
        gubun: gubunCell ? compact(gubunCell.text) : '',
        text,
        names,
        cross,
        base: firstInt(valCell(header.base)?.text),
        credit: firstInt(valCell(header.credit)?.text),
        sem,
        note: noteCell && Math.abs(noteCell.y0 - rc.y0) < TOL * 1.5 ? noteCell.text : '',
      });
    }
    return rows;
  }

  const TITLE_RE = /(\d{4})\s*학년도\s*입학생/;

  // pdfjsLib: window.pdfjsLib 또는 require('pdfjs-dist/legacy/build/pdf.js')
  // 반환: [{ year, title, rows, warnings }]
  async function parseCurriculumPdf(pdfjsLib, data, options = {}) {
    const doc = await pdfjsLib.getDocument({ data, ...options }).promise;
    const cohorts = [];
    let current = null;
    let lastHeader = null;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { cells, looseText, allText } = await readPage(page, pdfjsLib.OPS);
      const m = TITLE_RE.exec(looseText) || TITLE_RE.exec(allText);
      const header = findHeader(cells);
      if (m) {
        current = { year: parseInt(m[1], 10), title: (looseText.split(/\s{2,}/)[0] || m[0]).trim(), rows: [], warnings: [], pages: [] };
        cohorts.push(current);
      }
      if (header) lastHeader = header;
      const useHeader = header || lastHeader;
      if (!useHeader) continue;
      if (!current) {
        current = { year: null, title: `${p}쪽`, rows: [], warnings: ['제목에서 입학년도를 찾지 못했습니다.'], pages: [] };
        cohorts.push(current);
      }
      const rows = rowsFromPage(cells, header ? useHeader : { ...useHeader, bottom: Infinity });
      current.rows.push(...rows);
      current.pages.push(p);
    }
    for (const c of cohorts) if (!c.rows.length) c.warnings.push('표에서 과목을 읽지 못했습니다. 한글에서 PDF로 저장한 파일인지 확인해 주세요.');
    return cohorts;
  }

  return { parseCurriculumPdf, splitNames, joinText };
});
