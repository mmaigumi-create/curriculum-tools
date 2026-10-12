/* global EduStore, EduShell, EduUtil, pdfjsLib */
// 시작: 저장값 불러오기 → 큰 틀 그리기
(function () {
  const PDF_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_BASE + 'pdf.worker.min.js';

  let storage;
  try { storage = window.localStorage; } catch (e) { storage = null; }
  if (!storage) {
    const m = {};
    storage = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
  }
  const store = EduStore.create(storage);
  EduShell.start({ store, PDF_BASE });

  // CDN 도구를 못 불러오면 알린다
  setTimeout(() => {
    const miss = [['ExcelJS', '엑셀'], ['pdfjsLib', 'PDF 읽기'], ['JSZip', '한글 파일'], ['html2canvas', '그림 저장'], ['jspdf', 'PDF 저장']]
      .filter(([g]) => !window[g]).map(([, n]) => n);
    if (miss.length) {
      document.getElementById('vendor-warn').innerHTML = `<div class="notice warn">인터넷 연결을 확인해 주세요. ${EduUtil.esc(miss.join(', '))} 도구를 불러오지 못해 해당 기능을 쓸 수 없습니다.</div>`;
    }
  }, 2500);
})();
