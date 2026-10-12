/* global EduShell, EduUtil, EduDerive, EduTable, OrgLogic, OrgExcel, ORG_TEMPLATE_B64, ExcelJS */
// 교원조직 시수 산출 탭: 엑셀 1번 표와 같은 모양(표시과목 가로, 정원·현원·학기별 시수 세로)
(function () {
  const U = EduUtil;
  const D = EduDerive;
  const L = OrgLogic;
  const T = EduTable;
  const { esc } = U;

  const GROUPS = L.GROUPS;

  const staffYear = D.staffYear;
  const semTotal = (grid, s, col) => [1, 2, 3].reduce((a, g) => a + grid[`${s}-${g}`][col], 0);
  function avg(total, staff) {
    const n = Number(staff);
    return n > 0 && total ? Math.round((total / n) * 100) / 100 : '';
  }

  function resultTable(st, res) {
    const showAll = st.ui.showAllCols;
    const used = c => showAll || ['1', '2'].some(s => semTotal(res.grid, s, c)) || !U.isBlank(st.staff.정원[c]) || !U.isBlank(st.staff.현원[c]);
    const groups = GROUPS.map(([g, cols]) => [g, cols.filter(used)]).filter(([, cols]) => cols.length);
    const cols = groups.flatMap(([, c]) => c);
    if (!cols.length) return '<div class="empty-state"><div class="big">아직 계산할 시수가 없습니다</div>사전 작업에서 편제와 학급 수를 넣어 주세요.</div>';
    const head1 = groups.map(([g, c]) => (c.length === 1 && c[0] === g
      ? `<th rowspan="2" class="grp">${esc(g)}</th>`
      : `<th colspan="${c.length}" class="grp">${esc(g)}</th>`)).join('');
    const head2 = groups.filter(([g, c]) => !(c.length === 1 && c[0] === g)).flatMap(([, c]) => c).map(c => `<th>${esc(c)}</th>`).join('');
    const staffSum = kind => cols.reduce((a, c) => a + (Number(st.staff[kind][c]) || 0), 0);
    // 정원은 여기서도 고칠 수 있다(사전 작업 → 기본 설정과 같은 값). 현원은 보기만.
    const staffRow = kind => `<tr><td colspan="3" class="rh l">${staffYear(st, kind)} ${kind}</td>
      ${cols.map(c => (kind === '정원' ? T.editCell({ key: `staff|${kind}|${c}`, value: st.staff[kind][c] ?? '', placeholder: '' }) : T.numCell(st.staff[kind][c]))).join('')}<td class="b">${staffSum(kind) || ''}</td></tr>`;
    let body = staffRow('정원') + staffRow('현원');
    const quota = staffSum('정원');
    ['1', '2'].forEach((s, si) => {
      const sum = Object.fromEntries(cols.map(c => [c, 0]));
      [1, 2, 3].forEach((g, gi) => {
        const r = res.grid[`${s}-${g}`];
        cols.forEach(c => { sum[c] += r[c]; });
        const tot = L.COLUMN_NAMES.reduce((a, c) => a + r[c], 0);
        const lead = (si === 0 && gi === 0 ? `<td rowspan="10" class="rh">${st.planYear}<br>학년도<br>주당<br>시수</td>` : '') + (gi === 0 ? `<td rowspan="5" class="rh">${s}학기</td>` : '');
        body += `<tr>${lead}<td class="rh${g}">${g}학년</td>${cols.map(c => T.numCell(r[c], `c${g}`)).join('')}<td class="b c${g}">${tot || ''}</td></tr>`;
      });
      const all = L.COLUMN_NAMES.reduce((a, c) => a + semTotal(res.grid, s, c), 0);
      body += `<tr class="sum"><td>계</td>${cols.map(c => `<td>${sum[c] || ''}</td>`).join('')}<td>${all || ''}</td></tr>`;
      body += `<tr class="avg"><td class="rh">1인 평균</td>${cols.map(c => `<td>${avg(sum[c], st.staff.정원[c])}</td>`).join('')}<td>${avg(all, quota)}</td></tr>`;
    });
    return `<div class="table-wrap" data-keep-scroll="org"><table class="grid org">
      <thead><tr><th colspan="3" rowspan="2">구분</th>${head1}<th rowspan="2">계</th></tr><tr>${head2}</tr></thead>
      <tbody>${body}</tbody></table></div>`;
  }

  function inputsPanel(st, res) {
    const g = st.ui.orgGrade || 1;
    const year = D.gradeYear(st, g);
    const cur = D.cohortFor(st, g);
    const seg = `<div class="seg">${[1, 2, 3].map(x => `<button type="button" class="${x === g ? 'on' : ''}" data-org-grade="${x}">${x}학년</button>`).join('')}</div>`;
    if (!cur) return { seg, html: `<p class="hint">${year}학년도 입학생 편제가 없습니다. 사전 작업에서 올리거나 편제표 탭에서 작성해 주세요.</p>` };
    const n = Number(st.classes[g]) || 0;
    const items = D.itemsFor(st, g);
    const counts = D.sectionCounts(st);
    const has = k => U.has(counts, k);
    let html = `<p class="hint" style="margin-top:0">${esc(cur.title || '')} · 학급 수 <b>${n || '미입력'}</b></p>`;
    const colOf = it => L.columnFor(it.name, it.kyo, st.overrides) || '<span class="badge warn">미배정</span>';

    const tech = items.filter(i => i.kind === 'tech');
    if (tech.length) {
      html += `<h3>기술·가정 <small>기술 교사와 가정 교사가 맡는 주당시수를 직접 넣으세요.</small></h3><div class="table-wrap"><table class="grid"><thead><tr><th>학기</th><th class="l">과목</th><th>편성단위</th><th>기술 시수</th><th>가정 시수</th><th class="l">참고</th></tr></thead><tbody>`;
      for (const it of tech) {
        const k = L.itemKey(year, it);
        const t = st.tech[k] || {};
        const ref = it.pair ? it.credit * L.defaultCrossClasses(it, n) : it.credit * n;
        html += `<tr><td>${it.sem}학기</td><td class="l">${esc(it.name)}${it.pair ? ` <span class="faint small">(${esc(it.pair.join('↔'))})</span>` : ''}</td><td>${it.credit}</td>
          ${T.editCell({ key: `tech|${k}|기술`, value: t['기술'] ?? '' })}${T.editCell({ key: `tech|${k}|가정`, value: t['가정'] ?? '' })}<td class="l small muted">합계 예상 ${ref || '-'}시간</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    // 개설 반 수 직접 입력 과목(체육·예술·기술가정·정보·제2외국어·한문, 기술·가정 과목 자체는 시수 입력)
    const isInput = it => it.kind !== 'tech' && L.isSectionInputKyo(it.kyo);
    const autoCounts = D.autoSectionCounts(st);
    const autoSec = it => {
      const k = L.itemKey(year, it);
      if (U.has(autoCounts, k)) return autoCounts[k];
      if (it.kind === 'fixed') return n;
      if (it.kind === 'cross') return L.defaultCrossClasses(it, n);
      return 0;
    };
    const inputItems = items.filter(isInput);
    if (inputItems.length) {
      const byName = new Map();
      for (const it of inputItems) {
        if (!byName.has(it.name)) byName.set(it.name, { name: it.name, kyo: it.kyo, sems: {} });
        byName.get(it.name).sems[it.sem] = it;
      }
      html += `<h3>개설 반 수 <small>체육·예술·기술가정·정보·제2외국어·한문 과목은 학기마다 개설 반 수를 넣으면 편성단위 × 반 수로 계산합니다. 비우면 흐린 자동값(반 배정 자료, 없으면 학급 수)을 씁니다.</small></h3>
      <div class="table-wrap"><table class="grid"><thead><tr><th>교과</th><th class="l">과목</th><th>편성단위</th><th>1학기 반 수</th><th>2학기 반 수</th><th>주당시수 (1학기 / 2학기)</th><th>표시과목</th></tr></thead><tbody>`;
      for (const r of byName.values()) {
        const any = r.sems['1'] || r.sems['2'];
        const cell = s => {
          const it = r.sems[s];
          if (!it) return '<td class="z">-</td>';
          const k = L.itemKey(year, it);
          const v = st.sectionsInput[k];
          return T.editCell({ key: `sec|${k}`, value: v ?? '', edited: !U.isBlank(v), placeholder: autoSec(it), title: '개설 반 수. 비우면 자동값' });
        };
        const hours = s => { const it = r.sems[s]; if (!it) return '-'; const k = L.itemKey(year, it); const v = st.sectionsInput[k]; return it.credit * (U.isBlank(v) ? autoSec(it) : Number(v)); };
        const credits = [...new Set(['1', '2'].filter(s => r.sems[s]).map(s => r.sems[s].credit))].join('/');
        html += `<tr><td>${esc(any.kyo)}</td><td class="l">${esc(r.name)}${any.pair ? ` <span class="faint small">(${esc(any.pair.join('↔'))})</span>` : ''}</td><td class="b">${credits}</td>${cell('1')}${cell('2')}<td>${hours('1')} / ${hours('2')}</td><td>${colOf(any)}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    const fixed = items.filter(i => i.kind === 'fixed' && !isInput(i));
    const fixedSec = it => (has(L.itemKey(year, it)) ? counts[L.itemKey(year, it)] : n);
    if (fixed.length && g === L.FIXED_INPUT_GRADE) {
      html += `<h3>전원 이수 과목 <small>3학년은 주당시수를 직접 넣을 수 있습니다. 비우면 편성단위 × 반 수(반 배정 자료에 있으면 그 반 수)입니다.</small></h3><div class="table-wrap"><table class="grid"><thead><tr><th>학기</th><th>교과</th><th class="l">과목</th><th>편성단위</th><th>반 수</th><th>주당시수</th><th>표시과목</th></tr></thead><tbody>`;
      for (const it of fixed) {
        const k = L.itemKey(year, it);
        const v = st.fixedHours[k];
        html += `<tr><td>${it.sem}학기</td><td>${esc(it.kyo)}</td><td class="l">${esc(it.name)}${has(k) ? ' <span class="badge info">반 배정</span>' : ''}</td><td>${it.credit}</td><td>${fixedSec(it)}</td>
          ${T.editCell({ key: `fix|${k}`, value: v ?? '', edited: !U.isBlank(v), placeholder: it.credit * fixedSec(it) })}<td>${colOf(it)}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    const sel = items.filter(i => (i.kind === 'group' || i.kind === 'cross') && !isInput(i));
    if (sel.length) {
      html += `<h3>선택·교차이수 과목 <small>반 수는 사전 작업의 반 배정 자료에서 셉니다. 교차이수는 자료에 없으면 학급 수의 절반.</small></h3><div class="table-wrap"><table class="grid"><thead><tr><th>학기</th><th class="l">과목</th><th>편성단위</th><th>반 수</th><th>근거</th><th>주당시수</th><th>표시과목</th></tr></thead><tbody>`;
      for (const it of sel) {
        const k = L.itemKey(year, it);
        const from = has(k);
        const sec = from ? counts[k] : it.kind === 'cross' ? L.defaultCrossClasses(it, n) : 0;
        html += `<tr><td>${it.sem}학기</td><td class="l">${esc(it.name)}</td><td>${it.credit}</td><td class="b">${sec}</td><td class="small muted">${from ? '반 배정' : it.kind === 'cross' ? '학급 수 ÷ 2' : '자료 없음'}</td>${T.numCell(it.credit * sec)}<td>${colOf(it)}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    if (fixed.length && g !== L.FIXED_INPUT_GRADE) {
      const sum = fixed.reduce((a, it) => a + it.credit * fixedSec(it), 0);
      html += `<details class="fold"><summary>전원 이수 과목 ${fixed.length}개 · 학점 × 학급 수 (합계 ${sum}시간)</summary><div class="fold-body"><div class="table-wrap"><table class="grid"><thead><tr><th>학기</th><th>교과</th><th class="l">과목</th><th>편성단위</th><th>반 수</th><th>주당시수</th><th>표시과목</th></tr></thead><tbody>
        ${fixed.map(it => `<tr><td>${it.sem}학기</td><td>${esc(it.kyo)}</td><td class="l">${esc(it.name)}</td><td>${it.credit}</td><td>${fixedSec(it)}</td>${T.numCell(it.credit * fixedSec(it))}<td>${colOf(it)}</td></tr>`).join('')}</tbody></table></div></div></details>`;
    }
    void res;
    return { seg, html };
  }

  function notesOf(st, res) {
    const notes = [...res.notes];
    for (const g of [1, 2, 3]) {
      const year = D.gradeYear(st, g);
      if (!D.cohortFor(st, g)) { notes.push(`${g}학년(${year}학년도 입학생) 편제가 없어 ${g}학년 시수는 0으로 나옵니다.`); continue; }
      if (!(Number(st.classes[g]) > 0)) notes.push(`${g}학년 학급 수를 넣지 않아 전원 이수 과목 시수가 0으로 나옵니다.`);
      for (const s of ['1', '2']) {
        const needs = D.itemsFor(st, g, s).some(i => i.kind === 'group');
        if (needs && !st.assignments[`${g}-${s}`]) notes.push(`${g}학년 ${s}학기 반 배정 자료가 없어 선택과목 시수가 0으로 나옵니다.`);
      }
    }
    return notes;
  }

  async function download(ctx, btn) {
    const st = ctx.store.state;
    if (!window.ExcelJS) { ctx.toast('엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error'); return; }
    btn.disabled = true;
    try {
      const res = D.orgCompute(st);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(OrgExcel.base64ToBytes(ORG_TEMPLATE_B64));
      OrgExcel.fillWorkbook(wb, { planYear: st.planYear, grid: res.grid, columns: L.COLUMNS, staff: st.staff, staffYears: { 정원: staffYear(st, '정원'), 현원: staffYear(st, '현원') } });
      const buf = await wb.xlsx.writeBuffer();
      U.downloadBlob(new Blob([buf], { type: U.XLSX_TYPE }), `${st.planYear}학년도 교원 조직 시수(자동 산출).xlsx`);
    } catch (e) { ctx.toast('엑셀을 만들지 못했습니다: ' + e.message, 'error'); }
    btn.disabled = false;
  }

  function render(el, ctx) {
    const st = ctx.store.state;
    const res = D.orgCompute(st);
    const notes = notesOf(st, res);
    const panel = inputsPanel(st, res);
    el.innerHTML = `<div class="page-head"><div><h1>교원조직 시수 산출</h1><p class="desc">${st.planYear}학년도 · 표시과목별 주당시수 · 교육청 "과목별 교원 조직 계획표" 1번 표 양식</p></div>
      <div class="actions"><label class="check"><input type="checkbox" id="show-all"${st.ui.showAllCols ? ' checked' : ''}> 시수가 없는 표시과목도 보기</label>
      <button type="button" class="btn btn-primary" id="dl-org">${ctx.icon('download')}엑셀 내려받기</button></div></div>
      <section class="card"><div class="card-head"><h2>표시과목별 주당시수</h2><div class="right"><span class="hint" style="margin:0">정원 칸은 바로 고칠 수 있고 1인 평균이 다시 계산됩니다 · 현원은 <button type="button" class="link" data-go="prep">사전 작업 → 기본 설정</button>에서 입력 · 1인 평균 = 학기 계 ÷ 정원</span></div></div>${resultTable(st, res)}
      ${notes.length ? `<div class="notice warn" style="margin-top:12px"><div><b>비고</b><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div></div>` : ''}</section>
      <section class="card"><div class="card-head"><h2>학년별 입력</h2><div class="right">${panel.seg}</div></div>${panel.html}</section>`;
    el.querySelector('#dl-org').addEventListener('click', e => download(ctx, e.currentTarget));
    el.querySelector('#show-all').addEventListener('change', e => ctx.store.update(s => { s.ui.showAllCols = e.target.checked; }));
    el.querySelectorAll('[data-org-grade]').forEach(b => b.addEventListener('click', () => ctx.store.update(s => { s.ui.orgGrade = Number(b.dataset.orgGrade); })));
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => ctx.go(b.dataset.go)));
    // 키 모양: staff|정원|국어 / tech|<과목 키>|기술 / fix|<과목 키> / sec|<과목 키> (과목 키 안에도 | 가 있다)
    const parse = key => {
      const kind = key.slice(0, key.indexOf('|'));
      const rest = key.slice(kind.length + 1);
      if (kind === 'staff' || kind === 'tech') {
        const cut = kind === 'staff' ? rest.indexOf('|') : rest.lastIndexOf('|');
        return { kind, a: rest.slice(0, cut), b: rest.slice(cut + 1) };
      }
      return { kind, a: rest };
    };
    T.bindEdits(el, {
      onEdit(key, raw) {
        const v = U.toNumOrBlank(raw);
        const { kind, a, b } = parse(key);
        ctx.store.update(s => {
          if (kind === 'staff') { if (v === '') delete s.staff[a][b]; else s.staff[a][b] = v; }
          if (kind === 'tech') { const t = s.tech[a] || (s.tech[a] = {}); if (v === '') delete t[b]; else t[b] = v; }
          if (kind === 'fix') { if (v === '') delete s.fixedHours[a]; else s.fixedHours[a] = v; }
          if (kind === 'sec') { if (v === '') delete s.sectionsInput[a]; else s.sectionsInput[a] = v; }
        });
      },
      onReset(key) {
        const { kind, a } = parse(key);
        if (kind === 'fix') ctx.store.update(s => { delete s.fixedHours[a]; });
        if (kind === 'sec') ctx.store.update(s => { delete s.sectionsInput[a]; });
      },
    });
  }

  EduShell.register({
    id: 'orgplan', group: 'out', label: '교원조직 시수',
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
