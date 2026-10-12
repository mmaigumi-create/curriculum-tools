/* global html2canvas, jspdf */
// 편제표 → PNG·PDF. 화면 밖(#export-stage)에 인쇄용 표를 그려 html2canvas로 찍는다.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 인쇄용 한 장: 제목 + 표(화면 표와 같은 HTML, 수정 칸 없음)
  function sheetHtml(cur, table) {
    return `<div class="print-sheet" style="background:#fff;padding:28px 30px;width:1040px;font-family:var(--font);color:#0f172a">
      <div style="text-align:center;font-size:22px;font-weight:800;margin-bottom:6px">${esc(cur.year)}학년도 입학생 교육과정 편제</div>
      <div style="text-align:right;font-size:11px;color:#64748b;margin-bottom:6px">↔: 학기 단위 교차 이수</div>
      <div class="print-table">${table}</div></div>`;
  }

  async function canvasOf(node) {
    if (!window.html2canvas) throw new Error('그림 저장 도구(html2canvas)를 불러오지 못했습니다.');
    return html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  }

  async function png(node) {
    const cv = await canvasOf(node);
    return new Promise(res => cv.toBlob(res, 'image/png'));
  }

  // A4 세로에 너비를 맞춰 넣고, 길면 여러 쪽으로 나눈다
  async function pdf(node) {
    if (!window.jspdf) throw new Error('PDF 도구(jsPDF)를 불러오지 못했습니다.');
    const cv = await canvasOf(node);
    const doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 8;
    const pageW = 210 - margin * 2;
    const pageH = 297 - margin * 2;
    const scale = pageW / cv.width; // mm per px
    const sliceH = Math.floor(pageH / scale);
    for (let y = 0, page = 0; y < cv.height; y += sliceH, page++) {
      const h = Math.min(sliceH, cv.height - y);
      const part = document.createElement('canvas');
      part.width = cv.width; part.height = h;
      part.getContext('2d').drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
      if (page) doc.addPage();
      doc.addImage(part.toDataURL('image/png'), 'PNG', margin, margin, pageW, h * scale);
    }
    return doc.output('blob');
  }

  window.EduPyeonjeImage = { sheetHtml, png, pdf };
})();
