// 과목 → 교과별 수업시수 배당표의 교과 시트 배정
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduMapping = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const U = typeof require === 'function' ? require('./util.js') : root.EduUtil;

  // 배당표 예시 파일의 교과 시트 순서
  const SHEETS = ['국어', '수학', '영어', '역사', '일반사회', '윤리', '지리', '과학', '중국어', '일본어', '한문', '체육', '기술가정', '정보', '음악', '미술', '진로'];

  // 표시과목(교원조직 열) → 교과 시트
  const BY_COLUMN = {
    국어: '국어', 수학: '수학', 영어: '영어', 역사: '역사', 체육: '체육', 음악: '음악', 미술: '미술', 한문: '한문',
    일반사회: '일반사회', 공통사회: '일반사회', 도덕윤리: '윤리', 지리: '지리',
    물리: '과학', 화학: '과학', 생물: '과학', 지학: '과학', 공통과학: '과학',
    중어: '중국어', 일어: '일본어', 기가: '기술가정', 기술: '기술가정', 가정: '기술가정', 정보컴퓨터: '정보',
  };

  // column: 교원조직 표시과목(OrgLogic.columnFor 결과). 없으면 시트도 정하지 않는다.
  function sheetFor(name, kyo, column, sheetOverrides) {
    const key = U.norm(name);
    if (sheetOverrides && U.has(sheetOverrides, key)) return sheetOverrides[key] || null;
    if (!column) return null;
    return BY_COLUMN[column] || '진로';
  }

  return { SHEETS, sheetFor };
});
