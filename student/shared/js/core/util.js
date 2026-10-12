// 여러 모듈이 같이 쓰는 작은 도우미
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduUtil = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 학기 칸 키: '학년-학기'
  const SEM_KEYS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];
  const GRADE_SEMS = { 1: ['1-1', '1-2'], 2: ['2-1', '2-2'], 3: ['3-1', '3-2'] };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 가운뎃점 모양 통일, 공백 하나로
  function norm(s) {
    return String(s ?? '').replace(/[ㆍ·・•]/g, '·').replace(/\s+/g, ' ').trim();
  }

  // 이름 비교용: 공백·별표·괄호 설명·가운뎃점을 뺀다 ("화학 반응의 세계" = "화학반응의세계")
  function compact(s) {
    return norm(s).replace(/\([^)]*\)/g, '').replace(/[\s*·]/g, '').replace(/Ⅰ/g, 'I').replace(/Ⅱ/g, 'II');
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function isBlank(v) {
    return v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));
  }

  // 입력 칸 글자 → 숫자 또는 '' (빈칸)
  function toNumOrBlank(v) {
    if (isBlank(v) || String(v).trim() === '') return '';
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : '';
  }

  const has = (obj, k) => !!obj && Object.prototype.hasOwnProperty.call(obj, k);

  function clone(v) {
    return v === undefined ? v : JSON.parse(JSON.stringify(v));
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // 교과(군) 이름 → 졸업 영역(생활·교양 = 기술·가정/정보, 제2외국어/한문, 교양)
  const AREAS = ['국어', '수학', '영어', '한국사', '사회', '과학', '체육', '예술', '생활·교양'];
  function areaOf(label) {
    const t = String(label || '').replace(/\s/g, '');
    if (/한국사/.test(t)) return '한국사';
    if (/^국어/.test(t)) return '국어';
    if (/^수학/.test(t)) return '수학';
    if (/^영어/.test(t)) return '영어';
    if (/사회|역사|도덕|윤리|지리/.test(t)) return '사회';
    if (/과학/.test(t)) return '과학';
    if (/체육/.test(t)) return '체육';
    if (/예술|음악|미술|연극/.test(t)) return '예술';
    if (/기술|가정|정보|외국어|한문|교양/.test(t)) return '생활·교양';
    return t;
  }

  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  return { SEM_KEYS, GRADE_SEMS, esc, norm, compact, num, isBlank, toNumOrBlank, has, clone, downloadBlob, XLSX_TYPE, areaOf, AREAS };
});
