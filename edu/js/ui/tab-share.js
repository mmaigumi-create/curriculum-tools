/* global EduShell, EduUtil, EduCurriculum, EduShareLink */
// 학생용 링크 탭: 편제를 링크 하나에 담아 학생용 수강신청 도우미로 보낸다(서버 없음)
(function () {
  const U = EduUtil;
  const C = EduCurriculum;
  const L = EduShareLink;
  const { esc } = U;
  const STUDENT_URL = 'https://mmaigumi-create.github.io/curriculum-tools/student/';
  const MAX = 3;
  const mem = { link: '', busy: false, err: '' };

  const curOf = (st, y) => (st.authored && st.authored[y]) || (st.cohorts && st.cohorts[y]) || null;
  function years(st) {
    return [...new Set([...Object.keys(st.authored || {}), ...Object.keys(st.cohorts || {})].map(Number))].filter(y => curOf(st, y) && curOf(st, y).rows.length).sort((a, b) => b - a);
  }
  function chosen(st) {
    const ys = years(st);
    return (st.share.years || []).filter(y => ys.includes(y)).slice(0, MAX);
  }
  function warnings(st) {
    const out = [];
    for (const y of chosen(st)) for (const b of curOf(st, y).blocks) {
      const w = C.blockPick(curOf(st, y), b).warn;
      if (w) out.push(`${y}학년도 입학생 · ${w}`);
    }
    return out;
  }

  function render(el, ctx) {
    const st = ctx.store.state;
    const ys = years(st);
    const sel = chosen(st);
    const warn = warnings(st);
    el.innerHTML = `<div class="page-head"><div><h1>학생용 링크</h1><p class="desc">편제를 링크 하나에 담아 학생에게 보냅니다. 학생은 링크를 열어 편제표에서 과목을 골라 학점을 확인합니다.</p></div></div>
      <section class="card"><div class="card-head"><h2>링크 만들기</h2></div>
        <div class="row" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <label>학교 이름 <input type="text" id="share-school" value="${esc(st.share.school)}" placeholder="예: ○○고등학교" style="padding:6px 10px;border:1px solid var(--line-strong);border-radius:8px"></label>
        </div>
        <p class="hint">보낼 입학년도 (최대 ${MAX}개)</p>
        ${ys.length ? `<div style="display:flex;gap:12px;flex-wrap:wrap">${ys.map(y => `<label class="check"><input type="checkbox" data-share-year="${y}"${sel.includes(y) ? ' checked' : ''}${!sel.includes(y) && sel.length >= MAX ? ' disabled' : ''}> ${y}학년도 입학생${st.authored && st.authored[y] ? ' (작성한 편제)' : ' (PDF)'}</label>`).join('')}</div>` : '<div class="notice warn">편제가 없습니다. 사전 작업에서 편제 PDF를 올리거나 편제표 탭에서 편제를 만들어 주세요.</div>'}
        ${warn.length ? `<div class="notice warn" style="margin-top:10px"><div>${warn.map(esc).join('<br>')}<br>학생 화면에서는 고를 수를 내림해서 보여 줍니다. 편제표 탭에서 묶음 학점이나 편성단위를 확인해 주세요.</div></div>` : ''}
        <div style="margin-top:12px"><button type="button" class="btn btn-primary" id="share-make"${sel.length && st.share.school.trim() && !mem.busy ? '' : ' disabled'}>링크 만들기</button>
          <span class="hint" id="share-school-hint" style="margin-left:8px"${st.share.school.trim() ? ' hidden' : ''}>학교 이름을 넣어 주세요.</span></div>
        ${mem.err ? `<div class="notice err" id="share-err" style="margin-top:10px">${esc(mem.err)}</div>` : ''}
        ${mem.link ? `<div id="share-result" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <textarea id="share-link" readonly rows="3" style="width:100%;font-size:12px;padding:8px;border:1px solid var(--line-strong);border-radius:8px">${esc(mem.link)}</textarea>
          <div style="display:flex;gap:8px"><button type="button" class="btn btn-primary btn-sm" id="share-copy">복사</button><a class="btn btn-ghost btn-sm" id="share-open" href="${esc(mem.link)}" target="_blank" rel="noopener">새 창에서 열어 보기</a><span class="hint" style="margin:0">링크 길이 ${mem.link.length}자</span></div></div>` : ''}
      </section>
      <section class="card"><div class="card-head"><h2>알아 두기</h2></div><ul class="hint" style="margin:0;padding-left:18px">
        <li>편제는 링크 안에만 담깁니다. 서버에 저장되지 않고, 학생 개인정보도 오가지 않습니다.</li>
        <li>편제를 고치면 링크를 다시 만들어 학생에게 다시 알려 주세요. 예전 링크는 예전 편제를 보여 줍니다.</li>
        <li>링크가 길어 joo.is 같은 주소 줄이기 서비스로 줄여 쓰면 편합니다.</li>
        <li>학생이 고른 과목은 학생 기기에만 저장됩니다.</li></ul></section>`;
    bind(el, ctx);
  }

  function bind(el, ctx) {
    const school = el.querySelector('#share-school');
    // 입력할 때마다 조용히 저장하고 버튼·안내만 바로 고친다(다시 그리면 입력 칸 포커스를 잃어 첫 클릭이 빠진다)
    const saveSchool = () => {
      const v = school.value.trim();
      if (v === ctx.store.state.share.school) return;
      mem.link = ''; mem.err = '';
      ctx.store.update(s => { s.share.school = v; }, { silent: true });
      const make = el.querySelector('#share-make');
      if (make) make.disabled = !(chosen(ctx.store.state).length && v && !mem.busy);
      const hint = el.querySelector('#share-school-hint');
      if (hint) hint.hidden = !!v;
      el.querySelector('#share-result')?.remove();
      el.querySelector('#share-err')?.remove();
    };
    school.addEventListener('input', saveSchool);
    school.addEventListener('change', saveSchool);
    el.querySelectorAll('[data-share-year]').forEach(cb => cb.addEventListener('change', () => {
      const y = Number(cb.dataset.shareYear);
      mem.link = '';
      ctx.store.update(s => { s.share.years = cb.checked ? [...new Set([...(s.share.years || []), y])] : (s.share.years || []).filter(v => v !== y); });
    }));
    const make = el.querySelector('#share-make');
    if (make) make.addEventListener('click', async () => {
      const st = ctx.store.state;
      mem.busy = true; mem.err = '';
      try {
        const code = await L.encode(L.pack(st.share.school, chosen(st).sort((a, b) => b - a).map(y => curOf(st, y))));
        mem.link = L.linkFor(STUDENT_URL, code);
      } catch (e) { mem.err = '링크를 만들지 못했습니다: ' + e.message; }
      mem.busy = false;
      ctx.rerender();
    });
    const copy = el.querySelector('#share-copy');
    if (copy) copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(mem.link); ctx.toast('링크를 복사했습니다.'); } catch (e) { el.querySelector('#share-link').select(); ctx.toast('복사하지 못했습니다. 링크 칸을 직접 복사해 주세요.', 'warn'); }
    });
  }

  EduShell.register({
    id: 'share', group: 'out', label: '학생용 링크', icon: 'share',
    ready(ctx) { const ok = years(ctx.store.state).length > 0; return { ok, missing: ok ? [] : ['편제(사전 작업 또는 편제표 탭)'] }; },
    render,
  });
})();
