// 선택과목 배정 현황 이미지(타임별 반 배정 표 화면 캡처)를 읽는다.
// 표의 격자선을 찾아 칸을 나누고, 과목 이름(세로쓰기)과 각 반 인원을 글자 인식(OCR)으로 읽는다.
// 이미지 처리는 RGBA 배열만 다루므로 브라우저(canvas)와 node(pngjs) 양쪽에서 쓴다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ImgParse = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function px(img, x, y) {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  }
  function lum(p) { return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]; }
  function isGridColor(p) {
    const [r, g, b] = p;
    return Math.max(r, g, b) - Math.min(r, g, b) < 14 && r >= 180 && r <= 215;
  }
  function isInk(p) { return lum(p) < 150; }

  // 연속된 좌표를 하나로 묶는다 (두께 있는 선)
  function groupRuns(list, gap = 2) {
    const out = [];
    for (const v of list) {
      const last = out[out.length - 1];
      if (last && v - last[1] <= gap) last[1] = v; else out.push([v, v]);
    }
    return out.map(([a, b]) => Math.round((a + b) / 2));
  }

  function findLines(img) {
    const { width: w, height: h } = img;
    const hy = [];
    for (let y = 0; y < h; y++) {
      let n = 0;
      for (let x = 0; x < w; x++) if (isGridColor(px(img, x, y))) n++;
      if (n > w * 0.45) hy.push(y);
    }
    const rows = groupRuns(hy);
    const vx = [];
    if (rows.length >= 2) {
      const top = rows[0];
      const bottom = rows[rows.length - 1];
      for (let x = 0; x < w; x++) {
        let n = 0;
        for (let y = top; y <= bottom; y++) if (isGridColor(px(img, x, y))) n++;
        if (n > (bottom - top) * 0.55) vx.push(x);
      }
    }
    return { rows, cols: groupRuns(vx) };
  }

  // 칸 배경색: 칸 안쪽을 훑어 가장 흔한 밝은 색
  function cellBg(img, x0, x1, y0, y1) {
    const counts = new Map();
    for (let y = y0 + 2; y < y1 - 1; y += 2) {
      for (let x = x0 + 2; x < x1 - 1; x += 2) {
        const p = px(img, x, y);
        if (isInk(p)) continue;
        const k = p.join(',');
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    let best = null; let bn = 0;
    for (const [k, n] of counts) if (n > bn) { best = k; bn = n; }
    return best ? best.split(',').map(Number) : [255, 255, 255];
  }
  const isWhite = p => p[0] > 248 && p[1] > 248 && p[2] > 248;
  const isOffGray = p => Math.abs(p[0] - p[1]) < 6 && Math.abs(p[1] - p[2]) < 6 && p[0] >= 200 && p[0] <= 235;

  function hasInk(img, x0, x1, y0, y1) {
    let n = 0;
    for (let y = y0 + 2; y < y1 - 1; y++) for (let x = x0 + 2; x < x1 - 1; x++) if (isInk(px(img, x, y))) n++;
    return n;
  }

  // 칸 숫자가 빨간 글씨인지 (원본 화면에서 빨갛게 표시된 인원)
  function isRedText(img, c) {
    let n = 0;
    for (let y = c.y0 + 2; y < c.y1 - 1; y++) for (let x = c.x0 + 2; x < c.x1 - 1; x++) {
      const [r, g, b] = px(img, x, y);
      if (r > 180 && r - Math.max(g, b) > 100) n++;
    }
    return n > 5;
  }

  // 표 구조 분석. 반환: { columns: [{x0,x1,header:{y0,y1}}], dataRows: [{y0,y1}], cells: [[{white, ink}]] }
  function analyze(img) {
    const { rows, cols } = findLines(img);
    if (rows.length < 4 || cols.length < 4) return null;
    const bands = [];
    for (let i = 0; i + 1 < rows.length; i++) if (rows[i + 1] - rows[i] > 6) bands.push({ y0: rows[i], y1: rows[i + 1] });
    const spans = [];
    for (let i = 0; i + 1 < cols.length; i++) if (cols[i + 1] - cols[i] > 6) spans.push({ x0: cols[i], x1: cols[i + 1] });
    // 과목 열: 너비가 가장 흔한 열들 (앞쪽 넓은 열은 제목 열)
    const widths = spans.map(s => s.x1 - s.x0);
    const mode = widths.slice().sort((a, b) => widths.filter(v => v === b).length - widths.filter(v => v === a).length)[0];
    const subj = spans.filter(s => Math.abs(s.x1 - s.x0 - mode) <= 2);
    // 데이터 행: 과목 칸 배경이 흰색이거나 회색(미개설)인 행
    const dataRows = bands.filter(b => {
      let ok = 0;
      for (const s of subj) {
        const bg = cellBg(img, s.x0, s.x1, b.y0, b.y1);
        if (isWhite(bg) || isOffGray(bg)) ok++;
      }
      return ok >= subj.length * 0.9 && subj.some(s => isOffGray(cellBg(img, s.x0, s.x1, b.y0, b.y1)));
    });
    if (!dataRows.length) return null;
    // 과목 이름 칸: 첫 데이터 행 위쪽에서 가장 높은 띠
    const above = bands.filter(b => b.y1 <= dataRows[0].y0);
    const header = above.slice().sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))[0];
    const cells = dataRows.map(r => subj.map(s => {
      const bg = cellBg(img, s.x0, s.x1, r.y0, r.y1);
      return { white: isWhite(bg), ink: hasInk(img, s.x0, s.x1, r.y0, r.y1), x0: s.x0, x1: s.x1, y0: r.y0, y1: r.y1 };
    }));
    // 전체합계 행: 과목 이름 칸 바로 아래 띠. 과목별 배정 인원 합계가 굵은 검정 글씨로 적혀 있어 검산에 쓴다.
    // (아래쪽 배정(명) 행도 같은 숫자지만 회색 글씨라 잘못 읽는 일이 잦다)
    const totalRow = header ? bands.find(b => b.y0 >= header.y1 - 1 && b.y1 <= dataRows[0].y0) || null : null;
    const totals = totalRow ? subj.map(s => ({ x0: s.x0, x1: s.x1, y0: totalRow.y0, y1: totalRow.y1, ink: hasInk(img, s.x0, s.x1, totalRow.y0, totalRow.y1) })) : null;
    return { columns: subj.map(s => ({ ...s, header })), dataRows, cells, totals };
  }

  // 세로로 쌓인 글자를 잘라 가로 한 줄 이미지로 다시 붙인다 (OCR이 세로쓰기를 못 읽어서)
  function verticalToLine(img, x0, x1, y0, y1, scale = 2) {
    const inkRows = [];
    for (let y = y0 + 1; y < y1; y++) {
      let n = 0;
      for (let x = x0 + 2; x < x1 - 1; x++) if (isInk(px(img, x, y))) n++;
      inkRows.push(n > 0);
    }
    const chars = [];
    let start = -1;
    inkRows.forEach((v, i) => {
      if (v && start < 0) start = i;
      if (!v && start >= 0) { chars.push([start, i]); start = -1; }
    });
    if (start >= 0) chars.push([start, inkRows.length]);
    // 한 글자가 여러 조각(ㅇ/ㅡ/ㅁ)으로 끊긴 것을 붙인다. 한글 글자는 대략 정사각형이므로
    // 글자 폭을 넘지 않는 범위에서 이어지는 조각을 합친다.
    let inkL = Infinity; let inkR = -1;
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 2; x < x1 - 1; x++) {
      if (isInk(px(img, x, y))) { if (x < inkL) inkL = x; if (x > inkR) inkR = x; }
    }
    const charW = inkR >= inkL ? inkR - inkL + 1 : 12;
    const merged = [];
    for (const c of chars) {
      const last = merged[merged.length - 1];
      if (last && c[1] - last[0] <= charW * 1.12) last[1] = c[1];
      else merged.push([...c]);
    }
    const cw = x1 - x0 - 3;
    const ch = Math.max(...merged.map(([a, b]) => b - a), 1);
    const pad = 6;
    const W = (merged.length * (cw + 4) + pad * 2) * scale;
    const H = (ch + pad * 2) * scale;
    const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
    merged.forEach(([a, b], k) => {
      const ox = pad + k * (cw + 4);
      const oy = pad + Math.floor((ch - (b - a)) / 2);
      for (let y = a; y < b; y++) {
        for (let x = 0; x < cw; x++) {
          const v = lum(px(img, x0 + 2 + x, y0 + 1 + y)) < 170 ? 0 : 255;
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
            const i = (((oy + y - a) * scale + sy) * W + (ox + x) * scale + sx) * 4;
            out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
          }
        }
      }
    });
    return { image: out, count: merged.length };
  }

  // 한 칸의 숫자 영역을 잘라 확대(OCR용).
  // 빨간 숫자는 획이 가늘고 가장자리가 색 번짐이라, 밝기로 흑백을 가르면 획이 끊겨 71→1, 67→6처럼 읽혔다.
  // 그래서 세 채널 중 가장 어두운 값을 회색조로 쓰고(빨강도 진하게), 흑백 대신 부드럽게(쌍선형) 확대한다.
  function cropCell(img, c, scale = 4) {
    const x0 = c.x0 + 2; const y0 = c.y0 + 2;
    const w = c.x1 - c.x0 - 3; const h = c.y1 - c.y0 - 3;
    const pad = 8;
    // 회색 바탕·회색 글자(배정 행)도 또렷하도록 바탕은 흰색, 가장 진한 글자는 검정으로 늘린다
    let lo = 255;
    const bg = cellBg(img, c.x0, c.x1, c.y0, c.y1);
    const hi = Math.min(bg[0], bg[1], bg[2]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = px(img, x0 + x, y0 + y);
      lo = Math.min(lo, p[0], p[1], p[2]);
    }
    const span = Math.max(hi - lo, 1);
    const g = (x, y) => {
      const p = px(img, x0 + Math.max(0, Math.min(w - 1, x)), y0 + Math.max(0, Math.min(h - 1, y)));
      return Math.max(0, Math.min(255, ((Math.min(p[0], p[1], p[2]) - lo) / span) * 255));
    };
    const W = (w + pad * 2) * scale; const H = (h + pad * 2) * scale;
    const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
    for (let Y = 0; Y < h * scale; Y++) for (let X = 0; X < w * scale; X++) {
      const fx = (X + 0.5) / scale - 0.5; const fy = (Y + 0.5) / scale - 0.5;
      const ix = Math.floor(fx); const iy = Math.floor(fy); const ax = fx - ix; const ay = fy - iy;
      const v = g(ix, iy) * (1 - ax) * (1 - ay) + g(ix + 1, iy) * ax * (1 - ay) + g(ix, iy + 1) * (1 - ax) * ay + g(ix + 1, iy + 1) * ax * ay;
      const i = ((Y + pad * scale) * W + X + pad * scale) * 4;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    }
    return out;
  }

  // 반별 인원 합이 배정(명) 행 숫자와 다르면 잘못 읽은 칸이 있다는 뜻
  function totalFlag(counts, total) {
    if (total === null || total === undefined) return null;
    const sum = counts.reduce((a, c) => a + (c || 0), 0);
    if (counts.some(c => c === null) || sum !== total) return `반별 인원 합(${sum}명)이 이미지의 전체합계(${total}명)과 다릅니다. 원본 이미지와 비교해 고쳐 주세요`;
    return null;
  }

  // ---------- 이름 맞추기 ----------
  function jamoKey(s) {
    // 한글 음절을 초·중·종성으로 풀어 비교 정확도를 높인다
    let out = '';
    for (const ch of (s || '').replace(/[^0-9A-Za-z가-힣ⅠⅡ]/g, '')) {
      const c = ch.charCodeAt(0) - 0xac00;
      if (c >= 0 && c < 11172) out += String.fromCharCode(0x1100 + Math.floor(c / 588), 0x1161 + Math.floor((c % 588) / 28), 0x11a7 + (c % 28));
      else out += ch;
    }
    return out;
  }
  function editDistance(a, b) {
    const m = a.length; const n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[m][n];
  }
  // 글자 수(charCount)도 힌트로 쓴다. 반환: { name, score } (score 0~1, 1이 완전 일치)
  function bestMatch(ocrText, charCount, candidates) {
    const a = jamoKey(ocrText);
    let best = null;
    for (const cand of candidates) {
      const plain = cand.replace(/[^0-9A-Za-z가-힣ⅠⅡ]/g, '');
      const b = jamoKey(cand);
      let score = 1 - editDistance(a, b) / Math.max(a.length, b.length, 1);
      if (charCount && plain.length !== charCount) score -= 0.15 * Math.min(Math.abs(plain.length - charCount), 3);
      if (!best || score > best.score) best = { name: cand, score };
    }
    return best;
  }

  // 반 수 규칙: 1~39명 1반, 60~80명 2반, 0명은 세지 않음, 그 밖은 비고
  function sectionsFor(count) {
    if (count === null || count === undefined || Number.isNaN(count)) return { sections: 1, flag: '인원을 읽지 못해 1반으로 셌습니다' };
    if (count === 0) return { sections: 0, flag: null };
    if (count >= 1 && count <= 39) return { sections: 1, flag: null };
    if (count >= 60 && count <= 80) return { sections: 2, flag: null };
    return { sections: 0, flag: `${count}명은 반 수 규칙(1~39명 1반, 60~80명 2반)에 맞지 않아 세지 않았습니다` };
  }

  // 이미지의 과목 순서는 편제표 순서에서 개설 안 된 과목만 빠진 것이다.
  // 그래서 순서를 지키면서 글자 유사도 합이 가장 큰 짝을 찾는다(서열 정렬).
  function alignNames(cols, candidates) {
    const m = cols.length; const n = candidates.length;
    const sc = cols.map(c => candidates.map(cand => (c.raw ? bestMatch(c.raw, c.chars, [cand]).score : 0)));
    const SKIP_COL = -0.05;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(-Infinity));
    const back = Array.from({ length: m + 1 }, () => Array(n + 1).fill(null));
    for (let j = 0; j <= n; j++) dp[0][j] = 0;
    for (let i = 1; i <= m; i++) {
      dp[i][0] = dp[i - 1][0] + SKIP_COL; back[i][0] = 'col';
      for (let j = 1; j <= n; j++) {
        const opts = [
          [dp[i][j - 1], 'cand'],
          [dp[i - 1][j] + SKIP_COL, 'col'],
          [dp[i - 1][j - 1] + sc[i - 1][j - 1] - 0.1, 'match'],
        ];
        const best = opts.reduce((a, b) => (b[0] > a[0] ? b : a));
        dp[i][j] = best[0]; back[i][j] = best[1];
      }
    }
    const out = Array(m).fill(null);
    let i = m; let j = n;
    while (i > 0 && j >= 0) {
      const b = back[i][j];
      if (b === 'match') { out[i - 1] = { name: candidates[j - 1], score: sc[i - 1][j - 1] }; i--; j--; }
      else if (b === 'cand') j--;
      else i--;
    }
    return out;
  }

  // ocr: { text(image) -> Promise<string>, digits(image) -> Promise<string> }
  // candidates: 맞춰 볼 과목 이름 목록 (편제표 순서)
  // 반환: { subjects: [{ ocr, name, score, counts:[..], sections, flags:[..] }], warnings: [] }
  async function readAssignmentImage(img, ocr, candidates, onProgress) {
    const t = analyze(img);
    if (!t) return { subjects: [], warnings: ['표를 찾지 못했습니다. 반 배정 표 화면을 그대로 캡처한 이미지인지 확인해 주세요.'] };
    const subjects = [];
    const total = t.columns.length;
    for (let ci = 0; ci < total; ci++) {
      const col = t.columns[ci];
      const { image, count } = verticalToLine(img, col.x0, col.x1, col.header.y0, col.header.y1);
      const raw = count ? (await ocr.text(image)).replace(/\s+/g, '') : '';
      const counts = [];
      const reds = [];
      const rowIdx = []; // 인원마다 몇 번째 타임(세트) 행인지
      const flags = [];
      let sections = 0;
      for (let ri = 0; ri < t.cells.length; ri++) {
        const c = t.cells[ri][ci];
        if (!c.white) continue;
        rowIdx.push(ri);
        reds.push(isRedText(img, c));
        let n = null;
        if (c.ink > 3) {
          const s = (await ocr.digits(cropCell(img, c))).replace(/\D/g, '');
          n = s ? parseInt(s, 10) : null;
        } else n = 0;
        counts.push(n);
        const r = sectionsFor(n);
        sections += r.sections;
        if (r.flag) flags.push(r.flag);
      }
      let totalN = null;
      const tc = t.totals && t.totals[ci];
      if (tc && tc.ink > 3) {
        const s = (await ocr.digits(cropCell(img, tc))).replace(/\D/g, '');
        totalN = s ? parseInt(s, 10) : null;
      }
      const tf = totalFlag(counts, totalN);
      if (tf) flags.push(tf);
      subjects.push({ raw, chars: count, counts, reds, rowIdx, total: totalN, sections, flags });
      if (onProgress) onProgress(ci + 1, total);
    }
    const aligned = alignNames(subjects, candidates);
    // 순서가 편제표와 다른 과목(학교가 순서를 바꿔 둔 경우)은 남은 후보 중 가장 비슷한 이름으로
    const used = new Set(aligned.filter(Boolean).map(a => a.name));
    subjects.forEach((s, k) => {
      if (aligned[k] || !s.raw) return;
      const rest = candidates.filter(c => !used.has(c));
      const m = rest.length ? bestMatch(s.raw, s.chars, rest) : null;
      if (m && m.score >= 0.5) { aligned[k] = m; used.add(m.name); }
    });
    subjects.forEach((s, k) => {
      const a = aligned[k];
      s.name = a ? a.name : null;
      s.score = a ? a.score : 0;
      s.sure = !!a && a.score >= 0.5;
    });
    return { subjects, setCount: t.dataRows.length, warnings: [] };
  }

  return { analyze, verticalToLine, cropCell, bestMatch, alignNames, jamoKey, sectionsFor, totalFlag, isRedText, readAssignmentImage, findLines };
});
