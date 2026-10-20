/* 준비 · 정리: 설비 선택(4WAY · HAIPICK · 로봇암 · AMR · 스마트글라스) → 매뉴얼을 슬라이드처럼 이어서 진행.
   오늘 준비 루틴 / 정리 루틴, 비상연락망, 투어 기록 */
(function () {
  const { esc, form, toast, requireUnlock } = UI;

  // 설비 탭 (설정 equipTabs로 바꿀 수 있음)
  const EQUIP_DEFAULT = [['s10', '4WAY'], ['s9', 'HAIPICK'], ['s6', '로봇암'], ['s8', 'AMR'], ['s7', '스마트글라스']];
  App.equipTabs = () => {
    const v = Store.settingJson('equipTabs', null);
    return (Array.isArray(v) && v.length ? v : EQUIP_DEFAULT).map(([id, short]) => ({ id, short, st: Store.get('stations', id) })).filter((x) => x.st);
  };
  // 매뉴얼 구분
  const KINDS = [['pc', 'PC 사전작업', '컴퓨터로 미리 하는 오더 작업'], ['prep', '시연 준비', '현장에서 설비 켜기 · 셋팅'],
    ['field', '현장 체크', '현장에서 확인할 것'], ['demo', '시연', '고객 앞에서 하는 조작'], ['close', '정리', '시연 후 끄기 · 원위치'], ['ref', '참고', '필요할 때 보는 가이드']];
  App.KIND_LABEL = Object.fromEntries(KINDS.map(([k, t]) => [k, t]));

  // ───────── 오늘 체크 (기기 · 날짜별) ─────────
  const ckKey = (p) => `tdl.check.${p}.${Store.today()}`;
  const gKey = () => `tdl.gcheck.${Store.today()}`;
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } };
  App.checks = {
    item: (phase) => read(ckKey(phase)),
    setItem(phase, id, on) { const c = read(ckKey(phase)); c[id] = on; write(ckKey(phase), c); },
    step: () => read(gKey()),
    setStep(id, on) { const c = read(gKey()); c[id] = on; write(gKey(), c); },
    reset() { write(ckKey('pre'), {}); write(ckKey('post'), {}); write(gKey(), {}); },
  };
  const tourType = () => App.prefs.load().tourType || '일반';
  const fits = (m) => m.tourType === 'all' || !m.tourType || m.tourType === tourType();

  // ───────── 준비 카테고리: 오더 업로드(PC) / 현장 준비 / 정리 ─────────
  App.CATS = {
    order: { label: '오더 업로드', desc: 'PC에서 하는 오더 작업 — AMR은 현장 셋팅을 먼저 한 뒤' },
    field: { label: '현장 준비', desc: '공통 체크 → 로봇암 → AMR → 스마트글라스' },
    close: { label: '정리 루틴', desc: '시연이 끝나면 설비별로 끄고 원위치' },
  };
  App.routineEntries = (which) => {
    const ent = [];
    if (which === 'close') {
      Store.all('guides').filter((g) => Number(g.closeRoutine) > 0)
        .forEach((g) => ent.push({ type: 'guide', guide: g, n: Number(g.closeRoutine), group: '설비 정리' }));
      Store.where('manual', (m) => m.phase === 'post' && m.stationId === 'common' && fits(m)).sort((a, b) => a.order - b.order)
        .forEach((m, i) => ent.push({ type: 'note', item: m, phase: 'post', n: 900 + i, group: '마무리' }));
      return ent.sort((a, b) => a.n - b.n);
    }
    if (which === 'field') {
      Store.where('manual', (m) => m.phase === 'pre' && m.stationId === 'common' && fits(m)).sort((a, b) => a.order - b.order)
        .forEach((m, i) => ent.push({ type: 'note', item: m, phase: 'pre', n: i / 100, group: '공통 체크' }));
    }
    Store.all('guides').filter((g) => (g.prepCat || '') === which && Number(g.routine) > 0)
      .forEach((g) => ent.push({ type: 'guide', guide: g, n: Number(g.routine), optional: String(g.optional) === 'true',
        group: which === 'order' ? '오더 업로드' : '설비 셋팅' }));
    return ent.sort((a, b) => a.n - b.n);
  };
  // 진행 상황: 가이드 단계 · 체크 항목
  App.entryProgress = (e) => {
    if (e.type === 'guide') {
      const steps = App.guideSteps(e.guide.id); const ck = App.checks.step();
      return { done: steps.filter((s) => ck[s.id]).length, total: steps.length };
    }
    return { done: App.checks.item(e.phase)[e.item.id] ? 1 : 0, total: 1 };
  };
  const stName = (id) => { const t = App.equipTabs().find((x) => x.id === id); if (t) return t.short; const s = Store.get('stations', id); return s ? s.name : ''; };
  App.stName = stName;

  const ring = (done, total) => {
    const p = total ? Math.round((done / total) * 100) : 0;
    return `<span class="st-dot ${p >= 100 ? 'full' : p > 0 ? 'half' : ''}" aria-label="${p}% 완료"></span>`;
  };

  // ───────── 상단 설비 선택 ─────────
  function tabsHtml(base, active) {
    const tabs = [{ id: '', short: base === 'close' ? '정리 루틴' : '준비 홈' }].concat(App.equipTabs());
    return `<nav class="eq-tabs" aria-label="설비 선택">${tabs.map((t) => `<a href="#/${base}${t.id ? '/' + t.id : ''}" class="${t.id === active ? 'on' : ''}"${t.id === active ? ' aria-current="page"' : ''}>${esc(t.short)}</a>`).join('')}</nav>`;
  }

  // ───────── 카테고리 카드 (오더 업로드 · 현장 준비 · 정리) ─────────
  function routineHtml(which) {
    const ent = App.routineEntries(which);
    let done = 0, total = 0, resume = -1;
    const rows = ent.map((e, i) => {
      const p = App.entryProgress(e);
      if (!e.optional) { done += p.done; total += p.total; if (resume < 0 && p.done < p.total) resume = i; }
      return { e, p, i };
    });
    const groups = [];
    rows.forEach((r) => { const g = groups[groups.length - 1]; if (g && g.name === r.e.group) g.rows.push(r); else groups.push({ name: r.e.group, rows: [r] }); });
    const pct = total ? Math.round((done / total) * 100) : 0;
    const key = which === 'close' ? 'close' : `r~${which}`;
    const c = App.CATS[which];
    const cta = total === 0 ? '' : done >= total
      ? `<a class="btn ghost block" href="#/play/${key}/0">✓ 완료 — 다시 보기</a>`
      : `<a class="btn primary big block" href="#/play/${key}/@${resume}">${done ? '▶ 이어서 진행' : `▶ ${c.label} 시작`}</a>`;
    return `<section class="cat-card card">
        <div class="hero-top"><div><h2>${c.label}</h2><small class="muted">${c.desc}</small></div>
          <div class="hero-pct"><b>${pct}</b><span>%</span></div></div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        ${cta}
        ${groups.map((g) => `${groups.length > 1 ? `<h3 class="cat-sub">${esc(g.name)}</h3>` : ''}<ol class="rt-list">${g.rows.map(({ e, p, i }) => {
          const title = e.type === 'guide' ? (e.guide.variant ? `${stName(e.guide.equip)} ${e.guide.variant}` : e.guide.title) : e.item.title;
          const sub = e.type === 'guide' ? `${p.total}단계${p.done && p.done < p.total ? ` · ${p.done}/${p.total}` : ''}` : '체크';
          const href = e.optional ? `#/play/g~${esc(e.guide.id)}/0` : `#/play/${key}/@${i}`;
          return `<li><a class="rt-row${p.done >= p.total ? ' done' : ''}${e.optional ? ' opt' : ''}" href="${href}">${ring(p.done, p.total)}
            <span class="rt-body"><b>${esc(title)}${e.optional ? ' <span class="badge warn">필요 시</span>' : ''}</b>${e.type === 'guide' ? `<small>${esc(sub)}</small>` : ''}</span>
            <span class="chev" aria-hidden="true">›</span></a>
            ${e.type === 'note' ? App.editBtn(`data-edit-manual="${e.item.id}"`, '✎') : App.editBtn(`data-edit-guide="${e.guide.id}"`, '✎')}</li>`;
        }).join('')}</ol>`).join('')}
        ${which !== 'order' ? App.editBtn(`data-add-manual="${which === 'close' ? 'post' : 'pre'}|common"`, '+ 공통 체크 추가') : ''}
      </section>`;
  }

  function prepHome() {
    return `<div class="cat-grid">${routineHtml('order')}${routineHtml('field')}</div>
      <p class="small muted">체크 상태는 이 기기에 오늘 날짜로 저장됩니다. <button class="btn small ghost" data-reset>오늘 체크 초기화</button></p>`;
  }

  // ───────── 설비 화면: 구분별 큰 버튼 ─────────
  function equipHtml(sid) {
    const st = Store.get('stations', sid);
    const gs = Store.all('guides').filter((g) => g.equip === sid).sort((a, b) => a.order - b.order);
    const notes = Store.where('manual', (m) => m.phase === 'pre' && m.section === 'field' && m.stationId === sid && fits(m)).sort((a, b) => a.order - b.order);
    const icks = App.checks.item('pre');
    const contacts = Store.where('contacts', (c) => String(c.stations || '').split(',').includes(sid));
    const blocks = KINDS.map(([k, label, hint]) => {
      if (k === 'field') {
        if (!notes.length) return '';
        return `<section class="kind-block"><h3 class="section-title">${label}<small>${hint}</small></h3>
          <ul class="checklist">${notes.map((m) => `<li><label class="check"><input type="checkbox" data-mcheck="${m.id}"${icks[m.id] ? ' checked' : ''}>
            <span><b>${esc(m.title)}</b>${m.body ? `<small>${App.richText(m.body)}</small>` : ''}</span></label>${App.editBtn(`data-edit-manual="${m.id}"`, '✎')}</li>`).join('')}</ul></section>`;
      }
      const list = gs.filter((g) => g.kind === k);
      if (!list.length) return '';
      return `<section class="kind-block"><h3 class="section-title">${label}<small>${hint}</small></h3>
        <div class="flow-btns">${list.map((g) => {
          const steps = App.guideSteps(g.id); const ck = App.checks.step(); const d = steps.filter((s) => ck[s.id]).length;
          return `<a class="flow-btn${d && d >= steps.length ? ' done' : ''}" href="#/play/g~${esc(g.id)}/0">
            <span class="fb-top">${g.variant ? `<b class="fb-variant">${esc(g.variant)}</b>` : ''}${String(g.optional) === 'true' ? '<span class="badge warn">필요 시</span>' : ''}</span>
            <span class="fb-title">${esc(g.title)}</span>
            <span class="fb-meta">${steps.length}단계${d ? ` · ${d}/${steps.length} 완료` : ''}<span class="fb-go" aria-hidden="true">▶</span></span></a>`;
        }).join('')}</div></section>`;
    }).join('');
    return `<header class="eq-head"><span class="st-no big">${esc(st.no)}</span><div><h2>${esc(st.name)}</h2><small class="muted">${esc(st.zone)}</small></div></header>
      ${blocks || '<div class="todo">✍️ 이 설비의 매뉴얼이 아직 없습니다</div>'}
      ${contacts.length ? `<section class="kind-block"><h3 class="section-title">연락처</h3>${contacts.map(contactLine).join('')}</section>` : ''}`;
  }

  App.richText = (s) => esc(s).replace(/\n/g, '<br>').replace(/(0\d{1,2}-\d{3,4}-\d{4})/g, '<a href="tel:$1">$1</a>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const contactLine = (c) => `<div class="contact-line"><span><b>${esc(c.name || c.role)}</b><small>${esc(c.role)} · ${esc(c.org)}</small>${c.note ? `<small>${esc(c.note)}</small>` : ''}</span>
    ${c.phone ? `<a class="btn small" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">📞 ${esc(c.phone)}</a>` : ''}</div>`;

  function contactsHtml() {
    const list = Store.all('contacts').filter((c) => c.name || c.role || c.phone || Store.isUnlocked());
    return `<div class="card"><h3>비상연락망</h3>
      ${list.length ? `<table class="contacts"><thead><tr><th>구분</th><th>담당</th><th>연락처</th><th></th></tr></thead><tbody>${list.map((c) => `<tr>
        <td>${esc(c.role) || '<span class="muted">—</span>'}<small>${esc(c.org)}</small></td><td>${esc(c.name) || '<span class="muted">작성 필요</span>'}<small>${esc(c.note)}</small></td>
        <td>${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : ''}</td>
        <td>${App.editBtn(`data-edit-contact="${c.id}"`, '✎')}</td></tr>`).join('')}</tbody></table>` : '<div class="todo">✍️ 작성 필요</div>'}
      ${App.editBtn('data-add-contact', '+ 연락처 추가')}</div>`;
  }

  function hub(base, arg) {
    const sid = arg && App.equipTabs().some((t) => t.id === arg) ? arg : '';
    return `<section class="page prep-page">
      <div class="hub-head"><h2 class="sr-only">${base === 'close' ? '정리' : '준비'}</h2>${tabsHtml(base, sid)}</div>
      ${sid ? equipHtml(sid) : base === 'close' ? routineHtml('close') : prepHome()}
      ${!sid && base === 'close' ? logsHtml() : ''}
      ${!sid && base !== 'close' ? contactsHtml() : ''}
    </section>`;
  }

  // ───────── 투어 기록 ─────────
  function logsHtml() {
    const logs = Store.all('tourLogs').slice().sort((a, b) => (b.date > a.date ? 1 : -1));
    return `<div class="card"><div class="row"><h3>투어 기록</h3><button class="btn small primary" data-add-log>+ 투어 기록 작성</button></div>
      ${logs.length ? `<ul class="log-list">${logs.map((l) => {
        const r = Store.get('routes', l.routeId);
        return `<li><b>${esc(l.date)} · ${esc(l.customer || '고객사 미기재')}</b> <span class="badge">${esc(l.tourType)}</span>
          <small>${esc(l.guide)} · ${r ? esc(r.name) : ''}${l.headcount ? ` · ${esc(l.headcount)}명` : ''}${l.minutes ? ` · ${esc(l.minutes)}분` : ''}</small>
          ${l.notes ? `<p>${esc(l.notes).replace(/\n/g, '<br>')}</p>` : ''}${App.editBtn(`data-edit-log="${l.id}"`, '✎')}</li>`;
      }).join('')}</ul>` : '<p class="muted">아직 기록이 없습니다. 투어 모드에서 “투어 종료”를 누르면 여기로 옵니다.</p>'}</div>`;
  }

  async function editLog(id) {
    if (!(await requireUnlock())) return;
    const prefs = App.prefs.load();
    let draft = {};
    try { draft = JSON.parse(sessionStorage.getItem('tdl.logDraft') || '{}'); } catch (e) { draft = {}; }
    const l = id ? Store.get('tourLogs', id) : { id: '', date: Store.today(), customer: '', tourType: prefs.tourType, guide: Store.editor, routeId: draft.routeId || prefs.routeId, headcount: '', minutes: draft.minutes || '', notes: '' };
    const stations = App.stationsSorted();
    const fields = [
      { key: 'date', label: '날짜', type: 'date' },
      { key: 'customer', label: '고객사' },
      { key: 'tourType', label: '투어 유형', type: 'select', options: ['일반', 'VIP'] },
      { key: 'guide', label: '가이드' },
      { key: 'routeId', label: '사용한 동선', type: 'select', options: Store.all('routes').map((r) => [r.id, r.name]) },
      { key: 'headcount', label: '인원', type: 'number' },
      { key: 'minutes', label: '실제 소요(분)', type: 'number' },
      { key: 'notes', label: '특이사항', type: 'textarea', rows: 3 },
    ];
    if (!id) fields.push({ key: 'questions', label: '받은 질문 (한 줄에 하나, “장소번호: 질문” 형식)', type: 'textarea', rows: 4,
      hint: `예) 9: 토트 최대 몇 단까지 쌓나요?  → Q&A에 “확인필요”로 등록됩니다. 장소번호: ${stations.map((s) => s.no).join(', ')}` });
    const res = await form(id ? '투어 기록 수정' : '투어 기록 작성', fields, l, id ? { danger: '삭제' } : null);
    try { sessionStorage.removeItem('tdl.logDraft'); } catch (e) { /* 무시 */ }
    if (!res) return;
    if (res._action === 'delete') { Store.remove('tourLogs', id); return; }
    const qs = (res.questions || '').split('\n').map((x) => x.trim()).filter(Boolean);
    delete res.questions;
    const saved = Store.upsert('tourLogs', Object.assign({}, l, res));
    qs.forEach((line) => {
      const m = line.match(/^([^:：]+)[:：]\s*(.+)$/);
      const st = m && stations.find((s) => s.no === m[1].trim());
      Store.upsert('qa', { id: '', stationId: st ? st.id : 's1', question: st ? m[2] : line, answer: '', common: false, status: '확인필요', topic: '',
        source: `투어 ${saved.date} ${saved.customer || ''}`.trim() });
    });
    toast(qs.length ? `기록 저장 · 질문 ${qs.length}건 Q&A 등록` : '기록을 저장했습니다');
  }
  App.editLog = editLog;

  // 체크 항목(공통 · 현장 체크) 편집
  async function editManual(id, phaseStation) {
    let m;
    if (id) m = Store.get('manual', id);
    else {
      const [phase, stationId] = phaseStation.split('|');
      m = { id: '', phase, stationId, section: stationId === 'common' ? 'check' : 'field', title: '', body: '', tourType: 'all', routine: '', closeRoutine: '', order: Store.all('manual').length + 1 };
    }
    const fields = [
      { key: 'title', label: '제목', required: true },
      { key: 'body', label: '설명', type: 'textarea', rows: 4, hint: '전화번호(010-…)와 주소(https://…)는 누르면 바로 연결됩니다.' },
      { key: 'tourType', label: '적용 투어', type: 'select', options: [['all', '전체'], ['일반', '일반 고객만'], ['VIP', 'VIP만']] },
    ];
    if (m.stationId !== 'common') fields.push({ key: 'stationId', label: '설비', type: 'select', options: App.equipTabs().map((t) => [t.id, t.short]).concat([['s11', '3D Sorter']]) },
      { key: 'routine', label: '오늘 루틴 순서 (비우면 루틴에서 빠짐)', type: 'number' });
    const res = await form(id ? '체크 항목 수정' : '체크 항목 추가', fields, m, id ? { danger: '삭제' } : null);
    if (!res) return;
    if (res._action === 'delete') Store.remove('manual', id); else Store.upsert('manual', Object.assign({}, m, res));
  }
  App.editManual = editManual;

  async function editContact(id) {
    const c = id ? Store.get('contacts', id) : { id: '', role: '', name: '', org: '', phone: '', note: '', stations: '' };
    const res = await form(id ? '연락처 수정' : '연락처 추가', [
      { key: 'role', label: '구분', placeholder: '예: 3D Sorter AS, WMS 담당' },
      { key: 'org', label: '소속 / 업체' },
      { key: 'name', label: '담당자' },
      { key: 'phone', label: '연락처', type: 'tel' },
      { key: 'note', label: '메모', placeholder: '예: 평일 09–18시, 긴급 시 ○○' },
      { key: 'stations', label: '관련 설비 (쉼표로 구분)', placeholder: '예: s10', hint: '설비 화면에 이 연락처가 보입니다' },
    ], c, id ? { danger: '삭제' } : null);
    if (!res) return;
    if (res._action === 'delete') Store.remove('contacts', id); else Store.upsert('contacts', Object.assign({}, c, res));
  }

  function mount(base) {
    return (root) => {
      root.addEventListener('change', (e) => {
        const c = e.target.closest('[data-mcheck]');
        if (c) { App.checks.setItem('pre', c.dataset.mcheck, c.checked); App.rerender(); }
      });
      root.addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        const d = t.dataset;
        if (d.mtype) { const p = App.prefs.load(); p.tourType = d.mtype; const r = Store.all('routes').find((x) => x.tourType === d.mtype); if (r) p.routeId = r.id; App.prefs.save(p); App.rerender(); }
        else if ('reset' in d) { if (confirm('오늘 체크 상태(준비 · 정리 · 가이드 단계)를 모두 지울까요?')) { App.checks.reset(); App.rerender(); } }
        else if (d.editManual) editManual(d.editManual);
        else if (d.addManual) editManual('', d.addManual);
        else if (d.editGuide && App.editGuide) App.editGuide(d.editGuide);
        else if (d.editContact) editContact(d.editContact);
        else if ('addContact' in d) editContact('');
        else if ('addLog' in d) editLog('');
        else if (d.editLog) editLog(d.editLog);
      });
      if (base === 'close') {
        let draft = null;
        try { draft = sessionStorage.getItem('tdl.logDraft'); } catch (e) { draft = null; }
        if (draft) setTimeout(() => editLog(''), 50);
      }
    };
  }

  App.views.prep = { nav: 'prep', render: (arg) => hub('prep', arg), mount: mount('prep') };
  App.views.close = { nav: 'close', render: (arg) => hub('close', arg), mount: mount('close') };
  // 예전 주소 호환
  App.views.pre = App.views.prep;
  App.views.post = App.views.close;
})();
