/* global EduUtil */
// 화면 표 그리기 도우미: 학년 색 클래스, 수정 칸, 되돌리기
(function () {
  const { esc } = EduUtil;

  // part: 'top'(1단 머리) | 'sub'(2단 머리) | 'cell'(본문)
  function gradeClass(grade, part) {
    if (!grade) return '';
    return ({ top: 'g', sub: 'h', cell: 'c' }[part] || 'c') + grade;
  }

  // 고칠 수 있는 칸. edited면 노란 점 + 되돌리기(↺)
  // opts: { key, value, edited, cls, title, placeholder, align, width, type }
  function editCell(o) {
    const v = o.value === null || o.value === undefined ? '' : o.value;
    const cls = ['ed', o.cls || '', o.edited ? 'chg' : '', o.align === 'left' ? 'l' : ''].filter(Boolean).join(' ');
    const style = o.width ? ` style="min-width:${o.width}px"` : '';
    const attrs = `data-edit="${esc(o.key)}" data-focus-key="${esc(o.key)}"${o.placeholder !== undefined ? ` placeholder="${esc(o.placeholder)}"` : ''}`;
    const title = o.title || (o.edited ? '직접 고친 값입니다. ↺를 누르면 자동값으로 돌아갑니다.' : '눌러서 고칠 수 있습니다.');
    return `<td class="${cls}"${o.rowspan ? ` rowspan="${o.rowspan}"` : ''}${o.colspan ? ` colspan="${o.colspan}"` : ''} title="${esc(title)}"><input class="ci"${style} type="text" inputmode="${o.type === 'text' ? 'text' : 'numeric'}" value="${esc(v)}" ${attrs}>${o.edited ? `<button type="button" class="reset" data-reset="${esc(o.key)}" title="자동값으로 되돌리기">↺ 되돌리기</button>` : ''}</td>`;
  }

  // 빈 값이면 흐린 점
  function numCell(v, cls) {
    const empty = v === '' || v === null || v === undefined || v === 0;
    return `<td class="${[cls || '', empty ? 'z' : ''].join(' ').trim()}">${empty ? '·' : esc(v)}</td>`;
  }

  // 수정 칸 이벤트: 바뀌면(change/Enter) onEdit(key, raw), 되돌리기 onReset(key)
  function bindEdits(root, { onEdit, onReset }) {
    root.querySelectorAll('[data-edit]').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { inp.value = inp.defaultValue; inp.blur(); }
      });
      inp.addEventListener('change', () => onEdit && onEdit(inp.dataset.edit, inp.value, inp));
      inp.addEventListener('focus', () => { if (inp.select) inp.select(); });
    });
    root.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('mousedown', e => {
      e.preventDefault(); // 입력 칸 change보다 먼저 되돌리기
      onReset && onReset(b.dataset.reset);
    }));
  }

  window.EduTable = { gradeClass, editCell, numCell, bindEdits };
})();
