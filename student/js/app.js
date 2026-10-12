/* global EduUtil, EduCurriculum, EduPyeonjeLayout, EduShareLink, StudentPicks, STUDENT_SUBJECTS, STUDENT_MAJORS */
// 학생용 웹: 링크(#p=)의 편제로 표를 그리고, 묶음 칸에서 과목을 골라 학점을 확인한다.
// 링크가 없거나 깨지면 이수학점 확인 대신 안내만 보인다(과목 정보·진로 탭은 그대로 쓸 수 있다).
(async function () {
  const U = EduUtil; const Y = EduPyeonjeLayout; const L = EduShareLink; const S = StudentPicks;
  const { esc } = U;
  const st = { pkg: null, linkErr: '', ci: 0, tab: 'credits', open: null, q: '', mq: '' };

  const code = L.fromHash(location.hash);
  if (code) {
    try { st.pkg = await L.decode(code); } catch (e) { st.linkErr = e.message; }
  }
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const get = k => { try { return store ? JSON.parse(store.getItem(k) || 'null') : null; } catch (e) { return null; } };
  const set = (k, v) => { try { if (store) store.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 계산은 된다 */ } };
  const school = () => (st.pkg && st.pkg.school) || '';
  const cur = () => st.pkg.cohorts[st.ci];
  const pickKey = () => `수강신청도우미:${school()}:${cur().year}`;
  const ui = get(`수강신청도우미:${school()}:ui`) || {};
  if (st.pkg && Number.isInteger(ui.ci) && ui.ci >= 0 && ui.ci < st.pkg.cohorts.length) st.ci = ui.ci;
  if (['credits', 'subjects', 'career'].includes(ui.tab)) st.tab = ui.tab;
  const saveUi = () => set(`수강신청도우미:${school()}:ui`, { ci: st.ci, tab: st.tab });

  const ICON = {
    credits: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 10v10"/>',
    subjects: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    career: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  };
  const TABS = [['credits', '이수학점 확인'], ['subjects', '과목 정보 찾기'], ['career', '진로별 선택과목 정보']];

  function renderNav() {
    document.getElementById('nav').innerHTML = `<div class="nav-group">메뉴</div>` + TABS.map(([id, label]) => `<button type="button" class="nav-item${st.tab === id ? ' active' : ''}" data-tab="${id}"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</svg><span class="label">${label}</span></button>`).join('');
    document.querySelectorAll('#nav [data-tab]').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; st.open = null; saveUi(); render(); window.scrollTo({ top: 0 }); }));
    document.getElementById('foot-school').textContent = school() || '학교 링크 없음';
  }

  function renderNoLink(view) {
    view.innerHTML = `<div class="page-head"><div><h1>이수학점 확인</h1></div></div>
      ${st.linkErr ? `<div class="notice err" id="link-error">${esc(st.linkErr)}</div>` : ''}
      <section class="card" id="no-link"><div class="empty-state"><div class="big">선생님께 받은 링크로 열어 주세요</div>
        학교마다 편제가 달라서, 선생님이 나눠 준 링크로 열어야 우리 학교 편제표가 나옵니다.<br>과목 정보 찾기와 진로별 선택과목 정보는 링크 없이도 볼 수 있습니다.</div></section>`;
  }

  // ---------- 이수학점 확인 ----------
  // 고를 수가 애매한 칸(학점이 나누어떨어지지 않음 등)은 끝에 " ?"를 붙인다
  function slotText(s, n) {
    if (!s.count) return '?';
    const t = n >= s.count ? `${s.count}개 선택 완료 ✓` : n ? `${s.count}개 중 ${n}개` : `${s.count}개 선택`;
    return s.warn ? `${t} ?` : t;
  }
  function tableHtml(c, sum) {
    const { rows } = Y.layout(c);
    const bySlot = new Map(sum.slots.map(s => [s.id, s]));
    const out = [];
    rows.forEach((line, ri) => {
      if (line.kind === 'cc' || line.kind === 'grand') return;
      let cells = line;
      if (ri === 0 || line.kind === 'total') cells = line.slice(0, -1); // 편성단위합 열 빼기
      else cells = line.filter(x => x.cls !== 'secsum');
      const html = cells.map(x => {
        const span = `${x.rowspan > 1 ? ` rowspan="${x.rowspan}"` : ''}${x.colspan > 1 ? ` colspan="${x.colspan}"` : ''}`;
        if (ri < 2) return `<th${span} class="${x.cls || ''}">${esc(x.text).replace(/\n/g, '<br>')}</th>`;
        const e = x.edit || {};
        const id = e.kind === 'block' ? `${e.sem}|${e.from}` : e.kind === 'sem' ? `${e.sem}|r${e.idx}` : null;
        const s = id && bySlot.get(id);
        const cls = [x.cls || '', x.align === 'left' ? 'l' : ''].join(' ').trim();
        if (s) {
          const n = (sum.picks[s.id] || []).length;
          return `<td${span} class="${cls} sl${n >= s.count && s.count ? ' done' : ''}${s.warn ? ' warn' : ''}" data-slot="${esc(s.id)}" title="${esc(s.warn || '눌러서 과목 고르기')}">${esc(slotText(s, n))}</td>`;
        }
        return `<td${span} class="${cls}">${esc(x.text ?? '').replace(/\n/g, '<br>')}</td>`;
      }).join('');
      out.push(`<tr${line.kind === 'total' ? ' class="sum"' : ''}>${html}</tr>`);
    });
    return `<div class="table-wrap" data-keep-scroll="st"><table class="grid pyeonje"><thead>${out.slice(0, 2).join('')}</thead><tbody>${out.slice(2).join('')}</tbody></table></div>`;
  }
  function summaryHtml(sum) {
    const it = (label, val, ok, sub) => `<div class="it ${ok ? 'good' : 'bad'}"><span>${label}</span><b>${val}</b><span class="hint" style="margin:0">${sub}</span></div>`;
    return `${sum.unfilled ? `<div class="notice warn">아직 고르지 않은 칸이 ${sum.unfilled}개 있습니다. 표의 파란 글자 칸을 눌러 과목을 골라 주세요.</div>` : ''}
      <div class="sum-grid" style="margin-top:10px">
        ${it('교과 이수 학점', `<span id="sum-total">${sum.total}</span>`, sum.gradOk, `졸업 ${sum.grad}학점 ${sum.gradOk ? '이상' : `미달(${sum.grad - sum.total} 부족)`} · 고정 ${sum.fixed} + 고른 ${sum.chosen}`)}
        ${it('국어·수학·영어 합', sum.basic, sum.basicOk, `${sum.basicCap}학점 ${sum.basicOk ? '이하' : `초과(${sum.basic - sum.basicCap})`}`)}
        ${sum.areas.map(a => it(a.area, a.sum, a.ok, `필수 ${a.min} ${a.ok ? '이상' : `미달(${a.min - a.sum} 부족)`}`)).join('')}
      </div>
      <p class="hint">교과 학점만 셉니다(창의적 체험활동 제외). 생활·교양 = 기술·가정, 정보, 제2외국어/한문, 교양. 실제 이수 여부는 담임 선생님께 확인하세요.</p>`;
  }
  function renderCredits(view) {
    const c = cur();
    const sum = S.summarize(c, get(pickKey()) || {});
    view.innerHTML = `<div class="page-head"><div><h1>이수학점 확인</h1><p class="desc">${esc(school())} · 편제표에서 파란 칸을 눌러 신청한(또는 신청할) 과목을 고르세요</p></div></div>
      <section class="card"><div class="card-head"><h2>입학년도</h2></div>
        <div class="seg" id="cohort-seg">${st.pkg.cohorts.map((x, i) => `<button type="button" data-cohort="${i}" class="${i === st.ci ? 'on' : ''}">${esc(S.cohortLabel(x.year))}</button>`).join('')}</div></section>
      <section class="card" style="padding:14px"><div class="card-head"><h2>${esc(c.title || `${c.year}학년도 입학생`)} 편제표</h2><div class="right"><button type="button" class="btn btn-ghost btn-sm" id="pick-reset">고른 과목 모두 지우기</button></div></div>${tableHtml(c, sum)}</section>
      <section class="card"><div class="card-head"><h2>학점 요약</h2></div>${summaryHtml(sum)}</section>`;
    view.querySelectorAll('[data-cohort]').forEach(b => b.addEventListener('click', () => { st.ci = Number(b.dataset.cohort); st.open = null; saveUi(); render(); }));
    view.querySelector('#pick-reset').addEventListener('click', () => { if (confirm('이 입학년도에서 고른 과목을 모두 지울까요?')) { set(pickKey(), {}); render(); } });
    view.querySelectorAll('td[data-slot]').forEach(td => td.addEventListener('click', () => { st.open = td.dataset.slot; openPick(view, td, sum); }));
    if (st.open) { const td = view.querySelector(`td[data-slot="${CSS.escape(st.open)}"]`); if (td) openPick(view, td, sum); }
  }
  let offRef = null; // 열린 팝오버의 바깥 클릭 감시기는 늘 하나만 둔다
  function dropOff() { if (offRef) { document.removeEventListener('mousedown', offRef); offRef = null; } }
  function openPick(view, td, sum) {
    dropOff();
    view.querySelectorAll('.popover').forEach(p => p.remove());
    const s = sum.slots.find(x => x.id === st.open);
    if (!s) return;
    const mine = sum.picks[s.id] || [];
    const taken = S.takenElsewhere(sum.slots, sum.picks, s.id);
    const full = mine.length >= s.count;
    const p = document.createElement('div');
    p.className = 'popover pick';
    p.innerHTML = `<h4>${s.sem[0]}학년 ${s.sem[2]}학기 · ${s.count}개 선택 (${mine.length}/${s.count})</h4>
      ${s.note ? `<div class="hint" style="margin:0">비고: ${esc(s.note)}</div>` : ''}${s.warn ? `<div class="notice warn">${esc(s.warn)}</div>` : ''}
      <div>${s.options.map(o => {
        const on = mine.includes(o.name);
        const other = taken.get(o.name);
        const lock = !on && (other || full);
        const why = other ? `${other[0]}학년 ${other[2]}학기에 선택함` : (lock ? '다 골랐어요' : '');
        return `<label class="${lock ? 'locked' : ''}"><input type="checkbox" data-name="${esc(o.name)}"${on ? ' checked' : ''}${lock ? ' disabled' : ''}> ${esc(o.name)} <span class="faint small">${esc(o.kyo)} · ${o.credit}학점</span>${why ? `<span class="why">${why}</span>` : ''}<button type="button" class="btn btn-ghost btn-sm info" data-info="${esc(o.name)}">설명</button></label>`;
      }).join('')}</div>
      <div class="row"><button type="button" class="btn btn-primary btn-sm" data-close>닫기</button></div>`;
    const r = td.getBoundingClientRect(); const base = view.getBoundingClientRect();
    p.style.left = `${Math.max(0, Math.min(r.left - base.left, base.width - 390))}px`;
    p.style.top = `${r.bottom - base.top + 6}px`;
    view.style.position = 'relative';
    view.appendChild(p);
    const close = () => { st.open = null; p.remove(); dropOff(); };
    const off = e => { if (!p.isConnected) { dropOff(); return; } if (!p.contains(e.target) && !e.target.closest('td[data-slot]') && !e.target.closest('#subj-modal')) close(); };
    offRef = off;
    setTimeout(() => { if (offRef === off) document.addEventListener('mousedown', off); });
    p.querySelector('[data-close]').addEventListener('click', close);
    p.querySelectorAll('input[data-name]').forEach(cb => cb.addEventListener('change', () => {
      const all = get(pickKey()) || {};
      const list = (all[s.id] || []).filter(n => n !== cb.dataset.name);
      if (cb.checked) list.push(cb.dataset.name);
      all[s.id] = list;
      set(pickKey(), S.cleanPicks(sum.slots, all));
      const top = p.scrollTop; // 다시 그린 뒤에도 팝오버 목록 위치를 지킨다
      render();
      const np = document.querySelector('#view .popover.pick');
      if (np) np.scrollTop = top;
    }));
    p.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); showSubject(b.dataset.info); }));
  }

  // ---------- 과목 정보 ----------
  function showSubject(name) {
    const m = document.getElementById('subj-modal');
    const s = S.findSubject(STUDENT_SUBJECTS, name);
    m.innerHTML = `<div class="sheet"><div class="card-head" style="margin:0"><h2>${esc(name)}</h2><div class="right"><button type="button" class="btn btn-primary btn-sm" data-close>닫기</button></div></div>
      ${s ? `<img src="${esc(s.img)}" alt="${esc(s.name)} 과목 안내 쪽"><p class="hint">출처: 2022 개정 교육과정 고등학교 과목개설 안내서 ${s.page}쪽(PDF 기준)</p>` : '<p>이 과목은 안내서에 설명이 없습니다.</p>'}</div>`;
    m.hidden = false;
    const close = () => { m.hidden = true; m.innerHTML = ''; };
    m.querySelector('[data-close]').addEventListener('click', close);
  }
  document.getElementById('subj-modal').addEventListener('click', e => { const m = e.currentTarget; if (e.target === m) { m.hidden = true; m.innerHTML = ''; } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = document.getElementById('subj-modal'); if (!m.hidden) { m.hidden = true; m.innerHTML = ''; } } });

  function subjectsHtml() {
    const q = U.compact(st.q);
    const list = STUDENT_SUBJECTS.filter(s => !q || U.compact(s.name).includes(q));
    const groups = new Map();
    for (const s of list) { const k = s.kyo || '기타'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    return [...groups.entries()].map(([k, arr]) => `<div class="subj-group"><h3>${esc(k)}</h3><div class="subj-list">${arr.map(s => `<button type="button" class="subj-item" data-name="${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div></div>`).join('') || '<p class="hint">찾는 과목이 없습니다.</p>';
  }
  function renderSubjects(view) {
    view.innerHTML = `<div class="page-head"><div><h1>과목 정보 찾기</h1><p class="desc">2022 개정 교육과정 보통 교과 과목 ${STUDENT_SUBJECTS.length}개 · 과목을 누르면 안내서 쪽이 열립니다</p></div></div>
      <section class="card"><input type="search" id="subj-q" class="search-input" placeholder="과목명 검색 (예: 물리학, 세계사)" value="${esc(st.q)}" style="width:100%;padding:9px 12px;border:1px solid var(--line-strong);border-radius:10px">
      <div id="subj-results">${subjectsHtml()}</div>
      <p class="hint">출처: 2022 개정 교육과정 고등학교 과목개설 안내서</p></section>`;
    const results = view.querySelector('#subj-results');
    // 입력칸은 다시 그리지 않고 결과만 바꾼다(한글 조합이 끊기지 않게)
    results.addEventListener('click', e => { const b = e.target.closest('.subj-item'); if (b) showSubject(b.dataset.name); });
    view.querySelector('#subj-q').addEventListener('input', e => { st.q = e.target.value; results.innerHTML = subjectsHtml(); });
  }

  // ---------- 진로 ----------
  function majorsHtml() {
    const q = st.mq.trim();
    return STUDENT_MAJORS.filter(m => !q || m.name.includes(q)).map(m => `<a class="subj-item" href="https://www.career.go.kr/cloud/w/major/uView?seq=${encodeURIComponent(m.seq)}" target="_blank" rel="noopener">${esc(m.name)}</a>`).join('') || '<p class="hint">찾는 학과가 없습니다.</p>';
  }
  function renderCareer(view) {
    view.innerHTML = `<div class="page-head"><div><h1>진로별 선택과목 정보</h1><p class="desc">커리어넷(진로정보망) 학과 정보로 연결합니다</p></div></div>
      <div class="notice warn">대학·학과마다 요구하는 선택과목 이수 기준이 다릅니다. 지원하려는 대학의 입학 요강을 꼭 직접 확인하세요.</div>
      <section class="card"><input type="search" id="major-q" placeholder="학과명 검색 (예: 물리학, 컴퓨터공학)" value="${esc(st.mq)}" style="width:100%;padding:9px 12px;border:1px solid var(--line-strong);border-radius:10px">
      <div class="subj-list" id="major-results" style="margin-top:12px">${majorsHtml()}</div></section>`;
    const results = view.querySelector('#major-results');
    view.querySelector('#major-q').addEventListener('input', e => { st.mq = e.target.value; results.innerHTML = majorsHtml(); });
  }

  function render() {
    renderNav();
    dropOff();
    const view = document.getElementById('view');
    const scroll = view.querySelector('[data-keep-scroll]');
    const sl = scroll ? [scroll.scrollLeft, scroll.scrollTop] : null;
    try {
      if (st.tab === 'credits') (st.pkg ? renderCredits : renderNoLink)(view);
      else if (st.tab === 'subjects') renderSubjects(view);
      else renderCareer(view);
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="notice err">화면을 그리다 문제가 생겼습니다: ${esc(e.message)}</div>`;
    }
    const after = view.querySelector('[data-keep-scroll]');
    if (after && sl) { after.scrollLeft = sl[0]; after.scrollTop = sl[1]; }
  }

  const app = document.querySelector('.app');
  document.getElementById('collapse').addEventListener('click', () => app.classList.toggle('collapsed'));
  if (window.matchMedia('(max-width: 900px)').matches) app.classList.add('collapsed');
  window.addEventListener('hashchange', () => location.reload());
  document.title = school() ? `${school()} 수강신청 도우미` : '수강신청 도우미';
  render();
})();
