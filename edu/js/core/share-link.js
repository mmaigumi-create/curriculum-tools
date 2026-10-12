// 학생용 링크: 편제를 압축해 주소 #p= 뒤에 담고, 학생용 웹에서 푼다
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EduShareLink = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
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

  async function encode(pkg) {
    if (typeof CompressionStream === 'undefined') throw new Error(NO_COMP);
    return b64url(await pipe(new TextEncoder().encode(JSON.stringify(pkg)), new CompressionStream('deflate-raw')));
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
