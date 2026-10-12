// 교원 조직 계획: 과목 → 표시과목 배정, 입력값으로 주당시수 계산
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrgLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // 양식 1번 표의 보통교과 열 (표시과목, 엑셀 열)
  const COLUMNS = [
    ['국어', 'E'], ['수학', 'F'], ['영어', 'G'],
    ['도덕윤리', 'H'], ['일반사회', 'I'], ['역사', 'J'], ['지리', 'K'], ['공통사회', 'L'],
    ['물리', 'M'], ['화학', 'N'], ['생물', 'O'], ['지학', 'P'], ['공통과학', 'Q'],
    ['체육', 'R'], ['음악', 'S'], ['미술', 'T'],
    ['기가', 'U'], ['기술', 'V'], ['가정', 'W'], ['정보컴퓨터', 'X'],
    ['독어', 'Y'], ['불어', 'Z'], ['일어', 'AA'], ['중어', 'AB'], ['베트남어', 'AC'],
    ['한문', 'AD'], ['철학', 'AE'], ['보건', 'AF'], ['진로직업', 'AG'], ['환경', 'AH'], ['기타', 'AI'],
  ].map(([name, col]) => ({ name, col }));
  const COLUMN_NAMES = COLUMNS.map(c => c.name);

  // 엑셀 7행의 교과 묶음
  const GROUPS = [
    ['국어', ['국어']], ['수학', ['수학']], ['영어', ['영어']],
    ['사회(역사/도덕포함)', ['도덕윤리', '일반사회', '역사', '지리', '공통사회']],
    ['과학', ['물리', '화학', '생물', '지학', '공통과학']],
    ['체육', ['체육']], ['예술', ['음악', '미술']],
    ['기술·가정', ['기가', '기술', '가정', '정보컴퓨터']],
    ['제2외국어', ['독어', '불어', '일어', '중어', '베트남어']],
    ['한문', ['한문']], ['교양', ['철학', '보건', '진로직업', '환경', '기타']],
  ];

  const SEMS = ['1', '2'];

  function norm(s) {
    return (s || '').replace(/[ㆍ·・•]/g, '·').replace(/\s+/g, ' ').trim();
  }

  function isTechHome(name) {
    return /^기술\s*·\s*가정$/.test(norm(name));
  }

  // 순서가 중요하다: 앞의 규칙이 먼저 걸린다.
  const NAME_RULES = [
    [/통합사회/, '공통사회'],
    [/통합과학|과학탐구실험|과학의 역사와 문화|융합과학/, '공통과학'],
    [/로봇|공학/, '기술'],
    [/생활과학|가정과학|생활과과학/, '가정'],
    [/인공지능 수학|인공지능수학/, '수학'],
    [/정보|인공지능|데이터/, '정보컴퓨터'],
    [/일본/, '일어'], [/중국/, '중어'], [/한문|한자/, '한문'],
    [/독일/, '독어'], [/프랑스/, '불어'], [/베트남/, '베트남어'],
    [/한국사|세계사|동아시아|역사/, '역사'],
    [/지리|도시의 미래|지속가능/, '지리'],
    [/윤리/, '도덕윤리'],
    [/물리|역학|전자기/, '물리'],
    [/화학|물질과 에너지/, '화학'],
    [/생명|세포|생물/, '생물'],
    [/지구|행성|환경생태/, '지학'],
    [/스포츠|체육|운동/, '체육'],
    [/음악/, '음악'], [/미술/, '미술'],
    [/영어|영미/, '영어'],
    [/수학|미적분|기하|대수|확률/, '수학'],
    [/국어|문학|독서|화법|작문|매체|언어/, '국어'],
    [/사회|경제|정치|법/, '일반사회'],
    [/철학|논리/, '철학'],
    [/보건/, '보건'],
    [/진로와 직업/, '진로직업'],
  ];
  const KYO_RULES = [
    [/^교양$/, '기타'],
    [/^국어$/, '국어'], [/^수학$/, '수학'], [/^영어$/, '영어'], [/^체육$/, '체육'],
    [/^한국사$/, '역사'],
  ];

  // 기본 배정. 찾지 못하면 null
  function guessColumn(name, kyo) {
    const n = norm(name);
    const k = norm(kyo).replace(/\s/g, '');
    if (/통합사회/.test(n)) return '공통사회';
    if (/통합과학|과학탐구실험|과학의 역사와 문화|융합과학/.test(n)) return '공통과학';
    for (const [re, col] of KYO_RULES) if (re.test(k)) return col;
    for (const [re, col] of NAME_RULES) if (re.test(n)) return col;
    if (/^정보$/.test(k)) return '정보컴퓨터';
    return null;
  }

  function columnFor(name, kyo, overrides) {
    const key = norm(name);
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key] || null;
    return guessColumn(name, kyo);
  }

  // 시수에 곱할 학점: 편성단위. 단, 편성단위가 학기 칸보다 크면(예전 교육과정은 여러 학기 합) 학기 칸 값
  function creditOf(row, cell) {
    const c = Number(row.credit);
    if (Number.isFinite(c) && c > 0 && (cell.type === 'block' || c <= cell.value)) return c;
    return cell.value;
  }

  // 개설 반 수를 직접 넣는 교과: 체육, 예술, 기술·가정, 정보, 제2외국어, 한문
  function isSectionInputKyo(kyo) {
    return /체육|예술|음악|미술|기술|가정|정보|제2외국어|외국어|한문/.test(norm(kyo).replace(/\s/g, ''));
  }

  // 한 입학생 편제에서 대상 학년의 과목 목록을 만든다.
  // kind: fixed(전원 이수, 학점×학급 수) / cross(교차이수, 학점×입력 반 수)
  //       group(선택, 학점×입력 반 수) / tech(기술·가정, 기술·가정 시수 직접 입력)
  function planItems(rows, grade) {
    const items = [];
    for (const row of rows) {
      for (const s of SEMS) {
        const cell = row.sem[`${grade}-${s}`];
        if (!cell) continue;
        const multi = row.names.length > 1;
        if (row.cross) {
          for (const name of row.names) {
            items.push({ kind: isTechHome(name) ? 'tech' : 'cross', name, kyo: row.kyo, sem: s, credit: creditOf(row, cell), pair: row.names });
          }
        } else if (cell.type === 'own' && !multi) {
          const name = row.names[0];
          items.push({ kind: isTechHome(name) ? 'tech' : 'fixed', name, kyo: row.kyo, sem: s, credit: creditOf(row, cell) });
        } else {
          const credit = creditOf(row, cell);
          for (const name of row.names) items.push({ kind: 'group', name, kyo: row.kyo, sem: s, credit, groupNote: row.note });
        }
      }
    }
    return items;
  }

  function itemKey(year, item) {
    return `${year}|${item.sem}|${norm(item.name)}`;
  }

  // 교차이수 반 수 기본값: 학급 수를 반씩 (앞 과목이 남는 반을 가져간다)
  function defaultCrossClasses(item, classes) {
    const idx = item.pair.indexOf(item.name);
    const n = classes || 0;
    return idx === 0 ? Math.ceil(n / 2) : Math.floor(n / 2);
  }

  function emptyGrid() {
    const g = {};
    for (const s of SEMS) for (const gr of [1, 2, 3]) {
      g[`${s}-${gr}`] = Object.fromEntries(COLUMN_NAMES.map(c => [c, 0]));
    }
    return g;
  }

  // 3학년 전원 이수 과목은 교사가 시수를 직접 넣을 수 있다
  const FIXED_INPUT_GRADE = 3;

  function has(obj, key) {
    return obj[key] !== undefined && obj[key] !== null && obj[key] !== '';
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // cohorts: [{ year, grade, rows }]
  // inputs: { classes: {1:n,2:n,3:n}, counts: {key: 반 수}, tech: {key: {기술, 가정}},
  //           fixedHours: {key: 시수} (3학년 전원 이수 과목만, 비우면 학점×학급 수), overrides: {과목명: 열} }
  // 반환: { grid: {'학기-학년': {열: 시수}}, notes: [...], lines: [...] }
  function compute(cohorts, inputs) {
    const grid = emptyGrid();
    const notes = [];
    const lines = [];
    const classes = inputs.classes || {};
    const counts = inputs.counts || {};
    const tech = inputs.tech || {};
    const fixedHours = inputs.fixedHours || {};
    for (const co of cohorts) {
      const items = planItems(co.rows, co.grade);
      const n = num(classes[co.grade]);
      for (const it of items) {
        const key = itemKey(co.year, it);
        const cellKey = `${it.sem}-${co.grade}`;
        if (it.kind === 'tech') {
          const t = tech[key] || {};
          for (const col of ['기술', '가정']) {
            const h = num(t[col]);
            if (h) { grid[cellKey][col] += h; lines.push({ ...it, grade: co.grade, col, hours: h, sections: null }); }
          }
          continue;
        }
        let sections;
        let hours;
        if (it.kind === 'fixed' && co.grade === FIXED_INPUT_GRADE && has(fixedHours, key)) {
          sections = null;
          hours = num(fixedHours[key]);
        } else {
          // 전원 이수 과목도 반 배정 이미지에 있으면 이미지 반 수를 쓴다
          if (it.kind === 'fixed') sections = has(counts, key) ? num(counts[key]) : n;
          else if (it.kind === 'cross') sections = has(counts, key) ? num(counts[key]) : defaultCrossClasses(it, n);
          else sections = num(counts[key]);
          hours = it.credit * sections;
        }
        if (!hours) continue;
        const col = columnFor(it.name, it.kyo, inputs.overrides);
        if (!col) {
          notes.push(`${co.grade}학년 ${it.sem}학기 「${it.name}」 ${hours}시간: 표시과목을 정하지 못해 합계에서 뺐습니다.`);
          continue;
        }
        grid[cellKey][col] += hours;
        lines.push({ ...it, grade: co.grade, col, hours, sections });
      }
    }
    return { grid, notes, lines };
  }

  function gradeOf(planYear, cohortYear) {
    return planYear - cohortYear + 1;
  }

  return {
    COLUMNS, COLUMN_NAMES, GROUPS, norm, isTechHome, guessColumn, columnFor,
    planItems, creditOf, isSectionInputKyo, itemKey, defaultCrossClasses, compute, gradeOf, emptyGrid, FIXED_INPUT_GRADE,
  };
});
