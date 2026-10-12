// 학생용 링크: 편제를 압축해 주소 #p= 뒤에 담고, 학생용 웹에서 푼다
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduShareLink = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const D = typeof require === 'function' ? require('./subject-dict.js') : root.EduSubjectDict;
  const V = 1;
  const BAD = '링크가 잘못되었습니다. 선생님께 새 링크를 받으세요.';
  const NO_DECOMP = '이 브라우저에서는 링크를 열 수 없습니다. 브라우저를 최신으로 업데이트하거나 크롬 등 다른 브라우저로 열어 주세요.';
  const NO_COMP = '이 브라우저에서는 링크를 만들 수 없습니다. 브라우저를 최신으로 업데이트하거나 크롬 등 다른 브라우저로 열어 주세요.';

  const slimRow = r => ({ kyo: r.kyo || '', gubun: r.gubun || '', names: (r.names || []).slice(), cross: !!r.cross, base: r.base ?? '', credit: r.credit ?? '', sem: { ...(r.sem || {}) } });
  function pack(school, curs, made = new Date().toISOString().slice(0, 10)) {
    return {
      v: V, school: String(school || '').trim(), made, guide: '',
      cohorts: curs.map(c => ({ year: Number(c.year), title: c.title || `${c.year}학년도 입학생`, rows: c.rows.map(slimRow), blocks: c.blocks.map(b => ({ sem: b.sem, from: b.from, to: b.to, value: b.value })), notes: (c.notes || []).map(n => ({ from: n.from, to: n.to, text: n.text })) })),
    };
  }

  function b64url(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    return Uint8Array.from(bin, ch => ch.charCodeAt(0));
  }
  async function pipe(u8, stream) {
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  }

  // 짧은 모양(배열): [2, 학교, 날짜, 안내서, 입학년도들]. 이름은 목록(subject-dict.js)에 똑같이 있으면 번호, 없으면 글자 그대로.
  // 예전 링크는 객체 모양({v:1,...})이라 첫 글자로 구별한다.
  const SHORT = 2;
  const SEM_KEYS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];
  const toNum = list => s => { const i = list.indexOf(s); return i >= 0 ? i : s; };
  const fromNum = list => v => (typeof v === 'number' ? list[v] : v);
  const blankToNull = v => (v === '' ? null : v);
  const nullToBlank = v => (v === null ? '' : v);

  function shorten(pkg) {
    const name = toNum(D.NAMES); const kyo = toNum(D.KYO); const gubun = toNum(D.GUBUN);
    return [SHORT, pkg.school, pkg.made, pkg.guide, pkg.cohorts.map(c => [
      c.year, c.title === `${c.year}학년도 입학생` ? 0 : c.title,
      c.rows.map(r => [kyo(r.kyo), gubun(r.gubun), r.names.map(name), r.cross ? 1 : 0, blankToNull(r.base), blankToNull(r.credit), SEM_KEYS.map(k => (k in r.sem ? r.sem[k] : null))]),
      c.blocks.map(b => [SEM_KEYS.indexOf(b.sem), b.from, b.to, blankToNull(b.value)]),
      c.notes.map(n => [n.from, n.to, n.text]),
    ])];
  }

  function lengthen(a) {
    const name = fromNum(D.NAMES); const kyo = fromNum(D.KYO); const gubun = fromNum(D.GUBUN);
    const [, school, made, guide, cohorts] = a;
    return {
      v: V, school, made, guide,
      cohorts: cohorts.map(([year, title, rows, blocks, notes]) => ({
        year, title: title === 0 ? `${year}학년도 입학생` : title,
        rows: rows.map(([k, g, names, cross, base, credit, sems]) => {
          const sem = {};
          SEM_KEYS.forEach((key, i) => { if (sems[i] !== null) sem[key] = sems[i]; });
          return { kyo: kyo(k), gubun: gubun(g), names: names.map(name), cross: !!cross, base: nullToBlank(base), credit: nullToBlank(credit), sem };
        }),
        blocks: blocks.map(([s, from, to, value]) => ({ sem: SEM_KEYS[s], from, to, value: nullToBlank(value) })),
        notes: notes.map(([from, to, text]) => ({ from, to, text })),
      })),
    };
  }

  async function encode(pkg) {
    if (typeof CompressionStream === 'undefined') throw new Error(NO_COMP);
    return b64url(await pipe(new TextEncoder().encode(JSON.stringify(shorten(pkg))), new CompressionStream('deflate-raw')));
  }

  function valid(p) {
    return p && p.v === V && Array.isArray(p.cohorts) && p.cohorts.length > 0 && p.cohorts.every(c =>
      Number.isFinite(c.year) && Array.isArray(c.rows) && Array.isArray(c.blocks) && Array.isArray(c.notes)
      && c.rows.every(r => r && Array.isArray(r.names) && r.sem && typeof r.sem === 'object')
      && c.blocks.every(b => Number.isInteger(b.from) && Number.isInteger(b.to) && typeof b.sem === 'string'));
  }

  async function decode(code) {
    if (typeof DecompressionStream === 'undefined') throw new Error(NO_DECOMP);
    let pkg;
    try {
      pkg = JSON.parse(new TextDecoder().decode(await pipe(unb64url(String(code || '')), new DecompressionStream('deflate-raw'))));
      if (Array.isArray(pkg)) pkg = pkg[0] === SHORT ? lengthen(pkg) : null;
    } catch (e) { throw new Error(BAD); }
    if (!valid(pkg)) throw new Error(BAD);
    return pkg;
  }

  function fromHash(hash) {
    const m = /[#&]p=([A-Za-z0-9_-]+)/.exec(hash || '');
    return m ? m[1] : null;
  }
  const linkFor = (base, code) => `${base}#p=${code}`;

  return { V, pack, encode, decode, fromHash, linkFor };
});
