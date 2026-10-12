// 편제표 → 한글(hwpx). 한글에서 만든 바탕 파일(EduHwpxBase)에 글자·칸 모양을 더하고 본문 표를 새로 쓴다.
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduPyeonjeHwpx = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const Y = typeof require === 'function' ? require('../core/pyeonje-layout.js') : root.EduPyeonjeLayout;

  // 바탕 파일에 있는 모양 번호
  const PARA_CENTER = 20;
  const PARA_LEFT = 0;
  const BORDER_PLAIN = 3; // 검은 실선 테두리
  const FILLS = { head: '#F1F2F8', g1: '#DFE3FF', g2: '#CDF3E4', g3: '#FFE0CC', h1: '#EEF0FF', h2: '#E6F9F1', h3: '#FFF0E5', blk: '#EEF0FF', sum: '#F1F2F8', kyo: '#FAFBFD' };

  function b64decode(s) {
    if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('utf8');
    return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
  }
  const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // header.xml에 글자 모양 3개(제목·본문·굵은 본문)와 채움 칸 모양을 더한다
  function patchHeader(header) {
    let h = header;
    const charMatch = /<hh:charProperties itemCnt="(\d+)">/.exec(h);
    let nChar = Number(charMatch[1]);
    const bold = /<hh:charPr id="7"[\s\S]*?<\/hh:charPr>/.exec(h)[0];
    const plain = /<hh:charPr id="0"[\s\S]*?<\/hh:charPr>/.exec(h)[0];
    const ids = {};
    const addChar = (tpl, height, key) => {
      ids[key] = nChar;
      const x = tpl.replace(/id="\d+"/, `id="${nChar}"`).replace(/height="\d+"/, `height="${height}"`);
      h = h.replace('</hh:charProperties>', `${x}</hh:charProperties>`);
      nChar++;
    };
    addChar(bold, 1500, 'title');
    addChar(plain, 800, 'body');
    addChar(bold, 800, 'bodyBold');
    h = h.replace(/<hh:charProperties itemCnt="\d+">/, `<hh:charProperties itemCnt="${nChar}">`);

    const bfMatch = /<hh:borderFills itemCnt="(\d+)">/.exec(h);
    let nBf = Number(bfMatch[1]) + 1; // id는 1부터
    const tpl = new RegExp(`<hh:borderFill id="${BORDER_PLAIN}"[\\s\\S]*?</hh:borderFill>`).exec(h)[0];
    ids.fill = {};
    for (const [k, color] of Object.entries(FILLS)) {
      const x = tpl.replace(/id="\d+"/, `id="${nBf}"`).replace('</hh:borderFill>', `<hc:fillBrush><hc:winBrush faceColor="${color}" hatchColor="#999999" alpha="0"/></hc:fillBrush></hh:borderFill>`);
      h = h.replace('</hh:borderFills>', `${x}</hh:borderFills>`);
      ids.fill[k] = nBf;
      nBf++;
    }
    h = h.replace(/<hh:borderFills itemCnt="\d+">/, `<hh:borderFills itemCnt="${nBf - 1}">`);
    return { header: h, ids };
  }

  function fillKey(c) {
    const cls = c.cls || '';
    if (c.head) return /g[123]|h[123]/.test(cls) ? cls.match(/[gh][123]/)[0] : 'head';
    if (/blk/.test(cls)) return 'blk';
    if (/sum|secsum|ccsum/.test(cls)) return 'sum';
    if (/kyo|gubun/.test(cls)) return 'kyo';
    return null;
  }

  function para(text, paraId, charId) {
    const t = text === '' || text === null || text === undefined ? '' : String(text);
    return t.split('\n').map(line => `<hp:p id="0" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${line ? `<hp:run charPrIDRef="${charId}"><hp:t>${xml(line)}</hp:t></hp:run>` : `<hp:run charPrIDRef="${charId}"/>`}</hp:p>`).join('');
  }

  function section(base, cur, ids) {
    const rows = Y.addresses(Y.layout(cur).rows);
    const total = Y.COL_WIDTHS.reduce((a, b) => a + b, 0);
    const width = base.bodyWidth - 400;
    const colW = Y.COL_WIDTHS.map(w => Math.floor((w / total) * width));
    colW[colW.length - 1] += width - colW.reduce((a, b) => a + b, 0);
    const rowH = rows.map((_, ri) => (ri < 2 ? 1200 : 800));
    const trs = rows.map((line, ri) => `<hp:tr>${line.map(c => {
      const cs = c.colspan || 1; const rs = c.rowspan || 1;
      const w = colW.slice(c.col, c.col + cs).reduce((a, b) => a + b, 0);
      const hgt = rowH.slice(ri, ri + rs).reduce((a, b) => a + b, 0);
      const fk = fillKey(c);
      const bf = fk ? ids.fill[fk] : BORDER_PLAIN;
      const bold = c.head || /sum|blk|kyo|secsum|ccsum/.test(c.cls || '');
      return `<hp:tc name="" header="${ri < 2 ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${para(c.text, PARA_CENTER, bold ? ids.bodyBold : ids.body)}</hp:subList><hp:cellAddr colAddr="${c.col}" rowAddr="${ri}"/><hp:cellSpan colSpan="${cs}" rowSpan="${rs}"/><hp:cellSz width="${w}" height="${hgt}"/><hp:cellMargin left="113" right="113" top="28" bottom="28"/></hp:tc>`;
    }).join('')}</hp:tr>`).join('');
    const tbl = `<hp:tbl id="1700000001" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${Y.COLS}" cellSpacing="0" borderFillIDRef="${BORDER_PLAIN}" noAdjust="0"><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${rowH.reduce((a, b) => a + b, 0)}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="141" bottom="141"/><hp:inMargin left="113" right="113" top="28" bottom="28"/>${trs}</hp:tbl>`;
    const title = `${cur.year}학년도 입학생 교육과정 편제`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>${base.secOpen}`
      + `<hp:p id="0" paraPrIDRef="${PARA_CENTER}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${ids.title}">${base.secPr}${base.ctrl}</hp:run><hp:run charPrIDRef="${ids.title}"><hp:t>${xml(title)}</hp:t></hp:run></hp:p>`
      + `<hp:p id="0" paraPrIDRef="${PARA_LEFT}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${ids.body}"><hp:t>↔: 학기 단위 교차 이수</hp:t></hp:run></hp:p>`
      + `<hp:p id="0" paraPrIDRef="${PARA_LEFT}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${ids.body}">${tbl}<hp:t/></hp:run></hp:p>`
      + '</hs:sec>';
  }

  // JSZip: 브라우저 전역 JSZip 또는 require('jszip'). opts.type: 'blob' | 'uint8array'
  async function build(JSZip, cur, base, opts = {}) {
    const zip = new JSZip();
    // mimetype은 압축 없이 맨 앞
    zip.file('mimetype', b64decode(base.files.mimetype), { compression: 'STORE' });
    const { header, ids } = patchHeader(b64decode(base.files['Contents/header.xml']));
    for (const [name, data] of Object.entries(base.files)) {
      if (name === 'mimetype') continue;
      zip.file(name, name === 'Contents/header.xml' ? header : b64decode(data));
    }
    zip.file('Contents/section0.xml', section(base, cur, ids));
    return zip.generateAsync({ type: opts.type || 'blob', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
  }

  return { build, patchHeader };
});
