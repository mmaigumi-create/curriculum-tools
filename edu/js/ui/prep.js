/* global EduShell, EduUtil, EduDerive, EduCurriculum, EduAssign, EduMapping, EduXlsxParse, EduTable, PdfParse, ImgParse, OrgLogic, ExcelJS, Tesseract, pdfjsLib */
// 사전 작업 탭: 기본 설정, 입학생 편제, 반 배정 자료, 과목 배정
(function () {
  const U = EduUtil;
  const D = EduDerive;
  const A = EduAssign;
  const L = OrgLogic;
  const { esc } = U;
  const T = EduTable;

  const busy = {};   // 슬롯 키 → 진행 중 안내
  let allMissing = []; // 한 번에 올린 PDF에 없던 입학년도
  const errors = {}; // 슬롯 키 → 오류 안내
  const imageUrls = {}; // 이번에 연 원본 이미지(새로고침하면 사라짐)

  const ASSIGN_LABEL = k => `${k[0]}학년 ${k[2]}학기`;

  // ---------- 파일 읽기 ----------
  async function readPdf(ctx, file) {
    if (!window.pdfjsLib) throw new Error('PDF 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    const data = new Uint8Array(await file.arrayBuffer());
    return PdfParse.parseCurriculumPdf(pdfjsLib, data, { cMapUrl: ctx.PDF_BASE + 'cmaps/', cMapPacked: true });
  }

  // replace: 편제표 탭에서 작성한 같은 입학년도 편제를 지우고 PDF를 쓴다
  function storeCohort(state, c, fileName, replace) {
    const cur = EduCurriculum.fromPdfCohort({ ...c, fileName });
    if (replace) D.usePdfCohort(state, cur);
    else state.cohorts[c.year] = cur;
  }

  // 작성한 편제가 있는 입학년도를 PDF로 바꿀지 묻는다
  function confirmReplace(years) {
    if (!years.length) return false;
    return confirm(`${years.join(', ')}학년도 입학생은 편제표 탭에서 작성한 편제를 쓰고 있습니다(PDF보다 먼저 쓰임).\n이 PDF 편제로 바꿀까요? 작성한 편제는 지워집니다.\n(취소하면 작성한 편제를 계속 씁니다.)`);
  }

  async function onPdf(ctx, year, file) {
    const k = `pdf-${year}`;
    if (busy[k]) return;
    busy[k] = '읽는 중...'; delete errors[k]; ctx.rerender();
    try {
      const found = await readPdf(ctx, file);
      let c = found.find(x => x.year === year);
      if (!c && found.length === 1 && found[0].year === null) c = { ...found[0], year };
      if (!c) {
        const ys = found.map(x => x.year).filter(Boolean);
        throw new Error(ys.length
          ? `이 파일에는 ${ys.join(', ')}학년도 입학생 편제만 있습니다. ${year}학년도 입학생 편제가 든 파일을 올려 주세요.`
          : '파일에서 편제표를 찾지 못했습니다. 한글에서 PDF로 저장한 파일인지 확인해 주세요.');
      }
      const replace = confirmReplace(ctx.store.state.authored[year] ? [year] : []);
      ctx.store.update(s => storeCohort(s, c, file.name, replace));
    } catch (e) { errors[k] = e.message; }
    delete busy[k]; ctx.rerender();
  }

  async function onPdfAll(ctx, file) {
    const k = 'pdf-all';
    busy[k] = '읽는 중...'; delete errors[k]; ctx.rerender();
    try {
      const found = await readPdf(ctx, file);
      const st = ctx.store.state;
      const wanted = [1, 2, 3].map(g => D.gradeYear(st, g));
      const hit = found.filter(c => wanted.includes(c.year));
      if (!hit.length) throw new Error(`이 파일에서 ${wanted.join(', ')}학년도 입학생 편제를 찾지 못했습니다.`);
      const replace = confirmReplace(hit.map(c => c.year).filter(y => st.authored[y]));
      ctx.store.update(s => hit.forEach(c => storeCohort(s, c, file.name, replace)));
      const miss = wanted.filter(y => !hit.some(c => c.year === y));
      if (miss.length) allMissing = miss;
      else ctx.toast(`편제 ${hit.length}개를 읽었습니다.`);
    } catch (e) { errors[k] = e.message; }
    delete busy[k]; ctx.rerender();
  }

  async function onAssignXlsx(ctx, key, file) {
    if (busy[key]) return; // 같은 칸을 읽는 중이면 무시
    busy[key] = '엑셀 읽는 중...'; delete errors[key]; ctx.rerender();
    try {
      if (!window.ExcelJS) throw new Error('엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const a = EduXlsxParse.parseAssignmentWorkbook(wb, file.name);
      delete a.students;
      ctx.store.update(s => { s.assignments[key] = a; delete s.assignFix[key]; });
      ctx.toast(`${ASSIGN_LABEL(key)}: 과목 ${a.subjects.length}개, 세트 ${a.sets.length}개를 읽었습니다.`);
    } catch (e) { errors[key] = e.message; }
    delete busy[key]; ctx.rerender();
  }

  // ---------- 이미지 글자 인식(기존 방식) ----------
  let ocrPromise = null;
  function toCanvas(im) {
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), 0, 0);
    return cv;
  }
  function getOcr() {
    if (!window.Tesseract) return Promise.reject(new Error('글자 인식 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
    if (!ocrPromise) {
      ocrPromise = (async () => {
        const kor = await Tesseract.createWorker('kor');
        await kor.setParameters({ tessedit_pageseg_mode: '7' });
        const dig = await Tesseract.createWorker('eng');
        await dig.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789' });
        return {
          text: async im => (await kor.recognize(toCanvas(im))).data.text,
          digits: async im => (await dig.recognize(toCanvas(im))).data.text,
        };
      })();
      ocrPromise.catch(() => { ocrPromise = null; });
    }
    return ocrPromise;
  }
  async function fileToImage(file) {
    const bmp = await createImageBitmap(file);
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    const g = cv.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height);
    return { width: d.width, height: d.height, data: d.data };
  }
  async function onAssignImage(ctx, key, file) {
    if (busy[key]) return; // 같은 칸을 읽는 중이면 무시
    busy[key] = '글자 인식 도구 준비 중... (처음 한 번은 1~2분 걸릴 수 있습니다)'; delete errors[key]; ctx.rerender();
    try {
      const ocr = await getOcr();
      const img = await fileToImage(file);
      const { grade, sem } = A.parseKey(key);
      const cands = D.candidatesFor(ctx.store.state)(grade, sem);
      const res = await ImgParse.readAssignmentImage(img, ocr, cands, (k, n) => {
        busy[key] = `이미지 읽는 중... 과목 ${k}/${n}`;
        const el = document.querySelector(`[data-busy="${key}"]`);
        if (el) el.textContent = busy[key];
      });
      if (!res.subjects.length) throw new Error(res.warnings[0] || '이미지에서 과목을 찾지 못했습니다.');
      const a = EduXlsxParse.fromImageResult(res, file.name);
      imageUrls[key] = URL.createObjectURL(file);
      ctx.store.update(s => { s.assignments[key] = a; delete s.assignFix[key]; });
      ctx.toast(`${ASSIGN_LABEL(key)}: 과목 ${a.subjects.length}개를 읽었습니다. 읽은 결과를 확인해 주세요.`);
    } catch (e) { errors[key] = e.message; }
    delete busy[key]; ctx.rerender();
  }

  // ---------- 그리기 ----------
  function statusBadge(ok, text) {
    return `<span class="badge ${ok === true ? 'ok' : ok === 'warn' ? 'warn' : 'none'}">${esc(text)}</span>`;
  }

  function basicCard(st, ps) {
    const cls = g => `<label class="field">${g}학년 학급 수<input type="number" min="0" step="1" data-classes="${g}" data-focus-key="classes-${g}" value="${esc(st.classes[g] ?? '')}"></label>`;
    return `<section class="card">
      <div class="card-head"><span class="step">1</span><h2>기본 설정</h2><div class="right">${statusBadge(ps.basic || 'none', ps.basic ? '완료' : '입력 필요')}</div></div>
      <div class="fields">
        <label class="field">계획 학년도<input type="number" min="2020" max="2100" step="1" id="plan-year" data-focus-key="plan-year" value="${esc(st.planYear)}"></label>
        ${cls(1)}${cls(2)}${cls(3)}
      </div>
      <p class="hint">학급 수는 전원이 듣는 과목의 시수, 배당표의 반 열 수에 씁니다.</p>
      ${staffTable(st)}
    </section>`;
  }

  // 교원 정원·현원(표시과목별): 교원조직 시수 표·엑셀의 정원·현원 줄과 1인 평균에 쓴다
  function staffTable(st) {
    const groups = OrgLogic.GROUPS;
    const cols = groups.flatMap(([, c]) => c);
    const single = ([g, c]) => c.length === 1 && c[0] === g;
    const head1 = groups.map(gc => (single(gc) ? `<th rowspan="2" class="grp">${esc(gc[0])}</th>` : `<th colspan="${gc[1].length}" class="grp">${esc(gc[0])}</th>`)).join('');
    const head2 = groups.filter(gc => !single(gc)).flatMap(([, c]) => c).map(c => `<th>${esc(c)}</th>`).join('');
    const sum = kind => cols.reduce((a, c) => a + (Number(st.staff[kind][c]) || 0), 0);
    const row = kind => `<tr><td class="rh l" style="white-space:nowrap"><input class="year-in" type="text" inputmode="numeric" data-staff-year="${kind}" data-focus-key="sy-${kind}" value="${D.staffYear(st, kind)}" title="학년도를 고칠 수 있습니다. 비우면 계획 학년도의 전 해로 돌아갑니다."> ${kind}</td>
      ${cols.map(c => T.editCell({ key: `staff|${kind}|${c}`, value: st.staff[kind][c] ?? '', placeholder: '' })).join('')}<td class="b">${sum(kind) || ''}</td></tr>`;
    return `<h3 class="sub-head" style="margin:16px 0 6px;font-size:14px">교원 정원·현원 <span class="hint" style="margin:0 0 0 6px;font-weight:400">표시과목별 인원 · 교원조직 시수의 정원·현원 줄과 1인 평균(학기 계 ÷ 정원)에 씁니다. 줄 이름의 학년도도 고칠 수 있습니다.</span></h3>
      <div class="table-wrap" data-keep-scroll="staff"><table class="grid org">
      <thead><tr><th rowspan="2">구분</th>${head1}<th rowspan="2">계</th></tr><tr>${head2}</tr></thead>
      <tbody>${row('정원')}${row('현원')}</tbody></table></div>`;
  }

  function cohortCard(st, ps) {
    const slots = [1, 2, 3].map(g => {
      const year = D.gradeYear(st, g);
      const au = st.authored[year];
      const pdf = st.cohorts[year];
      const k = `pdf-${year}`;
      let body = '';
      let cls = '';
      if (au) {
        cls = 'done';
        body = `<div class="st ok">✓ 편제표 탭에서 작성한 편제를 씀 · 과목 줄 ${au.rows.length}개</div>${pdf ? `<div class="st warn">올린 PDF(${esc(pdf.fileName || 'PDF')})는 쓰지 않습니다. PDF 편제를 쓰려면 "PDF로 바꾸기"로 다시 올려 주세요.</div>` : ''}`;
      } else if (pdf) {
        cls = pdf.warnings && pdf.warnings.length ? 'warn' : 'done';
        body = `<div class="st ok">✓ ${esc(pdf.fileName || 'PDF')} · 과목 줄 ${pdf.rows.length}개</div>${(pdf.warnings || []).map(w => `<div class="st warn">${esc(w)}</div>`).join('')}`;
      } else body = '<div class="st muted">아직 올리지 않았습니다</div>';
      if (busy[k]) body += `<div class="st">${esc(busy[k])}</div>`;
      if (errors[k]) body += `<div class="st err">${esc(errors[k])}</div>`;
      const btns = [
        `<label class="btn btn-ghost btn-sm file-btn">${au ? 'PDF로 바꾸기' : pdf ? 'PDF 다시 올리기' : 'PDF 선택'}<input type="file" accept="application/pdf,.pdf" data-pdf="${year}"></label>`,
        pdf ? `<button type="button" class="btn btn-plain btn-sm" data-clear-pdf="${year}">PDF 지우기</button>` : '',
        g === 1 ? `<button type="button" class="btn btn-plain btn-sm" data-go="pyeonje">${au ? '편제표 탭에서 보기' : '편제표 탭에서 작성'}</button>` : '',
      ].join('');
      return `<div class="slot ${cls}"><div class="t">${g}학년 <span class="badge info">${year}학년도 입학생</span></div>${body}<div class="btns">${btns}</div></div>`;
    }).join('');
    const kAll = 'pdf-all';
    return `<section class="card">
      <div class="card-head"><span class="step">2</span><h2>입학생 편제</h2><div class="right">${statusBadge(ps.cohorts === 3 ? true : ps.cohorts ? 'warn' : 'none', `${ps.cohorts}/3`)}</div></div>
      <div class="slots">${slots}</div>
      <label class="drop-wide file-btn">${EduShell.icon('download')}<span>한 PDF에 여러 입학생 편제가 들어 있으면 여기에 한 번에 올리세요 (제목의 "20XX학년도 입학생"으로 나눕니다)</span><input type="file" accept="application/pdf,.pdf" id="pdf-all"></label>
      ${busy[kAll] ? `<p class="hint">${esc(busy[kAll])}</p>` : ''}${errors[kAll] ? `<div class="notice warn" style="margin-top:8px">${esc(errors[kAll])}</div>` : ''}${(() => { const miss = allMissing.filter(y => !st.cohorts[y] && !st.authored[y] && [1, 2, 3].some(g => D.gradeYear(st, g) === y)); return miss.length ? `<div class="notice warn" style="margin-top:8px">${miss.join(', ')}학년도 입학생 편제는 그 파일에 없었습니다. 해당 칸에 따로 올려 주세요.</div>` : ''; })()}
      <p class="hint">한글(HWP)에서 "PDF로 저장"한 파일이어야 합니다. 스캔본·사진은 읽을 수 없습니다. 1학년(새 입학생) 편제가 아직 없으면 <button type="button" class="link" data-go="pyeonje">편제표 탭</button>에서 지난 편제를 복사해 만들 수 있습니다.</p>
    </section>`;
  }

  // 반 배정 결과 표
  function assignTable(st, key) {
    const a = st.assignments[key];
    const fix = st.assignFix[key] || {};
    const { grade, sem } = A.parseKey(key);
    const cands = D.candidatesFor(st)(grade, sem);
    const auto = A.matchNames(a, cands);
    const groupItems = D.itemsFor(st, grade, sem).filter(i => i.kind === 'group');
    let issues = 0;
    const used = new Set();
    const rows = a.subjects.map((s, i) => {
      const name = A.nameOf(fix, i, auto[i]);
      if (name) used.add(name);
      const nameEdited = U.has(fix.names, i);
      const flags = A.subjectFlags(a, fix, i);
      const note = [];
      if (!name) note.push('맞출 과목이 없어 세지 않음');
      if (a.source === 'image' && name && !nameEdited && !s.sure && name === s.name) note.push('이름 확인 필요');
      note.push(...flags);
      if (note.length) issues++;
      const opts = ['<option value="">(맞출 과목 없음)</option>', ...[...new Set([...(name ? [name] : []), ...cands])].map(c => `<option${c === name ? ' selected' : ''}>${esc(c)}</option>`)].join('');
      let secSum = 0;
      const cells = a.sets.map((set, si) => {
        const c = A.cellOf(a, fix, i, set);
        secSum += c.sections;
        const ck = `${key}|${i}|${set}`;
        const red = s.reds && s.reds[set];
        const countText = !c.present ? '' : c.edited.counts ? c.counts.join(', ') : String(c.total);
        const g = si === 0 ? ' gs' : '';
        const edited = c.edited.counts || c.edited.sections;
        return `<td class="ed c${grade}${g}${edited ? ' chg' : ''}" title="반별 인원을 쉼표로 고칠 수 있습니다(예: 35, 35). 아래 칸은 반 수입니다.">
          <input class="ci${red ? ' red' : ''}" type="text" inputmode="numeric" data-edit="cnt|${esc(ck)}" data-focus-key="cnt|${esc(ck)}" value="${esc(countText)}" placeholder="·">
          ${c.present ? `<input class="ci ci-sec" type="text" inputmode="numeric" data-edit="sec|${esc(ck)}" data-focus-key="sec|${esc(ck)}" value="${c.sections}반" title="반 수(직접 고칠 수 있음)">` : ''}
          ${edited ? `<button type="button" class="reset" data-reset="cell|${esc(ck)}">↺ 되돌리기</button>` : ''}</td>`;
      }).join('');
      return `<tr class="${note.length ? 'flag' : ''}"><td class="num">${i + 1}</td><td class="l">${esc(s.raw)}${s.group ? `<div class="faint small">${esc(s.group)}</div>` : ''}</td>
        <td class="ed l${nameEdited ? ' chg' : ''}"><select class="ci" data-name="${esc(key)}|${i}" data-focus-key="name|${esc(key)}|${i}">${opts}</select>${nameEdited ? `<button type="button" class="reset" data-reset="name|${esc(key)}|${i}">↺ 자동으로</button>` : ''}</td>
        ${cells}<td class="b">${secSum}</td><td class="l small wrap">${esc(note.join(' / '))}</td></tr>`;
    }).join('');
    const absent = [...new Set(groupItems.map(i => i.name))].filter(n => !used.has(n));
    const head = `<tr><th>#</th><th class="l">${a.source === 'image' ? '이미지 글자' : '엑셀 과목'}</th><th class="l">맞춘 편제 과목</th>${a.sets.map((s, si) => `<th class="h${grade}${si === 0 ? ' gs' : ''}">${s}세트</th>`).join('')}<th>반 수</th><th class="l">비고</th></tr>`;
    return {
      issues,
      html: `<div class="table-wrap" data-keep-scroll="assign-${key}"><table class="grid sticky-first assign"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
        ${absent.length ? `<p class="hint">반 배정 자료에 없어 개설 안 함(0반)으로 본 선택과목: ${absent.map(esc).join(', ')}</p>` : ''}
        ${imageUrls[key] ? `<p class="hint"><a href="${imageUrls[key]}" target="_blank" rel="noopener">원본 이미지 새 창에서 보기</a> · 빨간 숫자는 원본에서도 빨갛게 표시된 인원입니다.</p>` : ''}`,
    };
  }

  function assignCard(st, ps) {
    const slots = D.ASSIGN_KEYS.map(key => {
      const a = st.assignments[key];
      const g = Number(key[0]);
      const hasCohort = !!D.cohortFor(st, g);
      let body = '';
      let cls = '';
      if (a) {
        const t = assignTableCache[key] || { issues: 0 };
        cls = t.issues ? 'warn' : 'done';
        body = `<div class="st ok">✓ ${a.source === 'xlsx' ? '엑셀' : '이미지'} · ${esc(a.fileName || '')}</div><div class="sub">세트 ${a.sets.length}개(${a.sets[0]}~${a.sets[a.sets.length - 1]}) · 과목 ${a.subjects.length}개</div>${t.issues ? `<div class="st warn">확인할 과목 ${t.issues}개</div>` : ''}`;
      } else body = `<div class="st muted">학생별 배정 엑셀 또는 반 배정 화면 이미지</div>${hasCohort ? '' : `<div class="st warn">${g}학년 편제가 없어 과목 이름을 맞출 수 없습니다</div>`}`;
      if (busy[key]) body += `<div class="st" data-busy="${key}">${esc(busy[key])}</div>`;
      if (errors[key]) body += `<div class="st err">${esc(errors[key])}</div>`;
      return `<div class="slot ${cls}"><div class="t">${ASSIGN_LABEL(key)}</div>${body}<div class="btns">
        <label class="btn btn-ghost btn-sm file-btn">엑셀 선택<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-xlsx="${key}"></label>
        <label class="btn btn-ghost btn-sm file-btn">이미지 선택<input type="file" accept="image/png,image/jpeg,image/*" data-img="${key}"></label>
        ${a ? `<button type="button" class="btn btn-plain btn-sm" data-clear-assign="${key}">지우기</button>` : ''}</div></div>`;
    }).join('');
    const folds = D.ASSIGN_KEYS.filter(k => st.assignments[k]).map(key => {
      const t = assignTableCache[key];
      return `<details class="fold" data-fold="${key}"${t.issues || openFolds.has(key) ? ' open' : ''}><summary>${ASSIGN_LABEL(key)} 읽은 결과 ${t.issues ? `<span class="badge warn">확인 ${t.issues}</span>` : '<span class="badge ok">확인 완료</span>'}</summary>
        <div class="fold-body"><p class="hint" style="margin:0 0 8px">세트 칸의 위 숫자는 인원(반이 여럿이면 쉼표로: 35, 35), 아래는 반 수입니다. 반 수는 1~39명 1반, 60~80명 2반으로 자동으로 셉니다. 고친 칸은 노란 점이 찍히고 ↺로 되돌립니다.</p>${t.html}</div></details>`;
    }).join('');
    return `<section class="card">
      <div class="card-head"><span class="step">3</span><h2>반 배정 자료</h2><div class="right">${statusBadge(ps.assigns === 4 ? true : ps.assigns ? 'warn' : 'none', `${ps.assigns}/4`)}</div></div>
      <div class="slots">${slots}</div>
      <p class="hint">엑셀은 수강신청 프로그램에서 받은 학생별 세트 배정 파일(1행 "1학기[택4]" 묶음, 2행 과목명)입니다. 학생 이름은 세기만 하고 저장하지 않습니다.
      이미지는 타임별 반 배정 표 화면을 과목 이름 줄부터 마지막 타임까지 캡처한 PNG입니다(타임 A, B, C... = 세트 A, B, C...).</p>
      ${folds}
    </section>`;
  }

  function mappingCard(ctx, st, ps) {
    const subs = D.allSubjects(st);
    const onlyChanged = st.ui.mapOnlyChanged;
    const colOpts = sel => ['<option value="">(배정 안 함)</option>', ...L.COLUMN_NAMES.map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`)].join('');
    const sheetOpts = sel => ['<option value="">(배정 안 함)</option>', ...EduMapping.SHEETS.map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`)].join('');
    let rows = '';
    for (const s of subs) {
      const isTech = s.kinds.has('tech');
      const colChanged = U.has(st.overrides, s.key);
      const sheetChanged = U.has(st.sheetOverrides, s.key);
      if (onlyChanged && !colChanged && !sheetChanged) continue;
      const col = isTech ? null : L.columnFor(s.name, s.kyo, st.overrides);
      const sheet = isTech ? (U.has(st.sheetOverrides, s.key) ? st.sheetOverrides[s.key] : '기술가정') : EduMapping.sheetFor(s.name, s.kyo, col, st.sheetOverrides);
      const missing = (!isTech && !col) || !sheet;
      rows += `<tr class="${missing ? 'flag' : ''}"><td>${esc(s.kyo)}</td><td class="l">${esc(s.name)}</td><td>${[...s.grades].sort().join('·')}학년</td>
        ${isTech ? '<td class="l small muted">기술·가정 시수로 따로 입력</td>' : `<td class="ed l${colChanged ? ' chg' : ''}"><select class="ci" data-col="${esc(s.key)}" data-focus-key="col|${esc(s.key)}">${colOpts(col)}</select>${colChanged ? `<button type="button" class="reset" data-reset="col|${esc(s.key)}">↺ 기본값</button>` : ''}</td>`}
        <td class="ed l${sheetChanged ? ' chg' : ''}"><select class="ci" data-sheet="${esc(s.key)}" data-focus-key="sheet|${esc(s.key)}">${sheetOpts(sheet)}</select>${sheetChanged ? `<button type="button" class="reset" data-reset="sheet|${esc(s.key)}">↺ 기본값</button>` : ''}</td>
        <td class="l small muted">${isTech ? '' : `기본: ${esc(L.guessColumn(s.name, s.kyo) || '없음')}`}</td></tr>`;
    }
    const changed = Object.keys(st.overrides).length + Object.keys(st.sheetOverrides).length;
    const open = ps.missingCols > 0 || openFolds.has('map');
    return `<section class="card">
      <div class="card-head"><span class="step">4</span><h2>과목 배정</h2><div class="right">${subs.length ? statusBadge(ps.missingCols ? 'warn' : true, ps.missingCols ? `미배정 ${ps.missingCols}` : '자동') : statusBadge('none', '편제 필요')}</div></div>
      <p class="hint" style="margin-top:0">과목마다 표시과목(교원조직 시수)과 교과 시트(수업시수 배당표)를 자동으로 정합니다. 바꾼 것만 이 브라우저에 저장됩니다.</p>
      ${subs.length ? `<details class="fold" data-fold="map"${open ? ' open' : ''}><summary>과목 ${subs.length}개 · 바꾼 배정 ${changed}개${ps.missingCols ? ` · <span class="badge warn">미배정 ${ps.missingCols}</span>` : ''}</summary>
        <div class="fold-body"><div class="toolbar" style="margin-bottom:8px"><label class="check"><input type="checkbox" id="map-only"${onlyChanged ? ' checked' : ''}> 바꾼 과목만 보기</label><button type="button" class="btn btn-plain btn-sm" id="map-reset">모두 기본값으로</button></div>
        ${rows ? `<div class="table-wrap tall" data-keep-scroll="map"><table class="grid"><thead><tr><th>교과</th><th class="l">과목</th><th>학년</th><th class="l">표시과목</th><th class="l">교과 시트</th><th class="l"></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="hint">바꾼 과목이 없습니다.</p>'}</div></details>` : ''}
    </section>`;
  }

  const openFolds = new Set();
  let assignTableCache = {};

  function render(el, ctx) {
    const st = ctx.store.state;
    const ps = D.prepStatus(st);
    assignTableCache = {};
    for (const k of D.ASSIGN_KEYS) if (st.assignments[k]) assignTableCache[k] = assignTable(st, k);
    el.innerHTML = `<div class="page-head"><div><h1>사전 작업</h1><p class="desc">여기서 한 번 넣으면 산출물 4개가 같이 씁니다. 넣은 값은 이 브라우저에 자동 저장됩니다.</p></div>
      <div class="actions"><span class="badge ${ps.done === 4 ? 'ok' : 'info'}">${ps.done}/4 완료</span></div></div>
      ${basicCard(st, ps)}${cohortCard(st, ps)}${assignCard(st, ps)}${mappingCard(ctx, st, ps)}`;
    bind(el, ctx);
  }

  function parseCounts(text) {
    return String(text).split(/[,\s]+/).filter(Boolean).map(v => (/^\d+$/.test(v) ? parseInt(v, 10) : null)).filter(v => v !== null);
  }

  function bind(el, ctx) {
    const up = fn => ctx.store.update(fn);
    el.querySelector('#plan-year').addEventListener('change', e => {
      const v = parseInt(e.target.value, 10);
      if (Number.isFinite(v) && v > 2000 && v < 2200) up(s => { s.planYear = v; });
    });
    el.querySelectorAll('[data-classes]').forEach(inp => inp.addEventListener('change', () => {
      const v = U.toNumOrBlank(inp.value);
      up(s => { if (v === '') delete s.classes[inp.dataset.classes]; else s.classes[inp.dataset.classes] = v; });
    }));
    el.querySelectorAll('[data-pdf]').forEach(inp => inp.addEventListener('change', () => { if (inp.files[0]) onPdf(ctx, Number(inp.dataset.pdf), inp.files[0]); }));
    el.querySelector('#pdf-all').addEventListener('change', e => { if (e.target.files[0]) onPdfAll(ctx, e.target.files[0]); });
    el.querySelectorAll('[data-clear-pdf]').forEach(b => b.addEventListener('click', () => up(s => { delete s.cohorts[b.dataset.clearPdf]; })));
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => ctx.go(b.dataset.go)));
    el.querySelectorAll('[data-xlsx]').forEach(inp => inp.addEventListener('change', () => { if (inp.files[0]) onAssignXlsx(ctx, inp.dataset.xlsx, inp.files[0]); }));
    el.querySelectorAll('[data-img]').forEach(inp => inp.addEventListener('change', () => { if (inp.files[0]) onAssignImage(ctx, inp.dataset.img, inp.files[0]); }));
    el.querySelectorAll('[data-clear-assign]').forEach(b => b.addEventListener('click', () => {
      if (confirm(`${ASSIGN_LABEL(b.dataset.clearAssign)} 반 배정 자료와 고친 값을 지울까요?`)) up(s => { delete s.assignments[b.dataset.clearAssign]; delete s.assignFix[b.dataset.clearAssign]; });
    }));
    el.querySelectorAll('details[data-fold]').forEach(d => d.addEventListener('toggle', () => { if (d.open) openFolds.add(d.dataset.fold); else openFolds.delete(d.dataset.fold); }));
    el.querySelectorAll('[data-name]').forEach(sel => sel.addEventListener('change', () => {
      const [key, i] = sel.dataset.name.split('|');
      up(s => { const f = s.assignFix[key] || (s.assignFix[key] = {}); (f.names || (f.names = {}))[i] = sel.value; });
    }));
    el.querySelectorAll('[data-staff-year]').forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('change', () => {
        const v = parseInt(inp.value, 10);
        up(s => { if (Number.isFinite(v) && v > 2000) s.staffYears[inp.dataset.staffYear] = v; else delete s.staffYears[inp.dataset.staffYear]; });
      });
    });
    // 세트 칸: 인원·반 수, 정원·현원 칸
    T.bindEdits(el, {
      onEdit(k, raw) {
        const [kind, key, i, set] = k.split('|');
        if (kind === 'staff') {
          const v = U.toNumOrBlank(raw);
          up(s => { if (v === '') delete s.staff[key][i]; else s.staff[key][i] = v; });
          return;
        }
        if (kind !== 'cnt' && kind !== 'sec') return;
        up(s => {
          const f = s.assignFix[key] || (s.assignFix[key] = {});
          const cells = f.cells || (f.cells = {});
          const ck = `${i}|${set}`;
          const cur = { ...(cells[ck] || {}) };
          if (kind === 'cnt') {
            // 숫자 하나는 전체 인원(반 수는 규칙으로), 여러 개는 반별 인원
            const list = parseCounts(raw);
            if (list.length === 1) {
              const n = ImgParse.sectionsFor(list[0]).sections;
              cur.counts = n > 1 ? A.split(list[0], n) : [list[0]];
            } else cur.counts = list;
          } else {
            const v = parseInt(String(raw).replace(/\D/g, ''), 10);
            if (Number.isFinite(v)) cur.sections = v; else delete cur.sections;
          }
          cells[ck] = cur;
        });
      },
      onReset(k) {
        const [kind, key, i, set] = k.split('|');
        up(s => {
          const f = s.assignFix[key] || {};
          if (kind === 'cell' && f.cells) delete f.cells[`${i}|${set}`];
          if (kind === 'name' && f.names) delete f.names[i];
          if (kind === 'col') delete s.overrides[key];
          if (kind === 'sheet') delete s.sheetOverrides[key];
        });
      },
    });
    // 과목 배정
    el.querySelectorAll('[data-col]').forEach(sel => sel.addEventListener('change', () => {
      const s0 = D.allSubjects(ctx.store.state).find(x => x.key === sel.dataset.col);
      up(s => {
        if ((sel.value || null) === L.guessColumn(s0.name, s0.kyo)) delete s.overrides[sel.dataset.col];
        else s.overrides[sel.dataset.col] = sel.value;
      });
    }));
    el.querySelectorAll('[data-sheet]').forEach(sel => sel.addEventListener('change', () => up(s => { s.sheetOverrides[sel.dataset.sheet] = sel.value; })));
    const only = el.querySelector('#map-only');
    if (only) only.addEventListener('change', () => up(s => { s.ui.mapOnlyChanged = only.checked; }));
    const reset = el.querySelector('#map-reset');
    if (reset) reset.addEventListener('click', () => {
      if (confirm('바꾼 과목 배정을 모두 기본값으로 되돌릴까요?')) up(s => { s.overrides = {}; s.sheetOverrides = {}; });
    });
  }

  EduShell.register({
    id: 'prep', group: 'prep', label: '사전 작업',
    badge: ctx => `${D.prepStatus(ctx.store.state).done}/4`,
    render,
  });
})();
