/* global EduUtil */
// 큰 틀: 왼쪽 메뉴, 탭 전환, 준비 상태 점, 알림
(function () {
  const { esc } = EduUtil;
  const tabs = [];
  let ctx = null;

  const ICONS = {
    prep: '<path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="m9 13 2 2 4-4"/>',
    pyeonje: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 10v10"/>',
    orgplan: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.8.4 5 2.8 5 5.8"/>',
    alloc: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    moving: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    credits: '<path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v5h5"/><path d="m8.5 14 2.5 2.5 4.5-5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    chevron: '<path d="m15 18-6-6 6-6"/>',
    download: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  };
  const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

  function register(tab) { tabs.push(tab); }

  function current() {
    const id = ctx.store.state.ui.tab;
    return tabs.find(t => t.id === id) || tabs[0];
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    const st = ctx.store.state;
    const groups = [['prep', '준비'], ['out', '산출물']];
    nav.innerHTML = groups.map(([g, label]) => `<div class="nav-group">${label}</div>` + tabs.filter(t => t.group === g).map(t => {
      let extra = '';
      let title = t.label;
      if (t.badge) extra = `<span class="count">${esc(t.badge(ctx))}</span>`;
      if (t.ready) {
        const r = t.ready(ctx);
        extra = `<span class="dot${r.ok ? ' ready' : ''}"></span>`;
        title = r.ok ? `${t.label} · 만들 준비 됨` : `${t.label} · 부족한 것: ${r.missing.join(', ')}`;
      }
      return `<button type="button" class="nav-item${st.ui.tab === t.id ? ' active' : ''}" data-tab="${t.id}" title="${esc(title)}">${icon(t.icon || t.id)}<span class="label">${esc(t.label)}</span>${extra}</button>`;
    }).join('')).join('');
    nav.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
    document.getElementById('foot-year').textContent = `${st.planYear}학년도 계획`;
  }

  function go(id) {
    ctx.store.update(s => { s.ui.tab = id; }, { silent: true });
    renderAll();
    window.scrollTo({ top: 0 });
  }

  // 다시 그려도 입력 중인 칸의 커서를 지킨다
  function renderView() {
    const view = document.getElementById('view');
    const active = document.activeElement;
    const focusKey = active && active.dataset ? active.dataset.focusKey : null;
    const sel = focusKey && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    const scrolls = [...view.querySelectorAll('[data-keep-scroll]')].map(el => [el.dataset.keepScroll, el.scrollLeft, el.scrollTop]);
    const tab = current();
    try {
      tab.render(view, ctx);
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="notice err">화면을 그리다 문제가 생겼습니다: ${esc(e.message)}</div>`;
    }
    for (const [k, l, t] of scrolls) {
      const el = view.querySelector(`[data-keep-scroll="${k}"]`);
      if (el) { el.scrollLeft = l; el.scrollTop = t; }
    }
    if (focusKey) {
      const el = view.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
      if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* 숫자 칸 */ } }
    }
  }

  function renderAll() { renderNav(); renderView(); }

  // 값이 바뀐 직후(칸을 떠나는 순간)에는 다음 칸으로 포커스가 옮겨 간 뒤에 다시 그린다
  let pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; renderAll(); }, 0);
  }

  function toast(msg, kind = 'info') {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 7000 : 3800);
  }

  function setCollapsed(v) {
    document.querySelector('.app').classList.toggle('collapsed', v);
  }

  function start(c) {
    ctx = c;
    ctx.go = go;
    ctx.toast = toast;
    ctx.icon = icon;
    ctx.rerender = renderAll;
    document.getElementById('collapse').addEventListener('click', () => {
      const v = !ctx.store.state.ui.menuCollapsed;
      ctx.store.update(s => { s.ui.menuCollapsed = v; }, { silent: true });
      setCollapsed(v);
    });
    document.getElementById('reset-all').addEventListener('click', () => {
      if (confirm('넣은 자료와 고친 값을 모두 지우고 처음 상태로 돌아갈까요? 되돌릴 수 없습니다.')) { ctx.store.reset(); toast('모두 지웠습니다.'); }
    });
    const narrow = window.matchMedia('(max-width: 900px)');
    setCollapsed(ctx.store.state.ui.menuCollapsed || narrow.matches);
    narrow.addEventListener('change', e => setCollapsed(e.matches || ctx.store.state.ui.menuCollapsed));
    ctx.store.subscribe(scheduleRender);
    renderAll();
    for (const n of ctx.store.notices || []) toast(n, 'warn');
  }

  window.EduShell = { register, start, icon, toast: m => toast(m) };
})();
