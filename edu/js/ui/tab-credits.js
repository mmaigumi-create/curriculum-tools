/* global EduShell, EduUtil, EduCredits, EduCreditsXlsx, EduCurriculum, OrgLogic, CreditPdf, SignupXlsx, ExcelJS, pdfjsLib */
// 이수학점 확인 탭: 이수현황 PDF + 수강신청 엑셀 → 학생마다 졸업·교과(군)별 더 신청해야 할 학점
// 학생 이름·신청 내역은 이 모듈 메모리에만 둔다(저장하지 않음). 새로고침하면 다시 올린다.
(function () {
  const U = EduUtil;
  const { esc } = U;
  const mem = { pdfs: new Map(), signups: new Map(), busy: '', errors: [], open: new Set() };

  function compute(st) {
    const itemsFor = (y, g) => {
      const cur = (st.authored && st.authored[y]) || (st.cohorts && st.cohorts[y]);
      return cur ? OrgLogic.planItems(EduCurriculum.toLegacyRows(cur), g) : null;
    };
    return EduCredits.compute({ pdfs: [...mem.pdfs.values()], signups: [...mem.signups.values()], itemsFor, gradCredits: EduCredits.GRAD_CREDITS, basicCap: EduCredits.BASIC_CAP });
  }

  function fileList(map, kind) {
    if (!map.size) return '<p class="hint" style="margin:6px 0 0">아직 올린 파일이 없습니다.</p>';
    return `<ul class="file-list">${[...map.entries()].map(([name, v]) => `<li><span>${esc(name)}</span><span class="hint" style="margin:0">학생 ${v.students.length}명</span><button type="button" class="link" data-del="${kind}|${esc(name)}">지우기</button></li>`).join('')}</ul>`;
  }

  function uploadCard() {
    return `<section class="card"><div class="card-head"><h2>자료 올리기</h2><div class="right">${mem.busy ? `<span class="badge info">${esc(mem.busy)}</span>` : ''}</div></div>
      <div class="up-grid">
        <div class="slot${mem.pdfs.size ? ' done' : ''}"><div class="t">① 나이스 이수현황 PDF <span class="badge ${mem.pdfs.size ? 'ok' : 'none'}">${mem.pdfs.size ? `${mem.pdfs.size}개` : '필수'}</span></div>
          <div class="sub">"반별 교육과정 이수현황"을 반마다 PDF로 저장한 파일. 여러 반·여러 학년을 한꺼번에 올려도 됩니다.</div>
          <label class="btn btn-ghost btn-sm file-btn">PDF 선택<input type="file" accept="application/pdf,.pdf" multiple id="credit-pdf"></label>
          ${fileList(mem.pdfs, 'pdf')}</div>
        <div class="slot${mem.signups.size ? ' done' : ''}"><div class="t">② 수강신청 파일 <span class="badge ${mem.signups.size ? 'ok' : 'none'}">${mem.signups.size ? `${mem.signups.size}개` : '선택'}</span></div>
          <div class="sub">수강신청통계 또는 교육과정편성(배정내역) 엑셀. 신청한 과목 학점을 더하고, 학번으로 번호를 붙입니다.</div>
          <label class="btn btn-ghost btn-sm file-btn">엑셀 선택<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple id="credit-xlsx"></label>
          ${fileList(mem.signups, 'xlsx')}</div>
      </div>
      ${mem.errors.length ? `<div class="notice err" style="margin-top:10px"><div>${mem.errors.map(esc).join('<br>')}</div></div>` : ''}
      <p class="hint">올린 학생 자료는 이 화면에만 있고 저장되지 않습니다. 새로고침하면 다시 올려 주세요.</p></section>`;
  }

  function studentTable(res, rows) {
    const areas = res.areas;
    const head = `<tr><th rowspan="2">학번</th><th rowspan="2">학년</th><th rowspan="2">반</th><th rowspan="2">번호</th><th rowspan="2" class="l">이름</th><th colspan="5" class="grp">합계 = ① + ② + ③ + ④</th><th rowspan="2" title="졸업 ${res.gradCredits}학점 이상까지 더 필요한 학점(${res.gradCredits} − 합계)">졸업까지 부족<br><small>(${res.gradCredits} 이상)</small></th><th colspan="${areas.length}" class="grp">교과(군)별 부족 (필수 학점 이상 · 필수 − 합계)</th><th rowspan="2" title="국어·수학·영어의 ①~④ 합, ${res.basicCap}학점 이하">국·수·영 합<br><small>(${res.basicCap} 이하)</small></th><th rowspan="2" title="${res.basicCap} − 국·수·영 합, 음수면 초과">국·수·영 여유<br><small>(음수 = 초과)</small></th><th rowspan="2" title="PDF 이수예정 선택과목 − ④ (다음 학년에 신청할 몫)">남은<br>선택</th></tr>
      <tr><th title="PDF 이수완료 학점">①<br>이수완료</th><th title="PDF 이수 중 학점(올해 듣는 과목)">②<br>이수 중</th><th title="PDF 이수예정 학점 중 학교공통(앞으로 모두 듣는 과목)">③<br>이수예정<br>(학교공통)</th><th title="수강신청 파일에서 신청한 내년 이후 선택과목 학점">④<br>신청한<br>선택</th><th>합계</th>${areas.map(a => `<th title="${esc(a)} 필수 학점까지 더 필요한 학점">${esc(a)}</th>`).join('')}</tr>`;
    const red = v => (v ? `<td class="short">${v}</td>` : '<td class="z">·</td>');
    const ncol = 15 + areas.length;
    const body = rows.map(s => `<tr class="g${s.grade} pick${mem.open.has(s.key) ? ' open' : ''}" data-open="${esc(s.key)}" title="누르면 교과(군)별 내역을 펼칩니다"><td>${esc(s.id || '')}</td><td class="rh${s.grade}">${s.grade}</td><td>${s.cls}</td><td>${s.no ?? ''}</td><td class="l b">${esc(s.name)}${s.hasSignup ? '' : ' <span class="badge none" title="수강신청 파일에 없음">신청 없음</span>'}</td>
      <td>${s.done}</td><td>${s.doing}</td><td>${s.common}</td><td>${s.applied || 0}</td><td class="b">${s.sum}</td>${red(s.gradNeed)}${areas.map(a => red(s.areas[a] && s.areas[a].need)).join('')}<td class="${s.basicOver ? 'short' : ''}">${s.basic}</td><td class="${s.basicOver ? 'short' : ''}">${s.basicRoom}</td><td>${s.electiveLeft || ''}</td></tr>${mem.open.has(s.key) ? detailRow(res, s, ncol) : ''}`).join('');
    return `<div class="table-wrap" data-keep-scroll="credits"><table class="grid credits"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${ncol}" class="hint">조건에 맞는 학생이 없습니다.</td></tr>`}</tbody></table></div>`;
  }

  // 학생 한 명의 교과(군)별 내역: 어느 칸에서 온 학점인지 그대로 보인다
  function detailRow(res, s, ncol) {
    const rows = res.areas.filter(a => s.areas[a]).map(a => {
      const x = s.areas[a];
      return `<tr><td class="l b">${esc(a)}</td><td>${x.done}</td><td>${x.doing}</td><td>${x.common}</td><td>${x.applied}</td><td class="b">${x.sum}</td><td>${x.required ? `필수 ${x.required} 이상` : ''}</td><td class="${x.need ? 'short' : 'z'}">${x.need || '·'}</td></tr>`;
    }).join('');
    const b = ['국어', '수학', '영어'].map(a => `${a} ${s.areas[a] ? s.areas[a].sum : 0}`).join(' + ');
    return `<tr class="detail"><td colspan="${ncol}"><div class="detail-box">
      <table class="grid mini"><thead><tr><th class="l">교과(군)</th><th>① 이수완료</th><th>② 이수 중</th><th>③ 이수예정<br>(학교공통)</th><th>④ 신청한 선택</th><th>합계</th><th>기준</th><th>부족(미달)</th></tr></thead>
      <tbody>${rows}<tr class="sum"><td class="l">전체</td><td>${s.done}</td><td>${s.doing}</td><td>${s.common}</td><td>${s.applied}</td><td>${s.sum}</td><td>졸업 ${res.gradCredits} 이상</td><td class="${s.gradNeed ? 'short' : 'z'}">${s.gradNeed || '·'}</td></tr></tbody></table>
      <p class="hint">국·수·영 합 = ${b} = <b>${s.basic}</b> (기준 ${res.basicCap} 이하 → ${s.basicOver ? `<b style="color:#b42318">${s.basicOver}학점 초과</b>` : `${s.basicRoom}학점 여유`}) · ③은 나이스 PDF의 "이수예정 학점 - 학교공통" 칸, 아직 고르지 않은 선택과목(${s.electivePlanned}학점)은 ④로 신청한 만큼만 들어갑니다.</p></div></td></tr>`;
  }

  function render(el, ctx) {
    const st = ctx.store.state;
    const res = mem.pdfs.size ? compute(st) : null;
    const g = st.ui.creditsGrade || 'all';
    const only = !!st.ui.creditsOnlyShort;
    let main = '<section class="card"><div class="empty-state"><div class="big">이수현황 PDF를 올려 주세요</div>나이스 "반별 교육과정 이수현황" PDF를 올리면 학생마다 바로 계산합니다.</div></section>';
    if (res) {
      const isShort = s => s.gradNeed > 0 || s.basicOver > 0 || res.areas.some(a => s.areas[a] && s.areas[a].need > 0);
      const rows = res.students.filter(s => (g === 'all' || String(s.grade) === g) && (!only || isShort(s)));
      const grades = [...new Set(res.students.map(s => s.grade))].sort();
      const nGrad = res.students.filter(s => s.gradNeed > 0).length;
      const nArea = res.students.filter(s => res.areas.some(a => s.areas[a] && s.areas[a].need > 0)).length;
      main = `${res.notices.map(n => `<div class="notice warn">${esc(n)}</div>`).join('')}
        <div class="kpis"><div class="kpi"><span>학생</span><b>${res.students.length}</b></div><div class="kpi"><span>신청 파일과 맞춘 학생</span><b>${res.students.filter(s => s.hasSignup).length}</b></div>
          <div class="kpi bad"><span>졸업 ${res.gradCredits}학점 이상 미달</span><b>${nGrad}</b></div><div class="kpi bad"><span>교과(군) 필수 학점 미달</span><b>${nArea}</b></div><div class="kpi bad"><span>국·수·영 ${res.basicCap}학점 초과</span><b>${res.students.filter(s => s.basicOver > 0).length}</b></div><div class="kpi warn"><span>확인 필요</span><b>${res.issues.length}</b></div></div>
        <section class="card" style="padding:14px"><div class="card-head"><h2>학생별 이수학점</h2><div class="right">
          <div class="seg">${['all', ...grades.map(String)].map(x => `<button type="button" class="${x === g ? 'on' : ''}" data-grade="${x}">${x === 'all' ? '전체' : `${x}학년`}</button>`).join('')}</div>
          <label class="check"><input type="checkbox" id="only-short"${only ? ' checked' : ''}> 부족 학생만</label></div></div>
          <p class="hint" style="margin-top:0">①②③은 나이스 PDF 값(③ = 이수예정 중 학교공통, 앞으로 모두 듣는 과목) · ④ = 수강신청한 내년 이후 선택과목 학점 · 학생 줄을 누르면 교과(군)별 내역이 펼쳐집니다 · 기준: 졸업 ${res.gradCredits}학점 이상, 교과(군) 필수 학점 이상, 국·수·영 합 ${res.basicCap}학점 이하 · 빨간 칸 = 기준 미달(더 신청할 학점) 또는 초과 · 교과(군) 칸은 생활·교양(기술·가정/정보, 제2외국어/한문, 교양)을 하나로 봅니다.</p>
          ${studentTable(res, rows)}</section>
        ${res.issues.length ? `<section class="card"><div class="card-head"><h2>확인 필요</h2><div class="right"><span class="badge warn">${res.issues.length}건</span></div></div>
          <div class="table-wrap"><table class="grid"><thead><tr><th>구분</th><th>대상</th><th class="l">내용</th></tr></thead><tbody>${res.issues.map(i => `<tr><td>${esc(i.kind)}</td><td>${esc(i.who || '')}</td><td class="l">${esc(i.text)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
    }
    el.innerHTML = `<div class="page-head"><div><h1>이수학점 확인</h1><p class="desc">학생마다 졸업까지·교과(군)별로 더 신청해야 할 학점 · 수강신청 상담용</p></div>
      <div class="actions"><button type="button" class="btn btn-primary" id="dl-credits"${res ? '' : ' disabled'}>${ctx.icon('download')}엑셀 내려받기</button></div></div>
      <section class="card"><div class="card-head"><h2>확인 기준</h2><div class="right"><span class="hint" style="margin:0">고정값(수정할 수 없음)</span></div></div>
        <div class="rules"><div class="rule"><span>졸업 학점(교과)</span><b>${EduCredits.GRAD_CREDITS}학점 이상</b></div>
          <div class="rule"><span>교과(군)별</span><b>필수 학점 이상</b><em>나이스 PDF의 필수 학점</em></div>
          <div class="rule"><span>국어·수학·영어 합</span><b>${EduCredits.BASIC_CAP}학점 이하</b></div></div></section>
      ${uploadCard()}${main}`;
    bind(el, ctx, res);
  }

  function bind(el, ctx, res) {
    el.querySelector('#credit-pdf').addEventListener('change', e => onFiles(ctx, [...e.target.files], 'pdf'));
    el.querySelector('#credit-xlsx').addEventListener('change', e => onFiles(ctx, [...e.target.files], 'xlsx'));
    el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      const [kind, ...rest] = b.dataset.del.split('|');
      (kind === 'pdf' ? mem.pdfs : mem.signups).delete(rest.join('|'));
      ctx.rerender();
    }));
    el.querySelectorAll('[data-open]').forEach(tr => tr.addEventListener('click', () => {
      const k = tr.dataset.open;
      if (mem.open.has(k)) mem.open.delete(k); else mem.open.add(k);
      ctx.rerender();
    }));
    el.querySelectorAll('[data-grade]').forEach(b => b.addEventListener('click', () => ctx.store.update(s => { s.ui.creditsGrade = b.dataset.grade; })));
    const only = el.querySelector('#only-short');
    if (only) only.addEventListener('change', () => ctx.store.update(s => { s.ui.creditsOnlyShort = only.checked; }));
    el.querySelector('#dl-credits').addEventListener('click', e => download(ctx, res, e.currentTarget));
  }

  async function onFiles(ctx, files, kind) {
    if (!files.length || mem.busy) return;
    mem.errors = [];
    for (const f of files) {
      mem.busy = `${f.name} 읽는 중...`;
      ctx.rerender();
      try {
        if (kind === 'pdf') {
          if (!window.pdfjsLib) throw new Error('PDF 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
          const r = await CreditPdf.parseCreditPdf(pdfjsLib, new Uint8Array(await f.arrayBuffer()), { cMapUrl: ctx.PDF_BASE + 'cmaps/', cMapPacked: true });
          if (!r.students.length) throw new Error('"반별 교육과정 이수현황" 쪽을 찾지 못했습니다.');
          mem.pdfs.set(f.name, r);
        } else {
          if (!window.ExcelJS) throw new Error('엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(await f.arrayBuffer());
          mem.signups.set(f.name, SignupXlsx.parseSignupWorkbook(wb, f.name));
        }
      } catch (e) { mem.errors.push(`${f.name}: ${e.message}`); }
    }
    mem.busy = '';
    ctx.rerender();
  }

  async function download(ctx, res, btn) {
    if (!res) return;
    if (!window.ExcelJS) { ctx.toast('엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error'); return; }
    btn.disabled = true;
    try {
      const wb = EduCreditsXlsx.build(ExcelJS, { result: res, gradCredits: res.gradCredits });
      U.downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: U.XLSX_TYPE }), `${res.year}학년도 이수학점 확인.xlsx`);
    } catch (e) { ctx.toast('엑셀을 만들지 못했습니다: ' + e.message, 'error'); }
    btn.disabled = false;
  }

  EduShell.register({
    id: 'credits', group: 'out', label: '이수학점 확인',
    ready() { return { ok: mem.pdfs.size > 0, missing: mem.pdfs.size ? [] : ['이수현황 PDF(이 탭에서 올림)'] }; },
    render,
  });
})();
