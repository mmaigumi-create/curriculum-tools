/* global EduShell, EduUtil, EduCurriculum, EduPyeonjeLayout, EduTable, EduPyeonjeXlsx, EduPyeonjeHwpx, EduHwpxBase, EduPyeonjeImage, ExcelJS, JSZip */
// 편제표 탭: 새 입학생 편제를 지난 편제 복사 또는 빈 표에서 작성하고 엑셀·한글·PDF·PNG로 내려받는다
(function () {
  const U = EduUtil;
  const C = EduCurriculum;
  const Y = EduPyeonjeLayout;
  const { esc } = U;
  const STD_TOTAL = 174; // 교과 이수 학점 기준

  const selected = new Set();
  let lastClicked = null;
  let dragFrom = null;

  // ---------- 표 그리기(화면·내보내기 공용) ----------
  function cellText(v) {
    return esc(v === '' || v === null || v === undefined ? '' : v).replace(/\n/g, '<br>');
  }
  function editKey(e) {
    switch (e.kind) {
      case 'kyo': case 'gubun': return `${e.kind}|${e.from}|${e.to}`;
      case 'row': return `row|${e.idx}|${e.field}`;
      case 'sem': return `sem|${e.idx}|${e.sem}`;
      case 'cc': return `cc|${e.ccKind}|${e.key}`;
      default: return '';
    }
  }

  function tableHtml(cur, { editable }) {
    const { rows } = Y.layout(cur);
    const splits = new Set(cur.splits || []);
    const out = rows.map((line, ri) => {
      const isHead = ri < 2;
      let ctrl = '';
      if (editable) {
        if (ri === 0) ctrl = '<th rowspan="2" class="ctrl"></th>';
        else if (ri === 1) ctrl = '';
        else if (line.row !== undefined) ctrl = `<td class="handle" draggable="true" data-drag="${line.row}" title="${line.row + 1}번째 줄 · 눌러서 고르기(Shift: 여러 줄) · 끌어서 옮기기">${line.row + 1}</td>`;
        else ctrl = '<td class="handle"></td>';
      }
      const cells = line.map(c => {
        const span = `${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}${c.colspan > 1 ? ` colspan="${c.colspan}"` : ''}`;
        if (isHead) return `<th${span} class="${c.cls || ''}">${cellText(c.text)}</th>`;
        const cls = [c.cls || '', c.align === 'left' ? 'l' : ''].join(' ').trim();
        if (editable && c.edit) {
          if (c.edit.kind === 'block') return `<td${span} class="${cls}" data-pop="block|${c.edit.sem}|${c.edit.from}" title="눌러서 묶음 학점을 고치거나 묶음을 풉니다">${cellText(c.text)}</td>`;
          if (c.edit.kind === 'note') return `<td${span} class="${cls} note" data-pop="note|${c.edit.from}|${c.edit.to}" title="눌러서 비고(선택)를 고칩니다">${cellText(c.text)}</td>`;
          if (c.edit.kind === 'sec') return `<td${span} class="${cls} pop" data-pop="sec|${c.edit.from}|${c.edit.to}" title="${c.edit.from + 1}~${c.edit.to + 1}번째 줄 편성단위합 · 눌러서 구역 합치기·나누기">${cellText(c.text)}</td>`;
          const key = editKey(c.edit);
          const multi = c.edit.kind === 'row' && c.edit.field === 'names';
          return `<td${span} class="${cls} ed${multi ? ' l' : ''}"><input class="ci" type="text" data-edit="${esc(key)}" data-focus-key="${esc(key)}" value="${esc(c.text ?? '')}"${multi ? ' title="여러 과목은 쉼표로, 교차이수는 ↔ 또는 <-> 로"' : ''}></td>`;
        }
        return `<td${span} class="${cls}">${cellText(c.text)}</td>`;
      }).join('');
      const trCls = [line.row !== undefined && selected.has(line.row) ? 'selected' : '', line.row !== undefined && splits.has(line.row) ? 'split-above' : '', line.kind === 'cc' ? 'cc' : '', line.kind === 'total' || line.kind === 'grand' ? 'sum' : ''].join(' ').trim();
      return `<tr${trCls ? ` class="${trCls}"` : ''}${line.row !== undefined ? ` data-row="${line.row}"` : ''}>${ctrl}${cells}</tr>`;
    });
    return `<table class="grid pyeonje${editable ? ' editable' : ''}"><thead>${out.slice(0, 2).join('')}</thead><tbody>${out.slice(2).join('')}</tbody></table>`;
  }
  window.EduPyeonjeTable = { html: tableHtml };

  // ---------- 상태 ----------
  const yearOf = st => st.pyeonjeYear || st.planYear;
  function curOf(st) { return st.authored[yearOf(st)] || null; }
  function sources(st) {
    const y = yearOf(st);
    const list = [];
    for (const [k, c] of Object.entries(st.authored)) if (Number(k) !== y) list.push({ id: `a:${k}`, label: `${k}학년도 입학생 (작성한 편제)`, cur: c });
    for (const [k, c] of Object.entries(st.cohorts)) list.push({ id: `p:${k}`, label: `${k}학년도 입학생 (PDF${c.fileName ? ` · ${c.fileName}` : ''})`, cur: c });
    return list.sort((a, b) => b.label.localeCompare(a.label));
  }

  // 실행 취소: 입학년도마다 고치기 전 편제를 쌓아 둔다(이 화면을 연 동안만, 최대 50번)
  const UNDO_MAX = 50;
  const history = new Map();
  const undoStack = y => { if (!history.has(y)) history.set(y, []); return history.get(y); };
  function remember(s) {
    const y = yearOf(s);
    const stack = undoStack(y);
    stack.push(s.authored[y] ? U.clone(s.authored[y]) : null);
    if (stack.length > UNDO_MAX) stack.shift();
  }
  function undo(ctx) {
    const stack = undoStack(yearOf(ctx.store.state));
    if (!stack.length) return;
    const prev = stack.pop();
    selected.clear();
    ctx.store.update(s => { const y = yearOf(s); if (prev) s.authored[y] = prev; else delete s.authored[y]; });
    ctx.toast('되돌렸습니다.');
  }

  // Ctrl+Z: 편제표 화면이 떠 있고 칸에 글을 쓰는 중이 아닐 때만(칸 안에서는 브라우저 기본 되돌리기)
  let keyCtx = null;
  document.addEventListener('keydown', e => {
    if (!keyCtx || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
    if (!document.getElementById('pj-undo')) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    undo(keyCtx);
  });

  function save(ctx, fn) {
    ctx.store.update(s => {
      const y = yearOf(s);
      remember(s);
      s.authored[y] = fn(s.authored[y]);
    });
  }

  // ---------- 화면 ----------
  function startCard(st) {
    const srcs = sources(st);
    return `<section class="card"><div class="empty-state">
      <div class="big">${yearOf(st)}학년도 입학생 편제를 아직 만들지 않았습니다</div>
      지난 편제를 복사해서 바뀐 곳만 고치면 가장 빠릅니다. 사전 작업에서 올린 편제 PDF를 고를 수 있습니다.
      <div class="actions">
        ${srcs.length ? `<select id="copy-src">${srcs.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}</select>
        <button type="button" class="btn btn-primary" id="do-copy">복사해서 시작</button>` : '<span class="badge none">복사할 편제가 없습니다(사전 작업에서 PDF를 올리면 고를 수 있음)</span>'}
        <button type="button" class="btn btn-ghost" id="do-blank">빈 표로 시작</button>
      </div></div></section>`;
  }

  function checkBand(cur) {
    const t = C.semTotals(cur);
    const sems = C.SEM_KEYS.map(k => `${k}: ${t[k]}`).join(' · ');
    const ok = t.total === STD_TOTAL;
    return `<div class="notice ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'} 교과 이수 학점 <b>${t.total}</b> (기준 ${STD_TOTAL}) · 학기별 ${esc(sems)}</div>`;
  }

  function render(el, ctx) {
    const st = ctx.store.state;
    const year = yearOf(st);
    const cur = curOf(st);
    const dl = ['xlsx:엑셀', 'hwpx:한글', 'pdf:PDF', 'png:PNG'].map((x, i) => {
      const [k, label] = x.split(':');
      return `<button type="button" class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}" data-dl="${k}"${cur ? '' : ' disabled'}>${i === 0 ? ctx.icon('download') : ''}${label}</button>`;
    }).join('');
    el.style.position = 'relative';
    el.innerHTML = `<div class="page-head"><div><h1>편제표 작성</h1><p class="desc">${year}학년도 입학생 · 작성한 편제는 사전 작업의 ${year === st.planYear ? '1학년' : `${year}학년도 입학생`} 편제로 자동 연결됩니다</p></div>
      <div class="actions">${dl}</div></div>
      <div class="toolbar"><label class="field" style="flex-direction:row;align-items:center;gap:6px">입학년도 <input type="number" id="pj-year" min="2020" max="2100" value="${year}" style="width:90px"></label>
      ${cur ? `<span class="sep"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-act="add" title="고른 줄 아래(안 고르면 맨 아래)에 빈 과목 줄을 넣습니다">+ 과목 줄</button>
        <span style="margin-left:auto"></span>` : '<span style="margin-left:auto"></span>'}
      ${cur || undoStack(year).length ? `<button type="button" class="btn btn-ghost btn-sm" id="pj-undo"${undoStack(year).length ? '' : ' disabled'} title="바로 전에 고친 것을 되돌립니다(Ctrl+Z, 칸에 글을 쓰는 중이 아닐 때)">↶ 실행 취소${undoStack(year).length ? ` (${undoStack(year).length})` : ''}</button>` : ''}
      ${cur ? '<button type="button" class="btn btn-danger btn-sm" data-act="restart">처음부터 다시</button>' : ''}</div>
      ${cur ? `${checkBand(cur)}${selBar(cur)}<section class="card" style="padding:12px"><div class="table-wrap" data-keep-scroll="pj">${tableHtml(cur, { editable: true })}</div>
        ${helpFold()}</section>` : startCard(st)}`;
    bind(el, ctx);
  }

  // 줄을 고르면 그 줄로 할 수 있는 일을 보여 주는 띠
  function selBar(cur) {
    const sel = sortedSel(cur);
    if (!sel.length) {
      return `<div class="selbar empty"><b>① 줄 고르기</b> 표 왼쪽 <span class="kbd">줄 번호</span>를 누르세요. 여러 줄은 첫 줄을 누르고 <span class="kbd">Shift</span>를 누른 채 마지막 줄을 누릅니다. 고르면 여기에 묶기·비고·구역 단추가 나옵니다.</div>`;
    }
    const from = sel[0]; const to = sel[sel.length - 1];
    const range = from === to ? `${from + 1}번째 줄` : `${from + 1}~${to + 1}번째 줄`;
    const splits = cur.splits || [];
    let splitBtn;
    if (from === 0) splitBtn = '<button type="button" class="btn btn-ghost btn-sm" disabled title="첫 줄은 언제나 첫 구역의 시작입니다">구역 나누기</button>';
    else if (splits.includes(from)) splitBtn = `<button type="button" class="btn btn-ghost btn-sm" data-act="split" title="${from + 1}번째 줄에서 시작하는 구역을 바로 위 구역과 합쳐 편성단위합을 하나로 만듭니다">위 구역과 합치기</button>`;
    else splitBtn = `<button type="button" class="btn btn-ghost btn-sm" data-act="split" title="${from + 1}번째 줄부터 새 구역을 시작해 오른쪽 편성단위합 칸을 둘로 나눕니다">${from + 1}번째 줄부터 구역 나누기</button>`;
    return `<div class="selbar"><b>${range}</b>${sel.length > 1 ? ` (${sel.length}줄)` : ''} 선택됨
      <span class="sep"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-act="block" title="고른 줄들의 한 학기 칸을 하나로 합쳐 학점을 한 번만 적습니다(예: 택4 12학점)">선택 묶음 만들기</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="note" title="고른 줄들 오른쪽 비고(선택) 칸을 하나로 합쳐 글을 적습니다">비고 넣기</button>
      ${splitBtn}
      <span class="sep"></span>
      <button type="button" class="btn btn-plain btn-sm" data-act="up">▲ 위로</button>
      <button type="button" class="btn btn-plain btn-sm" data-act="down">▼ 아래로</button>
      <button type="button" class="btn btn-plain btn-sm" data-act="del">줄 삭제</button>
      <button type="button" class="link" data-act="clear" style="margin-left:auto">선택 풀기</button></div>`;
  }

  let helpOpen = true;
  function helpFold() {
    return `<details class="fold" id="pj-help"${helpOpen ? ' open' : ''}><summary>편제표 고치는 방법</summary><div class="fold-body small"><ol class="help-list">
      <li><b>칸 고치기</b> · 교과·구분·과목·학점 칸을 눌러 바로 고칩니다. 여러 과목은 쉼표(,)로, 교차이수는 ↔ 또는 &lt;-&gt;로 적습니다.</li>
      <li><b>줄 고르기</b> · 왼쪽 줄 번호를 누릅니다. Shift: 여러 줄 이어서, Ctrl: 하나씩 더하기. 줄 번호를 끌면 줄을 옮깁니다.</li>
      <li><b>선택 묶음(학기 칸 합치기)</b> · "택4 12학점"처럼 여러 과목 중 골라 듣는 경우입니다. 과목 줄들을 고른 뒤 위 띠의 <b>선택 묶음 만들기</b> → 학기·학점을 적으면 그 학기 칸이 세로로 합쳐집니다. 합친 칸을 누르면 학점을 고치거나 <b>묶음 풀기</b>를 할 수 있습니다.</li>
      <li><b>비고(선택)</b> · 줄들을 고른 뒤 <b>비고 넣기</b>. 비고 칸을 누르면 고치거나 지웁니다.</li>
      <li><b>구역(오른쪽 편성단위합 칸)</b> · 편성단위합은 구역마다 학점을 더한 값입니다. 새 구역이 시작될 줄 하나를 고르고 <b>구역 나누기</b>를 누르면 그 줄 위에 굵은 선이 생기고 합이 둘로 나뉩니다. 합치려면 오른쪽 편성단위합 칸을 눌러 <b>위·아래 구역과 합치기</b>를 누릅니다.</li>
      <li><b>창의적 체험활동</b> · 학년·학기별 시간을 넣으면 왼쪽 칸에 활동별 합이 들어갑니다. 세 활동 시간을 모두 더해 16시간마다 1학점(나머지 버림)으로 "이수 단위 계"에 더해집니다.</li>
    </ol></div></details>`;
  }

  function sortedSel(cur) {
    return [...selected].filter(i => i < cur.rows.length).sort((a, b) => a - b);
  }

  function popover(el, anchor, html, onMount) {
    el.querySelectorAll('.popover').forEach(p => p.remove());
    const p = document.createElement('div');
    p.className = 'popover';
    p.innerHTML = html;
    const r = anchor.getBoundingClientRect();
    const base = el.getBoundingClientRect();
    p.style.left = `${Math.max(0, Math.min(r.left - base.left, base.width - 300))}px`;
    p.style.top = `${r.bottom - base.top + 6}px`;
    el.appendChild(p);
    const close = () => p.remove();
    p.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    setTimeout(() => {
      const off = e => { if (!p.contains(e.target)) { close(); document.removeEventListener('mousedown', off); } };
      document.addEventListener('mousedown', off);
    });
    onMount(p, close);
    const first = p.querySelector('input,select');
    if (first) first.focus();
  }

  const semOptions = sel => C.SEM_KEYS.map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${k[0]}학년 ${k[2]}학기</option>`).join('');

  function bind(el, ctx) {
    const st = ctx.store.state;
    const cur = curOf(st);
    el.querySelector('#pj-year').addEventListener('change', e => {
      const v = parseInt(e.target.value, 10);
      if (Number.isFinite(v) && v > 2000) { selected.clear(); ctx.store.update(s => { s.pyeonjeYear = v; }); }
    });
    const copyBtn = el.querySelector('#do-copy');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const id = el.querySelector('#copy-src').value;
      const src = sources(st).find(s => s.id === id);
      if (src) { selected.clear(); ctx.store.update(s => { remember(s); s.authored[yearOf(s)] = C.cloneForYear(src.cur, yearOf(s)); }); ctx.toast('복사했습니다. 바뀐 곳만 고쳐 주세요.'); }
    });
    const blankBtn = el.querySelector('#do-blank');
    if (blankBtn) blankBtn.addEventListener('click', () => {
      ctx.store.update(s => {
        remember(s);
        let c = C.emptyCurriculum(yearOf(s));
        c = C.insertRow(c, 0, { kyo: '국어', gubun: '공통', names: ['공통국어1'], base: 4, credit: 4, sem: { '1-1': 4 } });
        s.authored[yearOf(s)] = c;
      });
    });
    el.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => download(ctx, b.dataset.dl, b)));
    const undoBtn = el.querySelector('#pj-undo');
    if (undoBtn) undoBtn.addEventListener('click', () => undo(ctx));
    keyCtx = ctx;
    if (!cur) return;

    // 칸 고치기
    EduTable.bindEdits(el, {
      onEdit(key, raw) {
        const [kind, a, b] = key.split('|');
        save(ctx, c => {
          if (kind === 'row') return C.setCell(c, Number(a), b, b === 'names' ? String(raw).replace(/<->/g, '↔') : raw);
          if (kind === 'sem') return C.setSem(c, Number(a), b, raw);
          if (kind === 'cc') return C.setCc(c, a, b, raw);
          if (kind === 'kyo' || kind === 'gubun') {
            let n = c;
            for (let i = Number(a); i <= Number(b); i++) n = C.setCell(n, i, kind, String(raw).trim());
            return n;
          }
          return c;
        });
      },
    });

    // 줄 선택(⋮⋮ 누르기), 끌어 옮기기
    el.querySelectorAll('[data-drag]').forEach(h => {
      const i = Number(h.dataset.drag);
      h.addEventListener('click', e => {
        if (e.shiftKey && lastClicked !== null) {
          const [x, y] = [Math.min(lastClicked, i), Math.max(lastClicked, i)];
          for (let k = x; k <= y; k++) selected.add(k);
        } else if (e.ctrlKey || e.metaKey) { if (selected.has(i)) selected.delete(i); else selected.add(i); } else {
          if (selected.size === 1 && selected.has(i)) selected.clear(); else { selected.clear(); selected.add(i); }
        }
        lastClicked = i;
        ctx.rerender();
      });
      h.addEventListener('dragstart', e => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
    });
    el.querySelectorAll('tr[data-row]').forEach(tr => {
      const to = Number(tr.dataset.row);
      tr.addEventListener('dragover', e => { if (dragFrom !== null) { e.preventDefault(); tr.classList.add('drop-before'); } });
      tr.addEventListener('dragleave', () => tr.classList.remove('drop-before'));
      tr.addEventListener('drop', e => {
        e.preventDefault();
        const from = dragFrom; dragFrom = null;
        if (from === null || from === to) return;
        selected.clear();
        save(ctx, c => {
          let n = c;
          let i = from;
          const target = from < to ? to - 1 : to;
          while (i !== target) { const d = i < target ? 1 : -1; n = C.moveRow(n, i, d); i += d; }
          return n;
        });
      });
    });

    // 도구줄
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => {
      const sel = sortedSel(cur);
      const act = b.dataset.act;
      if (act === 'clear') { selected.clear(); ctx.rerender(); return; }
      if (act === 'restart') {
        if (confirm(`${yearOf(st)}학년도 입학생 편제를 지우고 처음부터 다시 만들까요?`)) { selected.clear(); ctx.store.update(s => { remember(s); delete s.authored[yearOf(s)]; }); }
        return;
      }
      if (act === 'add') {
        const at = sel.length ? sel[sel.length - 1] + 1 : cur.rows.length;
        const like = cur.rows[at - 1] || {};
        selected.clear(); selected.add(at);
        save(ctx, c => C.insertRow(c, at, { kyo: like.kyo || '', gubun: like.gubun || '', names: [], base: '', credit: '', sem: {} }));
        return;
      }
      if (!sel.length) { ctx.toast('먼저 표 왼쪽 줄 번호를 눌러 줄을 고르세요.', 'warn'); return; }
      if (act === 'del') {
        if (!confirm(`선택한 ${sel.length}줄을 지울까요?`)) return;
        selected.clear();
        save(ctx, c => sel.slice().reverse().reduce((n, i) => C.removeRow(n, i), c));
        return;
      }
      if (act === 'up' || act === 'down') {
        const d = act === 'up' ? -1 : 1;
        if ((d < 0 && sel[0] === 0) || (d > 0 && sel[sel.length - 1] === cur.rows.length - 1)) return;
        const order = d < 0 ? sel : sel.slice().reverse();
        selected.clear(); sel.forEach(i => selected.add(i + d));
        save(ctx, c => order.reduce((n, i) => C.moveRow(n, i, d), c));
        return;
      }
      if (act === 'split') {
        const merging = (cur.splits || []).includes(sel[0]);
        save(ctx, c => C.toggleSplit(c, sel[0]));
        ctx.toast(merging ? `${sel[0] + 1}번째 줄 구역을 위 구역과 합쳤습니다.` : `${sel[0] + 1}번째 줄부터 새 구역입니다. 오른쪽 편성단위합 칸이 나뉘었습니다.`);
        return;
      }
      const from = sel[0]; const to = sel[sel.length - 1];
      if (act === 'block') {
        popover(el, e.currentTarget, `<h4>선택 묶음 만들기 · ${from + 1}~${to + 1}번째 줄</h4>
          <div class="row"><select id="pb-sem">${semOptions('2-1')}</select><input type="text" id="pb-val" placeholder="학점(예: 12)" style="width:110px"></div>
          <div class="row"><input type="text" id="pb-note" placeholder="비고(예: 1학기 택4)" style="flex:1"></div>
          <div class="row"><button type="button" class="btn btn-primary btn-sm" id="pb-ok">만들기</button><button type="button" class="btn btn-plain btn-sm" data-close>닫기</button></div>
          <p class="hint" style="margin:0">같은 줄 범위에 학기마다 하나씩 만들 수 있습니다. 묶음 줄의 그 학기 학점 칸은 지워집니다.</p>`, (p, close) => {
          p.querySelector('#pb-ok').addEventListener('click', () => {
            const sem = p.querySelector('#pb-sem').value;
            const v = p.querySelector('#pb-val').value;
            const note = p.querySelector('#pb-note').value;
            close();
            save(ctx, c => { let n = C.makeBlock(c, from, to, sem, v); if (note.trim()) n = C.setNote(n, from, to, note); return n; });
          });
        });
        return;
      }
      if (act === 'note') {
        popover(el, e.currentTarget, `<h4>비고(선택) · ${from + 1}~${to + 1}번째 줄</h4>
          <div class="row"><input type="text" id="pn-text" placeholder="예: 1학기 택4 2학기 택5" style="flex:1"></div>
          <div class="row"><button type="button" class="btn btn-primary btn-sm" id="pn-ok">넣기</button><button type="button" class="btn btn-plain btn-sm" data-close>닫기</button></div>`, (p, close) => {
          p.querySelector('#pn-ok').addEventListener('click', () => { const t = p.querySelector('#pn-text').value; close(); save(ctx, c => C.setNote(c, from, to, t)); });
        });
      }
    }));

    const help = el.querySelector('#pj-help');
    if (help) help.addEventListener('toggle', () => { helpOpen = help.open; });

    // 합친 칸(묶음·비고·편성단위합) 누르기
    el.querySelectorAll('[data-pop]').forEach(td => td.addEventListener('click', () => {
      const [kind, a, b] = td.dataset.pop.split('|');
      if (kind === 'sec') {
        const from = Number(a); const to = Number(b);
        const sec = C.sections(cur).find(s => s.from === from);
        const hasUp = from > 0; const hasDown = to + 1 < cur.rows.length;
        popover(el, td, `<h4>편성단위합 구역 · ${from + 1}~${to + 1}번째 줄 · 합 ${sec ? sec.sum : ''}학점</h4>
          <div class="row">${hasUp ? '<button type="button" class="btn btn-ghost btn-sm" id="sc-up">위 구역과 합치기</button>' : ''}${hasDown ? '<button type="button" class="btn btn-ghost btn-sm" id="sc-down">아래 구역과 합치기</button>' : ''}<button type="button" class="btn btn-plain btn-sm" data-close>닫기</button></div>
          <p class="hint" style="margin:0">나누려면: 새 구역이 시작될 줄의 왼쪽 번호를 눌러 고른 뒤, 위 띠의 <b>구역 나누기</b>를 누릅니다.</p>`, (p, close) => {
          const up = p.querySelector('#sc-up');
          if (up) up.addEventListener('click', () => { close(); save(ctx, c => C.setSplits(c, c.splits.filter(s => s !== from))); });
          const down = p.querySelector('#sc-down');
          if (down) down.addEventListener('click', () => { close(); save(ctx, c => C.setSplits(c, c.splits.filter(s => s !== to + 1))); });
        });
        return;
      }
      if (kind === 'block') {
        const blk = cur.blocks.find(x => x.sem === a && x.from === Number(b));
        if (!blk) return;
        popover(el, td, `<h4>선택 묶음 · ${a[0]}학년 ${a[2]}학기 · ${blk.from + 1}~${blk.to + 1}번째 줄</h4>
          <div class="row">학점 <input type="text" id="bk-val" value="${esc(blk.value)}" style="width:90px"></div>
          <div class="row"><button type="button" class="btn btn-primary btn-sm" id="bk-ok">저장</button><button type="button" class="btn btn-danger btn-sm" id="bk-del">묶음 풀기</button><button type="button" class="btn btn-plain btn-sm" data-close>닫기</button></div>`, (p, close) => {
          p.querySelector('#bk-val').addEventListener('keydown', ev => { if (ev.key === 'Enter') p.querySelector('#bk-ok').click(); });
          p.querySelector('#bk-ok').addEventListener('click', () => { const v = p.querySelector('#bk-val').value; close(); save(ctx, c => C.setBlockValue(c, a, blk.from, v)); });
          p.querySelector('#bk-del').addEventListener('click', () => { close(); save(ctx, c => C.removeBlock(c, a, blk.from)); });
        });
      } else {
        const from = Number(a); const to = Number(b);
        const cur0 = C.noteAt(cur, from);
        popover(el, td, `<h4>비고(선택) · ${from + 1}~${to + 1}번째 줄</h4>
          <div class="row"><input type="text" id="nt-text" value="${esc(cur0 ? cur0.text : '')}" placeholder="예: 학기별 택6" style="flex:1"></div>
          <div class="row"><button type="button" class="btn btn-primary btn-sm" id="nt-ok">저장</button>${cur0 ? '<button type="button" class="btn btn-danger btn-sm" id="nt-del">지우기</button>' : ''}<button type="button" class="btn btn-plain btn-sm" data-close>닫기</button></div>
          <p class="hint" style="margin:0">여러 줄에 걸친 비고는 줄을 고른 뒤 도구줄의 "비고 넣기"로 만듭니다.</p>`, (p, close) => {
          p.querySelector('#nt-text').addEventListener('keydown', ev => { if (ev.key === 'Enter') p.querySelector('#nt-ok').click(); });
          p.querySelector('#nt-ok').addEventListener('click', () => { const t = p.querySelector('#nt-text').value; close(); save(ctx, c => C.setNote(c, from, to, t)); });
          const del = p.querySelector('#nt-del');
          if (del) del.addEventListener('click', () => { close(); save(ctx, c => C.setNote(c, from, to, '')); });
        });
      }
    }));
  }

  // ---------- 내려받기 ----------
  async function download(ctx, kind, btn) {
    const st = ctx.store.state;
    const cur = curOf(st);
    if (!cur) return;
    const name = `${cur.year}학년도 입학생 교육과정 편제`;
    btn.disabled = true;
    try {
      if (kind === 'xlsx') {
        if (!window.ExcelJS) throw new Error('엑셀 도구를 불러오지 못했습니다.');
        const wb = EduPyeonjeXlsx.build(ExcelJS, cur);
        U.downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: U.XLSX_TYPE }), `${name}.xlsx`);
      } else if (kind === 'hwpx') {
        if (!window.JSZip) throw new Error('한글 파일 도구(JSZip)를 불러오지 못했습니다.');
        const blob = await EduPyeonjeHwpx.build(JSZip, cur, EduHwpxBase, { type: 'blob' });
        U.downloadBlob(blob, `${name}.hwpx`);
      } else {
        const stage = document.getElementById('export-stage');
        stage.innerHTML = EduPyeonjeImage.sheetHtml(cur, tableHtml(cur, { editable: false }));
        const node = stage.firstElementChild;
        const blob = kind === 'png' ? await EduPyeonjeImage.png(node) : await EduPyeonjeImage.pdf(node);
        stage.innerHTML = '';
        U.downloadBlob(blob, `${name}.${kind}`);
      }
    } catch (e) { ctx.toast('내려받지 못했습니다: ' + e.message, 'error'); }
    btn.disabled = false;
  }

  EduShell.register({
    id: 'pyeonje', group: 'out', label: '편제표',
    ready(ctx) {
      const st = ctx.store.state;
      return curOf(st) ? { ok: true, missing: [] } : { ok: false, missing: [`${yearOf(st)}학년도 입학생 편제 작성`] };
    },
    render,
  });
})();
