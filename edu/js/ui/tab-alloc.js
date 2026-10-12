/* global EduShell, EduUtil, EduDerive, EduMapping, EduTable, EduAllocXlsx, EduStatsXlsx, ExcelJS */
// 교과별 수업시수 배당표 탭: 학기·교과를 골라 과목 × 반·세트 시수를 보고 고친 뒤 엑셀 3종으로 내려받는다
(function () {
  const U = EduUtil;
  const D = EduDerive;
  const T = EduTable;
  const { esc } = U;
  const NOTES = '__notes';
  const STATS = '__stats';

  function sheetTable(st, alloc, sem, sheet) {
    const cols = alloc.columns;
    const rows = alloc.sheets[sheet] || [];
    if (!rows.length) return `<div class="empty-state"><div class="big">${esc(sheet)} 교과에 배정된 과목이 없습니다</div>사전 작업의 과목 배정에서 교과 시트를 바꿀 수 있습니다.</div>`;
    const groups = [1, 2, 3].map(g => [g, cols.filter(c => c.grade === g)]).filter(([, c]) => c.length);
    const head1 = groups.map(([g, c]) => `<th colspan="${c.length}" class="g${g} gs">${g}학년</th>`).join('');
    const head2 = cols.map((c, i) => `<th class="h${c.grade}${i === 0 || cols[i - 1].grade !== c.grade ? ' gs' : ''}" title="${c.kind === 'set' ? `${c.label}세트` : c.kind === 'all' ? '전원 이수(전체 학급)' : `${c.label}반`}">${esc(c.label)}</th>`).join('');
    const body = rows.map((r, k) => {
      const cells = cols.map((c, i) => {
        const gs = i === 0 || cols[i - 1].grade !== c.grade ? ' gs' : '';
        return T.editCell({ key: `cell|${sem}|${sheet}|${U.norm(r.name)}|${c.key}`, value: r.cells[c.key] ?? '', edited: !!(r.edited && r.edited[c.key]), cls: `c${c.grade}${gs}` });
      }).join('');
      const short = st.alloc.short[r.name] ?? '';
      return `<tr><td>${k + 1}</td><td class="l b">${esc(r.name)}</td>${T.editCell({ key: `short|${r.name}`, value: short, type: 'text', align: 'left', width: 70, title: '단축과목명(시간표용)을 적을 수 있습니다' })}<td class="b">${r.total || ''}</td>${cells}</tr>`;
    }).join('');
    const sums = cols.map((c, i) => {
      const v = rows.reduce((a, r) => a + (Number(r.cells[c.key]) || 0), 0);
      return `<td class="${i === 0 || cols[i - 1].grade !== c.grade ? 'gs' : ''}">${v || ''}</td>`;
    }).join('');
    const total = rows.reduce((a, r) => a + r.total, 0);
    return `<div class="table-wrap" data-keep-scroll="alloc"><table class="grid sticky-first alloc">
      <thead><tr><th rowspan="2">순번</th><th rowspan="2" class="l">정식과목명</th><th rowspan="2" class="l">단축과목명</th><th rowspan="2">시수</th>${head1}</tr><tr>${head2}</tr></thead>
      <tbody>${body}<tr class="sum"><td colspan="3">합계</td><td>${total}</td>${sums}</tr></tbody></table></div>`;
  }

  function notesView(st) {
    const notice = st.alloc.notice ?? EduAllocXlsx.DEFAULT_NOTICE;
    const refs = st.alloc.refRows && st.alloc.refRows.length ? st.alloc.refRows : [['', '']];
    return `<div class="card-head"><h2>시수배당 시 유의사항</h2><div class="right"><button type="button" class="btn btn-plain btn-sm" id="notice-reset">기본 문구로</button></div></div>
      <textarea id="notice" data-focus-key="notice" rows="8">${esc(notice)}</textarea>
      <p class="hint">엑셀의 첫 시트 "시수배당 시 유의사항"에 줄마다 들어갑니다.</p>
      <div class="card-head" style="margin-top:18px"><h2>참고사항</h2><div class="right"><button type="button" class="btn btn-ghost btn-sm" id="ref-add">+ 줄</button></div></div>
      <div class="table-wrap"><table class="grid"><thead><tr><th>순번</th><th class="l">이름</th><th class="l">내용</th><th></th></tr></thead><tbody>
      ${refs.map((r, i) => `<tr><td>${i + 1}</td>${T.editCell({ key: `ref|${i}|0`, value: r[0], type: 'text', align: 'left', width: 140 })}${T.editCell({ key: `ref|${i}|1`, value: r[1], type: 'text', align: 'left', width: 420 })}<td><button type="button" class="btn btn-plain btn-sm" data-ref-del="${i}">삭제</button></td></tr>`).join('')}
      </tbody></table></div><p class="hint">예: 강사 수업 가능 시간, 동아리 인솔로 빠지는 시간 등. 엑셀의 "참고사항" 시트에 들어갑니다.</p>`;
  }

  // 공유용 통계 미리보기: 교과마다 학기별 과목·시수·개설반 수
  function statsView(st) {
    const stats = EduStatsXlsx.collect({ 1: D.allocFor(st, '1'), 2: D.allocFor(st, '2') });
    const sum = rows => rows.reduce((a, r) => a + r.hours, 0);
    const entries = Object.entries(stats);
    if (!entries.length) return '<div class="empty-state"><div class="big">아직 통계로 낼 시수가 없습니다</div>사전 작업을 먼저 채워 주세요.</div>';
    const semTable = (rows, s) => `<table class="grid"><thead><tr><th colspan="4" class="l">${s}학기</th></tr><tr><th>순번</th><th class="l">정식과목명</th><th>시수</th><th>개설반 수</th></tr></thead><tbody>
      ${rows.map((r, k) => `<tr><td>${k + 1}</td><td class="l">${esc(r.name)}</td><td>${r.hours}</td><td>${r.sections ?? ''}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">없음</td></tr>'}
      <tr class="sum"><td colspan="2">합계</td><td>${sum(rows)}</td><td></td></tr></tbody></table>`;
    return `<div class="card-head"><h2>교과별 수업 시수 통계 (공유용)</h2><div class="right"><button type="button" class="btn btn-primary btn-sm" data-dl="stats">통계 엑셀 내려받기</button></div></div>
      <p class="hint">교과 선생님들과 나눌 요약입니다. 배당표에서 고친 값이 그대로 들어가고, 개설반 수는 시수 ÷ 학점입니다. 엑셀은 첫 시트에 교과별 합계, 이어서 교과마다 시트 하나입니다.</p>
      <div class="stats-grid">${entries.map(([sheet, bySem]) => `<div class="stats-card"><div class="stats-title">${esc(sheet)}과 <span class="hint" style="margin:0">1학기 ${sum(bySem['1'])} · 2학기 ${sum(bySem['2'])}</span></div>
      <div class="stats-sems">${['1', '2'].map(s => `<div class="table-wrap">${semTable(bySem[s], s)}</div>`).join('')}</div></div>`).join('')}</div>`;
  }

  function render(el, ctx) {
    const st = ctx.store.state;
    const sem = st.ui.allocSem || '1';
    const sheet = st.ui.allocSheet || '국어';
    const alloc = D.allocFor(st, sem);
    const dl = [['1', '1학기'], ['2', '2학기'], ['12', '1·2학기 합본'], ['stats', '공유용 통계']].map(([k, label], i) => `<button type="button" class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}" data-dl="${k}">${i === 0 ? ctx.icon('download') : ''}${label}</button>`).join('');
    const chips = EduMapping.SHEETS.map(s => {
      const n = (alloc.sheets[s] || []).length;
      return `<button type="button" class="chip${s === sheet ? ' on' : ''}" data-sheet="${esc(s)}">${esc(s)}<span class="n">${n || ''}</span></button>`;
    }).join('') + `<button type="button" class="chip${sheet === NOTES ? ' on' : ''}" data-sheet="${NOTES}">유의사항·참고사항</button>`
      + `<button type="button" class="chip${sheet === STATS ? ' on' : ''}" data-sheet="${STATS}">공유용 통계</button>`;
    const missing = [1, 2, 3].filter(g => !D.cohortFor(st, g)).map(g => `${g}학년 편제`);
    const noAssign = D.ASSIGN_KEYS.filter(k => k[2] === sem && !st.assignments[k]).map(k => `${k[0]}학년 ${sem}학기 반 배정 자료`);
    const warn = [...missing, ...noAssign];
    el.innerHTML = `<div class="page-head"><div><h1>교과별 수업시수 배당표</h1><p class="desc">${st.planYear}학년도 · 교과마다 과목 × 반·세트 시수 · 칸 값 = 학점 × 그 세트의 반 수 · 교사명 칸은 엑셀에서 교과가 채웁니다</p></div>
      <div class="actions">${dl}</div></div>
      <div class="toolbar"><div class="seg">${['1', '2'].map(s => `<button type="button" class="${s === sem ? 'on' : ''}" data-sem="${s}">${s}학기</button>`).join('')}</div><span class="sep"></span><div class="chips">${chips}</div></div>
      ${warn.length ? `<div class="notice warn">빈칸이 생길 수 있습니다. 사전 작업에서 넣어 주세요: ${esc(warn.join(', '))}</div>` : ''}
      ${alloc.unassigned.length ? `<div class="notice warn"><div>교과 시트를 정하지 못해 배당표에서 빠진 과목: ${alloc.unassigned.map(u => `${u.grade}학년 ${esc(u.name)}(${u.hours}시간)`).join(', ')} · <button type="button" class="link" data-go="prep">사전 작업 → 과목 배정</button></div></div>` : ''}
      <section class="card" style="padding:14px">${sheet === NOTES ? notesView(st) : sheet === STATS ? statsView(st) : `<div class="card-head"><h2>${esc(sheet)}과 · ${sem}학기</h2><div class="right"><span class="hint" style="margin:0">숫자 칸은 바로 고칠 수 있습니다 · 고친 칸은 노란 점</span></div></div>${sheetTable(st, alloc, sem, sheet)}`}</section>`;
    bind(el, ctx);
  }

  function bind(el, ctx) {
    const up = (fn, opts) => ctx.store.update(fn, opts);
    el.querySelectorAll('[data-sem]').forEach(b => b.addEventListener('click', () => up(s => { s.ui.allocSem = b.dataset.sem; })));
    el.querySelectorAll('[data-sheet]').forEach(b => b.addEventListener('click', () => up(s => { s.ui.allocSheet = b.dataset.sheet; })));
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => ctx.go(b.dataset.go)));
    el.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => download(ctx, b.dataset.dl, b)));
    const notice = el.querySelector('#notice');
    if (notice) notice.addEventListener('change', () => up(s => { s.alloc.notice = notice.value; }));
    const nr = el.querySelector('#notice-reset');
    if (nr) nr.addEventListener('click', () => up(s => { s.alloc.notice = null; }));
    const ra = el.querySelector('#ref-add');
    if (ra) ra.addEventListener('click', () => up(s => { s.alloc.refRows = [...(s.alloc.refRows && s.alloc.refRows.length ? s.alloc.refRows : [['', '']]), ['', '']]; }));
    el.querySelectorAll('[data-ref-del]').forEach(b => b.addEventListener('click', () => up(s => { s.alloc.refRows = (s.alloc.refRows || []).filter((_, i) => i !== Number(b.dataset.refDel)); })));
    T.bindEdits(el, {
      onEdit(key, raw) {
        const parts = key.split('|');
        const kind = parts[0];
        up(s => {
          if (kind === 'short') { const v = String(raw).trim(); if (v) s.alloc.short[parts[1]] = v; else delete s.alloc.short[parts[1]]; return; }
          if (kind === 'ref') {
            const rows = s.alloc.refRows && s.alloc.refRows.length ? s.alloc.refRows : [['', '']];
            rows[Number(parts[1])][Number(parts[2])] = String(raw);
            s.alloc.refRows = rows;
            return;
          }
          if (kind === 'cell') {
            const [, sem, sheet, name, col] = parts;
            const ek = `${sem}|${sheet}|${name}|${col}`;
            const row = (D.allocFor(s, sem).sheets[sheet] || []).find(r => U.norm(r.name) === name);
            const auto = row ? row.auto[col] : undefined;
            const v = U.toNumOrBlank(raw);
            if ((v === '' && (auto === undefined || auto === 0)) || v === auto) delete s.alloc.edits[ek];
            else s.alloc.edits[ek] = v;
          }
        });
      },
      onReset(key) {
        const [kind, sem, sheet, name, col] = key.split('|');
        if (kind === 'cell') up(s => { delete s.alloc.edits[`${sem}|${sheet}|${name}|${col}`]; });
      },
    });
  }

  async function download(ctx, which, btn) {
    const st = ctx.store.state;
    if (!window.ExcelJS) { ctx.toast('엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error'); return; }
    btn.disabled = true;
    if (which === 'stats') {
      try {
        const wb = EduStatsXlsx.build(ExcelJS, { planYear: st.planYear, allocBySem: { 1: D.allocFor(st, '1'), 2: D.allocFor(st, '2') } });
        U.downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: U.XLSX_TYPE }), `${st.planYear}학년도 교과별 수업 시수 통계.xlsx`);
      } catch (e) { ctx.toast('엑셀을 만들지 못했습니다: ' + e.message, 'error'); }
      btn.disabled = false;
      return;
    }
    const sems = which === '12' ? ['1', '2'] : [which];
    try {
      const allocBySem = {}; const movingBySem = {};
      for (const s of sems) { allocBySem[s] = D.allocFor(st, s); movingBySem[s] = D.movingFor(st, s); }
      const wb = EduAllocXlsx.build(ExcelJS, { planYear: st.planYear, sems, allocBySem, movingBySem, notice: st.alloc.notice, refRows: st.alloc.refRows, short: st.alloc.short });
      const label = which === '12' ? '1·2학기' : `${which}학기`;
      U.downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: U.XLSX_TYPE }), `${st.planYear}학년도 ${label} 교과별 수업 시수 배당표.xlsx`);
    } catch (e) { ctx.toast('엑셀을 만들지 못했습니다: ' + e.message, 'error'); }
    btn.disabled = false;
  }

  EduShell.register({
    id: 'alloc', group: 'out', label: '수업시수 배당표',
    ready(ctx) {
      const st = ctx.store.state;
      const missing = [];
      if ([1, 2, 3].some(g => !D.cohortFor(st, g))) missing.push('학년별 편제');
      if ([1, 2, 3].some(g => !(Number(st.classes[g]) > 0))) missing.push('학급 수');
      if (D.ASSIGN_KEYS.some(k => !st.assignments[k])) missing.push('반 배정 자료');
      return { ok: !missing.length, missing };
    },
    render,
  });
})();
