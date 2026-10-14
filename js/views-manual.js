/* 투어 전 / 투어 후: 설비별 운영 매뉴얼(오더·전원·업로드·오류), 비상연락망, 투어 기록 */
(function () {
  const { esc, $, badgeRecent, form, toast, requireUnlock } = UI;

  const SECTIONS = {
    pre: [
      ['prep', '사전 준비 항목', '시연 매뉴얼의 사전 준비 항목'],
      ['order', '사전 오더 준비', '이 설비에 미리 올려 둘 오더 — 종류, 수량, SKU, 시연 시나리오'],
      ['power', '전원 ON 절차', '켜는 순서대로 한 줄에 한 단계씩'],
      ['upload', '오더 업로드 경로', '어떤 사이트를 어떤 순서로 경유해 무엇을 누르는지'],
      ['error', '오류 대처', '한 줄에 “증상 | 조치” 형식'],
    ],
    post: [
      ['cleanup', '정리 절차', '시연 물량 원위치, 잔여 오더 처리 등'],
      ['power', '전원 OFF 절차', '끄는 순서대로 한 줄에 한 단계씩'],
      ['check', '종료 확인', '충전 위치 복귀, 에러 없음 확인 등'],
    ],
  };
  const METHODS = [['', '미정'], ['WMS→WCS', 'WMS 등록 → SO번호 → WCS 전송'], ['직접', '설비 시스템에 직접 업로드'], ['기타', '기타 (본문에 설명)']];

  // 오늘 체크 상태: 기기별·날짜별로 저장 (공유 데이터 아님)
  const checkKey = (phase) => `tdl.check.${phase}.${Store.today()}`;
  const loadChecks = (phase) => { try { return JSON.parse(localStorage.getItem(checkKey(phase)) || '{}'); } catch (e) { return {}; } };
  const saveChecks = (phase, c) => { try { localStorage.setItem(checkKey(phase), JSON.stringify(c)); } catch (e) { /* 무시 */ } };

  function methodFlow(method) {
    if (method === 'WMS→WCS') return `<ol class="flow"><li>WMS 오더 등록</li><li>SO번호 발급</li><li>WCS 전송</li><li>설비 작업 시작</li></ol>`;
    if (method === '직접') return `<ol class="flow"><li>설비 시스템 접속</li><li>오더 직접 업로드</li><li>설비 작업 시작</li></ol>`;
    if (method === '기타') return '<ol class="flow"><li>본문 참고</li></ol>';
    return '<div class="flow-empty">업로드 방식 미정 — WMS→WCS 경유인지, 설비 직접 업로드인지 지정하세요</div>';
  }

  function bodyHtml(item, hint) {
    const lines = (item.body || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return `<div class="todo">✍️ 작성 필요<small>${esc(hint)}</small></div>`;
    if (item.section === 'error') {
      return `<table class="err-table"><thead><tr><th>증상</th><th>조치</th></tr></thead><tbody>${lines.map((l) => {
        const [a, b] = l.split('|');
        return `<tr><td>${esc(a)}</td><td>${esc(b || '')}</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    const link = (s) => esc(s).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return `<ol class="steps">${lines.map((l) => `<li>${link(l)}</li>`).join('')}</ol>`;
  }

  function equipmentCard(phase, st, checks, tourType) {
    const secs = SECTIONS[phase];
    const items = Store.where('manual', (m) => m.phase === phase && m.stationId === st.id && (m.tourType === 'all' || m.tourType === tourType));
    const doneN = items.filter((m) => checks[m.id]).length;
    const written = items.filter((m) => m.body).length;
    const open = checks._open && st.id in checks._open ? checks._open[st.id] : items.some((m) => m.section === 'prep');
    return `<details class="equip card" ${open ? 'open' : ''} data-equip="${st.id}">
      <summary><span class="st-no">${esc(st.no)}</span><span class="st-body"><b>${esc(st.name)}</b>
        <small>${doneN}/${items.length} 완료 · 작성 ${written}/${items.length}</small></span>
        <span class="ring" style="--p:${items.length ? Math.round((doneN / items.length) * 100) : 0}"></span></summary>
      ${secs.map(([key, title, hint]) => items.filter((m) => m.section === key).map((m) => `
        <section class="msec">
          <header><label class="check"><input type="checkbox" data-mcheck="${m.id}"${checks[m.id] ? ' checked' : ''}><b>${esc(m.title || title)}</b></label>
            ${badgeRecent(m)}${m.tourType !== 'all' ? `<span class="badge">${esc(m.tourType)}</span>` : ''}
            ${App.editBtn(`data-edit-manual="${m.id}"`, '✎')}</header>
          ${key === 'upload' ? methodFlow(m.method) : ''}
          ${key === 'prep' ? prepHtml(m) : bodyHtml(m, hint)}
        </section>`).join('')).join('')}
      ${App.editBtn(`data-add-manual="${phase}|${st.id}"`, '+ 항목 추가')}
    </details>`;
  }

  // 사전 준비 항목: 시스템 · 비고 · 관련 절차 가이드
  function prepHtml(m) {
    const gids = String(m.guideIds || '').split(',').map((x) => x.trim()).filter(Boolean);
    const gs = gids.map((g) => Store.get('guides', g)).filter(Boolean);
    return `<div class="prep">
      ${m.system && m.system !== '-' ? `<span class="chip sys">${esc(m.system)}</span>` : ''}
      ${m.body ? `<p class="small">${esc(m.body)}</p>` : ''}
      ${gs.length ? `<div class="prep-links">${gs.map((g) => `<a class="btn small" href="#/guide/${esc(g.id)}">절차: ${esc(g.title)} ›</a>`).join('')}</div>` : ''}
    </div>`;
  }

  // 절차 가이드 목록 (사전 준비 매뉴얼)
  function guidesHtml() {
    const all = App.guidesFor(null);
    if (!all.length) return '';
    const ov = Store.setting('prepOverviewImage', '');
    const group = (ph, title) => {
      const gs = all.filter((g) => g.phase === ph);
      return gs.length ? `<div class="g-group"><h4>${title}</h4>${gs.map(App.guideLink).join('')}</div>` : '';
    };
    return `<div class="card guides-card"><h3>시연 매뉴얼 절차</h3>
      <p class="small muted">메뉴 위치가 표시된 매뉴얼 화면을 단계별로 보여 줍니다.</p>
      ${ov ? `<details class="ov"><summary>사전 준비 항목 한눈에 보기 (매뉴얼 표)</summary>${App.shot(ov)}</details>` : ''}
      <div class="g-groups">${group('pre', '사전 준비 (시스템)')}${group('field', '현장 조작')}${group('etc', '기타 가이드')}</div></div>`;
  }

  function commonList(phase, checks, tourType) {
    const items = Store.where('manual', (m) => m.phase === phase && m.stationId === 'common' && (m.tourType === 'all' || m.tourType === tourType)).sort((a, b) => a.order - b.order);
    return `<ul class="checklist">${items.map((m) => `<li><label class="check"><input type="checkbox" data-mcheck="${m.id}"${checks[m.id] ? ' checked' : ''}><span>${esc(m.title)}${m.body ? `<small>${esc(m.body)}</small>` : ''}</span></label>
      ${m.tourType !== 'all' ? `<span class="badge">${esc(m.tourType)}</span>` : ''}${badgeRecent(m)}${App.editBtn(`data-edit-manual="${m.id}"`, '✎')}</li>`).join('')}</ul>
      ${App.editBtn(`data-add-manual="${phase}|common"`, '+ 공통 항목 추가')}`;
  }

  function contactsHtml() {
    const list = Store.all('contacts').filter((c) => c.name || c.role || c.phone || Store.isUnlocked());
    return `<div class="card"><h3>비상연락망</h3>
      ${list.length ? `<table class="contacts"><thead><tr><th>구분</th><th>담당</th><th>연락처</th><th></th></tr></thead><tbody>${list.map((c) => `<tr>
        <td>${esc(c.role) || '<span class="muted">—</span>'}<small>${esc(c.org)}</small></td><td>${esc(c.name) || '<span class="muted">작성 필요</span>'}<small>${esc(c.note)}</small></td>
        <td>${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : ''}</td>
        <td>${App.editBtn(`data-edit-contact="${c.id}"`, '✎')}</td></tr>`).join('')}</tbody></table>` : '<div class="todo">✍️ 작성 필요<small>설비 업체 AS, 센터 담당자, 시스템(WMS/WCS) 담당, 안전 담당 등</small></div>'}
      ${App.editBtn('data-add-contact', '+ 연락처 추가')}</div>`;
  }

  function page(phase) {
    const prefs = App.prefs.load();
    const checks = loadChecks(phase);
    const tourType = prefs.tourType || '일반';
    const all = Store.where('manual', (m) => m.phase === phase && (m.tourType === 'all' || m.tourType === tourType));
    const doneN = all.filter((m) => checks[m.id]).length;
    const equip = App.stationsSorted().filter((s) => s.equipment && !s.optional);
    const isPre = phase === 'pre';
    return `<section class="page manual-page">
      <header class="page-head"><div><h2>${isPre ? '투어 전 준비' : '투어 후 정리'}</h2>
        <small class="muted">${Store.today()} · 체크 상태는 이 기기에 오늘 날짜로 저장됩니다</small></div>
        <div class="seg" role="group" aria-label="투어 유형">${['일반', 'VIP'].map((t) => `<button data-mtype="${t}" class="${tourType === t ? 'on' : ''}">${t === '일반' ? '일반 고객' : 'VIP'}</button>`).join('')}</div></header>
      <div class="progress card"><div class="bar"><span style="width:${all.length ? Math.round((doneN / all.length) * 100) : 0}%"></span></div>
        <span><b>${doneN}</b> / ${all.length} 완료</span><button class="btn small ghost" data-mreset>오늘 체크 초기화</button></div>
      ${isPre ? guidesHtml() : ''}
      <div class="card"><h3>공통 ${isPre ? '준비' : '정리'}</h3>${commonList(phase, checks, tourType)}</div>
      <h3 class="section-title">설비별 ${isPre ? '준비' : '정리 (정리 · 전원 OFF · 확인)'}</h3>
      <div class="equip-list">${equip.map((st) => equipmentCard(phase, st, checks, tourType)).join('')}</div>
      ${contactsHtml()}
      ${!isPre ? logsHtml() : ''}
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
    try { sessionStorage.removeItem('tdl.logDraft'); } catch (e) { /* 무시 */ }
    toast(qs.length ? `기록 저장 · 질문 ${qs.length}건 Q&A 등록` : '기록을 저장했습니다');
  }

  async function editManual(id, phaseStation) {
    let m;
    if (id) m = Store.get('manual', id);
    else {
      const [phase, stationId] = phaseStation.split('|');
      m = { id: '', phase, stationId, section: stationId === 'common' ? 'check' : SECTIONS[phase][0][0], title: '', body: '', method: '', tourType: 'all', order: Store.all('manual').length + 1 };
    }
    const secOpts = m.stationId === 'common' ? [['check', '체크 항목']] : SECTIONS[m.phase].map(([k, t]) => [k, t]);
    const fields = [
      { key: 'section', label: '구분', type: 'select', options: secOpts },
      { key: 'title', label: '제목', required: true },
      { key: 'body', label: '내용', type: 'textarea', rows: 8, hint: '한 줄에 한 단계. 오류 대처는 “증상 | 조치”. 사이트 주소(https://…)는 링크가 됩니다.' },
      { key: 'tourType', label: '적용 투어', type: 'select', options: [['all', '전체'], ['일반', '일반 고객만'], ['VIP', 'VIP만']] },
    ];
    if (m.section === 'upload' || (!id && m.stationId !== 'common')) fields.splice(2, 0, { key: 'method', label: '업로드 방식 (오더 업로드 경로일 때)', type: 'select', options: METHODS });
    if (m.section === 'prep') {
      fields[2] = { key: 'body', label: '비고', type: 'textarea', rows: 3 };
      fields.splice(2, 0, { key: 'system', label: '시스템', placeholder: '예: GO Wing & GSI' },
        { key: 'guideIds', label: '관련 절차 가이드 id (쉼표로 구분)', hint: '예: g_in,g_out — 더보기가 아닌 투어 전 페이지의 가이드 목록 주소(#/guide/…) 끝 부분' });
    }
    const res = await form(id ? '매뉴얼 항목 수정' : '매뉴얼 항목 추가', fields, m, id ? { danger: '삭제' } : null);
    if (!res) return;
    if (res._action === 'delete') Store.remove('manual', id); else Store.upsert('manual', Object.assign({}, m, res));
  }

  async function editContact(id) {
    const c = id ? Store.get('contacts', id) : { id: '', role: '', name: '', org: '', phone: '', note: '' };
    const res = await form(id ? '연락처 수정' : '연락처 추가', [
      { key: 'role', label: '구분', placeholder: '예: 3D Sorter AS, WMS 담당' },
      { key: 'org', label: '소속 / 업체' },
      { key: 'name', label: '담당자' },
      { key: 'phone', label: '연락처', type: 'tel' },
      { key: 'note', label: '메모', placeholder: '예: 평일 09–18시, 긴급 시 ○○' },
    ], c, id ? { danger: '삭제' } : null);
    if (!res) return;
    if (res._action === 'delete') Store.remove('contacts', id); else Store.upsert('contacts', Object.assign({}, c, res));
  }

  function mount(phase) {
    return (root) => {
      App.loadShots(root);
      root.addEventListener('change', (e) => {
        const c = e.target.closest('[data-mcheck]');
        if (!c) return;
        const checks = loadChecks(phase);
        checks[c.dataset.mcheck] = c.checked;
        saveChecks(phase, checks);
        App.rerender();
      });
      root.addEventListener('toggle', (e) => {
        const d = e.target.closest && e.target.closest('[data-equip]');
        if (!d) return;
        const checks = loadChecks(phase);
        checks._open = checks._open || {};
        checks._open[d.dataset.equip] = d.open;
        saveChecks(phase, checks);
      }, true);
      root.addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        const d = t.dataset;
        if (d.mtype) { const p = App.prefs.load(); p.tourType = d.mtype; App.prefs.save(p); App.rerender(); }
        else if ('mreset' in d) { if (confirm('오늘 체크 상태를 모두 지울까요?')) { saveChecks(phase, {}); App.rerender(); } }
        else if (d.editManual) editManual(d.editManual);
        else if (d.addManual) editManual('', d.addManual);
        else if (d.editContact) editContact(d.editContact);
        else if ('addContact' in d) editContact('');
        else if ('addLog' in d) editLog('');
        else if (d.editLog) editLog(d.editLog);
      });
      if (phase === 'post') {
        let draft = null;
        try { draft = sessionStorage.getItem('tdl.logDraft'); } catch (e) { draft = null; }
        if (draft) setTimeout(() => editLog(''), 50);
      }
    };
  }

  App.views.pre = { render: () => page('pre'), mount: mount('pre') };
  App.views.post = { render: () => page('post'), mount: mount('post') };
})();
