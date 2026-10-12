/* global EduShell, EduUtil, EduDerive, EduTable, EduMovingXlsx, ExcelJS */
// 이동수업 배정표 탭: 학기마다 2·3학년 세트별 과목·인원·강의실을 한 화면에서 보고 고친다
(function () {
  const U = EduUtil;
  const D = EduDerive;
  const T = EduTable;
  const { esc } = U;

  function setCard(sem, grade, set) {
    const items = set.items;
    const total = items.reduce((a, it) => a + (Number(it.count) || 0), 0);
    const cells = (fn, label) => `<tr><td class="rh">${label}</td>${items.map(fn).join('')}</tr>`;
    return `<div class="set-card g${grade}"><div class="set-title"><span>${grade}학년 ${esc(set.name)}세트</span><span>${items.length}개 반 · ${total}명</span></div>
      ${items.length ? `<div class="table-wrap"><table class="grid moving"><tbody>
      ${cells(it => `<td class="c${grade} b">${esc(it.subj)}</td>`, '과목')}
      ${cells(it => T.editCell({ key: `mv|${sem}|${grade}|${set.name}|${it.idx}|count`, value: it.count, edited: it.edited.count, cls: `c${grade}` }), '인원')}
      ${cells(it => T.editCell({ key: `mv|${sem}|${grade}|${set.name}|${it.idx}|room`, value: it.room, edited: it.edited.room, type: 'text', placeholder: '', cls: `c${grade}` }), '강의실')}
      ${cells(it => T.editCell({ key: `mv|${sem}|${grade}|${set.name}|${it.idx}|teacher`, value: it.teacher, edited: it.edited.teacher, type: 'text', placeholder: '', cls: `c${grade}` }), '담당 교사')}
      </tbody></table></div>` : '<p class="hint" style="padding:0 12px 10px">개설된 과목이 없습니다.</p>'}</div>`;
  }

  function render(el, ctx) {
    const st = ctx.store.state;
    const sem = st.ui.movingSem || '1';
    const moving = D.movingFor(st, sem);
    const dl = [['1', '1학기'], ['2', '2학기'], ['12', '1·2학기 합본']].map(([k, label], i) => `<button type="button" class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}" data-dl="${k}">${i === 0 ? ctx.icon('download') : ''}${label}</button>`).join('');
    const missing = [2, 3].filter(g => !st.assignments[`${g}-${sem}`]);
    const bands = moving.grades.map(g => `<div class="grade-band g${g.grade}"><span class="bar"></span>${g.grade}학년 <span class="badge none">세트 ${g.sets.length}개</span></div>
      <div class="set-grid">${g.sets.map(s => setCard(sem, g.grade, s)).join('')}</div>`).join('');
    el.innerHTML = `<div class="page-head"><div><h1>이동수업 배정표</h1><p class="desc">${st.planYear}학년도 ${sem}학기 · 선택교과 세트별 과목·인원·강의실·담당 교사 · 반이 2개인 과목은 두 칸으로 나옵니다</p></div>
      <div class="actions">${dl}</div></div>
      <div class="toolbar"><div class="seg">${['1', '2'].map(s => `<button type="button" class="${s === sem ? 'on' : ''}" data-sem="${s}">${s}학기</button>`).join('')}</div>
      <span class="hint" style="margin:0">인원·강의실·담당 교사 칸은 바로 고칠 수 있습니다. 강의실·담당 교사는 비워 두고 내려받아도 됩니다. 엑셀은 세트배정표 모양(담임 줄·요일·교시 가안 표 포함)입니다.</span></div>
      ${missing.length ? `<div class="notice warn">사전 작업에서 ${missing.map(g => `${g}학년 ${sem}학기`).join(', ')} 반 배정 자료를 올리면 여기에 나옵니다. <button type="button" class="link" data-go="prep">사전 작업으로</button></div>` : ''}
      ${bands || '<section class="card"><div class="empty-state"><div class="big">아직 반 배정 자료가 없습니다</div>사전 작업에서 2·3학년 반 배정 자료를 올려 주세요.</div></section>'}`;
    el.querySelectorAll('[data-sem]').forEach(b => b.addEventListener('click', () => ctx.store.update(s => { s.ui.movingSem = b.dataset.sem; })));
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => ctx.go(b.dataset.go)));
    el.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => download(ctx, b.dataset.dl, b)));
    T.bindEdits(el, {
      onEdit(key, raw) {
        const [, s0, g, set, idx, field] = key.split('|');
        const ek = `${s0}|${g}|${set}|${idx}`;
        ctx.store.update(s => {
          const e = { ...(s.moving.edits[ek] || {}) };
          const v = field === 'count' ? U.toNumOrBlank(raw) : String(raw).trim();
          const item = D.movingFor(s, s0).grades.find(x => String(x.grade) === g)?.sets.find(x => x.name === set)?.items[Number(idx)];
          if (v === '' || (field === 'count' && item && v === item.auto.count)) delete e[field]; else e[field] = v;
          if (Object.keys(e).length) s.moving.edits[ek] = e; else delete s.moving.edits[ek];
        });
      },
      onReset(key) {
        const [, s0, g, set, idx, field] = key.split('|');
        const ek = `${s0}|${g}|${set}|${idx}`;
        ctx.store.update(s => { const e = s.moving.edits[ek]; if (e) { delete e[field]; if (!Object.keys(e).length) delete s.moving.edits[ek]; } });
      },
    });
  }

  async function download(ctx, which, btn) {
    const st = ctx.store.state;
    if (!window.ExcelJS) { ctx.toast('엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error'); return; }
    const sems = which === '12' ? ['1', '2'] : [which];
    btn.disabled = true;
    try {
      const movingBySem = Object.fromEntries(sems.map(s => [s, D.movingFor(st, s)]));
      const wb = EduMovingXlsx.build(ExcelJS, { planYear: st.planYear, sems, movingBySem });
      const label = which === '12' ? '1·2학기' : `${which}학기`;
      U.downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: U.XLSX_TYPE }), `${st.planYear}학년도 ${label} 선택교과 세트배정표.xlsx`);
    } catch (e) { ctx.toast('엑셀을 만들지 못했습니다: ' + e.message, 'error'); }
    btn.disabled = false;
  }

  EduShell.register({
    id: 'moving', group: 'out', label: '이동수업 배정표',
    ready(ctx) {
      const st = ctx.store.state;
      const missing = D.ASSIGN_KEYS.filter(k => !st.assignments[k]).map(k => `${k[0]}학년 ${k[2]}학기 반 배정`);
      return { ok: !missing.length, missing };
    },
    render,
  });
})();
