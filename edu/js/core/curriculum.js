// 편제 자료 모양(Curriculum)과 계산·편집.
// rows: 과목 줄, blocks: 학기 칸을 세로로 합친 선택 묶음, notes: 비고(선택) 칸 합침,
// splits: 편성단위합 구역 시작 줄, cc: 창의적 체험활동(시간)
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduCurriculum = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const U = typeof require === 'function' ? require('./util.js') : root.EduUtil;
  const { SEM_KEYS } = U;
  const CC_KINDS = ['자율', '동아리', '진로'];
  const CC_LABELS = { 자율: '자율·자치활동(시간)', 동아리: '동아리활동(시간)', 진로: '진로활동(시간)' };
  const CC_HOURS_PER_CREDIT = 16;

  function emptyCc() {
    const one = () => Object.fromEntries([['total', ''], ...SEM_KEYS.map(k => [k, ''])]);
    return Object.fromEntries(CC_KINDS.map(k => [k, one()]));
  }

  function emptyCurriculum(year) {
    return { year, title: `${year}학년도 입학생`, source: 'authored', rows: [], blocks: [], notes: [], splits: [], cc: emptyCc(), warnings: [] };
  }

  function cleanRow(r) {
    return {
      kyo: r.kyo || '', gubun: r.gubun || '', names: Array.isArray(r.names) ? r.names.slice() : [],
      cross: !!r.cross, base: U.isBlank(r.base) ? '' : r.base, credit: U.isBlank(r.credit) ? '' : r.credit,
      sem: { ...(r.sem || {}) }, note: r.note || '',
    };
  }

  // 비고가 있는 줄 r: r을 품은 묶음에서 시작해 겹치는 묶음을 모두 합친 범위
  function noteSpan(blocks, r) {
    let from = r; let to = r;
    let grown = true;
    const touching = blocks.filter(b => b.from <= r && b.to >= r);
    if (!touching.length) return { from, to };
    from = Math.min(...touching.map(b => b.from));
    to = Math.max(...touching.map(b => b.to));
    while (grown) {
      grown = false;
      for (const b of blocks) {
        if (b.to >= from && b.from <= to && (b.from < from || b.to > to)) {
          from = Math.min(from, b.from); to = Math.max(to, b.to); grown = true;
        }
      }
    }
    return { from, to };
  }

  // pdfparse 결과 하나({year, title, rows, warnings, fileName}) → Curriculum
  function fromPdfCohort(c) {
    const rows = [];
    const groups = new Map();
    const noteRows = [];
    (c.rows || []).forEach((r, i) => {
      const sem = {};
      for (const [k, cell] of Object.entries(r.sem || {})) {
        if (!cell) continue;
        if (typeof cell === 'number') { sem[k] = cell; continue; }
        if (cell.type === 'own') sem[k] = cell.value;
        else {
          const gk = `${k}|${cell.blockId}`;
          if (!groups.has(gk)) groups.set(gk, { sem: k, from: i, to: i, value: cell.value });
          else groups.get(gk).to = i;
        }
      }
      if (r.note) noteRows.push([i, r.note]);
      rows.push(cleanRow({ ...r, sem, note: '' }));
    });
    const blocks = [...groups.values()].sort((a, b) => a.from - b.from || a.sem.localeCompare(b.sem));
    const notes = noteRows.map(([i, text]) => ({ ...noteSpan(blocks, i), text }));
    const cur = {
      year: c.year, title: String(c.title || `${c.year}학년도 입학생`).replace(/^\s*\d+\.\s*/, ''), source: 'pdf', fileName: c.fileName,
      rows, blocks, notes, splits: [], cc: emptyCc(), warnings: (c.warnings || []).slice(),
    };
    cur.splits = defaultSplits(cur);
    return cur;
  }

  // 예전 앱이 저장한 편제({year,title,rows(pdfparse 모양),warnings,fileName})도 같은 방법으로 바꾼다
  const fromLegacy = fromPdfCohort;

  // OrgLogic.planItems가 먹는 예전 행 모양으로
  function toLegacyRows(cur) {
    return cur.rows.map((r, i) => {
      const sem = {};
      for (const [k, v] of Object.entries(r.sem)) if (!U.isBlank(v)) sem[k] = { type: 'own', value: Number(v) };
      for (const b of cur.blocks) {
        if (i >= b.from && i <= b.to) sem[b.sem] = { type: 'block', value: Number(b.value) || 0, blockId: `${b.sem}:${b.from}` };
      }
      const note = (cur.notes.find(n => i >= n.from && i <= n.to) || {}).text || '';
      return {
        kyo: r.kyo, gubun: r.gubun, text: r.names.join(', '), names: r.names.slice(), cross: r.cross,
        base: U.isBlank(r.base) ? null : Number(r.base), credit: U.isBlank(r.credit) ? null : Number(r.credit), sem, note,
      };
    });
  }

  function blockAt(cur, i, sem) {
    return cur.blocks.find(b => b.sem === sem && i >= b.from && i <= b.to) || null;
  }
  function noteAt(cur, i) {
    return cur.notes.find(n => i >= n.from && i <= n.to) || null;
  }

  // 학기 합: 줄의 학점 + 묶음 학점(묶음 하나당 한 번)
  function semTotals(cur) {
    const out = Object.fromEntries(SEM_KEYS.map(k => [k, 0]));
    for (const r of cur.rows) for (const k of SEM_KEYS) out[k] += U.num(r.sem[k]);
    for (const b of cur.blocks) if (b.sem in out) out[b.sem] += U.num(b.value);
    out.total = SEM_KEYS.reduce((a, k) => a + out[k], 0);
    return out;
  }

  function isElective(cur, i) {
    const r = cur.rows[i];
    return (r.names.length > 1 && !r.cross) || cur.blocks.some(b => i >= b.from && i <= b.to) || cur.notes.some(n => i >= n.from && i <= n.to);
  }

  // 기본 편성단위합 구역: 첫 선택 줄, 첫 교양 줄에서 나눈다
  function defaultSplits(cur) {
    const out = [];
    const firstSel = cur.rows.findIndex((_, i) => isElective(cur, i));
    const firstKyo = cur.rows.findIndex(r => U.norm(r.kyo) === '교양');
    for (const v of [firstSel, firstKyo]) if (v > 0 && !out.includes(v)) out.push(v);
    return out.sort((a, b) => a - b);
  }

  // 구역마다 편성단위합
  function sections(cur) {
    const n = cur.rows.length;
    if (!n) return [];
    const starts = [0, ...(cur.splits || []).filter(s => s > 0 && s < n)].sort((a, b) => a - b)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    return starts.map((from, k) => {
      const to = (k + 1 < starts.length ? starts[k + 1] : n) - 1;
      let sum = 0;
      for (let i = from; i <= to; i++) for (const s of SEM_KEYS) sum += U.num(cur.rows[i].sem[s]);
      for (const b of cur.blocks) if (b.from >= from && b.from <= to) sum += U.num(b.value);
      return { from, to, sum };
    });
  }

  // 묶음 하나: 과목 학점(묶음 줄 편성단위) · 고를 과목 수 · 점검 경고
  function blockPick(cur, b) {
    const credits = [];
    for (let i = b.from; i <= b.to; i++) {
      const v = U.num(cur.rows[i] && cur.rows[i].credit);
      if (v && !credits.includes(v)) credits.push(v);
    }
    const value = U.num(b.value);
    if (!credits.length) return { credit: value, count: value ? 1 : 0, warn: `${b.from + 1}번째 줄 묶음: 편성단위가 비어 있어 1개 선택으로 봅니다` };
    const credit = Math.min(...credits);
    const count = Math.floor(value / credit);
    let warn = '';
    if (credits.length > 1) warn = `${b.from + 1}번째 줄 묶음: 묶음 안 과목의 편성단위가 서로 다릅니다`;
    else if (value % credit) warn = `${b.from + 1}번째 줄 묶음: ${value}학점을 ${credit}학점 과목으로 나눌 수 없습니다`;
    return { credit, count, warn };
  }

  // 활동 하나의 전체 시간: 학기 칸이 하나라도 있으면 학기 합, 모두 비면 직접 넣은 값
  function ccKindTotal(cur, kind) {
    const v = cur.cc?.[kind] || {};
    const sems = SEM_KEYS.map(k => v[k]);
    if (sems.every(U.isBlank)) return U.isBlank(v.total) ? '' : Number(v.total) || 0;
    return sems.reduce((a, x) => a + (Number(x) || 0), 0);
  }

  // 창체: 세 활동 시간을 모두 더해 16시간마다 1학점(나머지 버림). 모두 빈칸이면 빈칸
  function ccTotals(cur) {
    const out = { hours: {} };
    for (const key of ['total', ...SEM_KEYS]) {
      const vals = CC_KINDS.map(k => (key === 'total' ? ccKindTotal(cur, k) : cur.cc?.[k]?.[key]));
      if (vals.every(U.isBlank)) { out[key] = ''; out.hours[key] = ''; continue; }
      const h = vals.reduce((a, v) => a + (Number(v) || 0), 0);
      out.hours[key] = h;
      out[key] = Math.floor(h / CC_HOURS_PER_CREDIT);
    }
    return out;
  }

  // ---------- 편집 (원본은 그대로, 새 Curriculum을 돌려준다) ----------
  function copy(cur) { return U.clone(cur); }

  function cloneForYear(cur, year) {
    const c = copy(cur);
    c.year = year;
    c.title = `${year}학년도 입학생`;
    c.source = 'authored';
    delete c.fileName;
    c.cc = emptyCc();
    c.warnings = [];
    return c;
  }

  function shiftOnInsert(range, at) {
    if (range.from >= at) return { ...range, from: range.from + 1, to: range.to + 1 };
    if (range.to >= at) return { ...range, to: range.to + 1 };
    return range;
  }
  function insertRow(cur, at, row) {
    const c = copy(cur);
    const i = Math.max(0, Math.min(at, c.rows.length));
    c.rows.splice(i, 0, cleanRow(row || {}));
    c.blocks = c.blocks.map(b => shiftOnInsert(b, i));
    c.notes = c.notes.map(n => shiftOnInsert(n, i));
    c.splits = c.splits.map(s => (s > i ? s + 1 : s));
    return c;
  }

  function shiftOnRemove(range, idx) {
    if (range.from > idx) return { ...range, from: range.from - 1, to: range.to - 1 };
    if (range.to >= idx) return { ...range, to: range.to - 1 };
    return range;
  }
  function removeRow(cur, idx) {
    const c = copy(cur);
    if (idx < 0 || idx >= c.rows.length) return c;
    c.rows.splice(idx, 1);
    c.blocks = c.blocks.map(b => shiftOnRemove(b, idx)).filter(b => b.to >= b.from);
    c.notes = c.notes.map(n => shiftOnRemove(n, idx)).filter(n => n.to >= n.from);
    c.splits = [...new Set(c.splits.map(s => (s > idx ? s - 1 : s)).filter(s => s > 0 && s < c.rows.length))];
    return c;
  }

  // 줄 자리만 바꾼다(묶음·비고 범위는 줄 위치 기준이라 그대로)
  function moveRow(cur, idx, dir) {
    const c = copy(cur);
    const j = idx + dir;
    if (idx < 0 || j < 0 || idx >= c.rows.length || j >= c.rows.length) return c;
    [c.rows[idx], c.rows[j]] = [c.rows[j], c.rows[idx]];
    return c;
  }

  const ROW_FIELDS = ['kyo', 'gubun', 'names', 'cross', 'base', 'credit'];
  function setCell(cur, idx, field, value) {
    if (!ROW_FIELDS.includes(field)) throw new Error(`모르는 칸: ${field}`);
    const c = copy(cur);
    const r = c.rows[idx];
    if (!r) return c;
    if (field === 'names') {
      const text = String(value || '');
      r.cross = text.includes('↔');
      r.names = text.split(/[,↔]/).map(s => s.trim()).filter(Boolean);
    } else if (field === 'base' || field === 'credit') r[field] = U.toNumOrBlank(value);
    else r[field] = value;
    return c;
  }

  function setSem(cur, idx, sem, value) {
    const c = copy(cur);
    const r = c.rows[idx];
    if (!r || !SEM_KEYS.includes(sem)) return c;
    const v = U.toNumOrBlank(value);
    if (v === '') delete r.sem[sem]; else r.sem[sem] = v;
    return c;
  }

  // 같은 학기에 겹치는 묶음은 없애고 새 묶음을 넣는다. 묶음 범위 줄의 그 학기 학점은 지운다.
  function makeBlock(cur, from, to, sem, value) {
    const c = copy(cur);
    const a = Math.min(from, to); const b = Math.max(from, to);
    c.blocks = c.blocks.filter(x => !(x.sem === sem && x.to >= a && x.from <= b));
    c.blocks.push({ sem, from: a, to: b, value: U.toNumOrBlank(value) });
    c.blocks.sort((x, y) => x.from - y.from || x.sem.localeCompare(y.sem));
    for (let i = a; i <= b; i++) if (c.rows[i]) delete c.rows[i].sem[sem];
    return c;
  }

  function removeBlock(cur, sem, from) {
    const c = copy(cur);
    c.blocks = c.blocks.filter(x => !(x.sem === sem && x.from === from));
    return c;
  }

  function setBlockValue(cur, sem, from, value) {
    const c = copy(cur);
    const b = c.blocks.find(x => x.sem === sem && x.from === from);
    if (b) b.value = U.toNumOrBlank(value);
    return c;
  }

  // 비고 칸: 겹치는 비고는 없애고 새로 넣는다. 글이 비면 지우기만.
  function setNote(cur, from, to, text) {
    const c = copy(cur);
    const a = Math.min(from, to); const b = Math.max(from, to);
    c.notes = c.notes.filter(n => !(n.to >= a && n.from <= b));
    if (String(text || '').trim()) c.notes.push({ from: a, to: b, text: String(text).trim() });
    c.notes.sort((x, y) => x.from - y.from);
    return c;
  }

  function setCc(cur, kind, key, value) {
    const c = copy(cur);
    if (!c.cc) c.cc = emptyCc();
    if (!c.cc[kind]) return c;
    c.cc[kind][key] = U.toNumOrBlank(value);
    return c;
  }

  function setSplits(cur, splits) {
    const c = copy(cur);
    c.splits = [...new Set(splits)].filter(s => s > 0 && s < c.rows.length).sort((a, b) => a - b);
    return c;
  }

  // 줄 i 위에서 구역을 나누거나(없으면) 합친다(있으면)
  function toggleSplit(cur, i) {
    const has = (cur.splits || []).includes(i);
    return setSplits(cur, has ? cur.splits.filter(s => s !== i) : [...(cur.splits || []), i]);
  }

  return {
    SEM_KEYS, CC_KINDS, CC_LABELS, CC_HOURS_PER_CREDIT,
    emptyCurriculum, emptyCc, fromPdfCohort, fromLegacy, toLegacyRows, cloneForYear,
    blockAt, noteAt, semTotals, defaultSplits, sections, blockPick, ccKindTotal, ccTotals, isElective,
    insertRow, removeRow, moveRow, setCell, setSem, makeBlock, removeBlock, setBlockValue, setNote, setCc, setSplits, toggleSplit,
  };
});
