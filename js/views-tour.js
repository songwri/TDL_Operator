/* 투어 중: 도면 + 장소 목록, 장소 상세, 휴대폰용 투어 모드 */
(function () {
  const { esc, $, $$, narration, badgeRecent, form, requireUnlock, toast } = UI;

  // ───────── 장소 상세 패널 조각 (상세 화면과 투어 모드에서 공용) ─────────
  const Panels = {
    // 한국어 / English 전환 + 영문 농담 켜기·끄기 (투어 설정 · 장소 상세 · 투어 모드 공용)
    langCtl(prefs) {
      const en = prefs.lang === 'en';
      return `<div class="seg" role="group" aria-label="안내 언어">
          <button data-lang="ko" class="${en ? '' : 'on'}">한국어</button><button data-lang="en" class="${en ? 'on' : ''}">English</button></div>
        ${en ? `<button class="btn small ghost joke-toggle${prefs.gloss === false ? '' : ' on'}" data-gloss aria-pressed="${prefs.gloss === false ? 'false' : 'true'}">가 한글 뜻</button>` : ''}
        ${en ? `<button class="btn small ghost joke-toggle${prefs.joke === false ? '' : ' on'}" data-joke aria-pressed="${prefs.joke === false ? 'false' : 'true'}">😄 농담</button>` : ''}`;
    },

    narration(st, prefs, opts) {
      const en = prefs.lang === 'en';
      const text = en ? st.scriptEn : st.script;
      const empty = en ? '영문 대본이 아직 없습니다. “✎ 대사 수정”에서 추가할 수 있습니다.' : '대사가 아직 없습니다.';
      return `<div class="nar-toolbar">
          ${Panels.langCtl(prefs)}
          ${opts && opts.fontCtl ? '<div class="font-ctl"><button data-font="-1" aria-label="글자 작게">가-</button><button data-font="1" aria-label="글자 크게">가+</button></div>' : ''}
          ${App.editBtn(`data-edit-station="${st.id}"`, '✎ 대사 수정')}
        </div>
        ${st.tips ? `<div class="tip"><b>가이드 팁</b><br>${esc(st.tips).replace(/\n/g, "<br>")}</div>` : ''}
        <div class="narration${en ? ' en' : ''}" lang="${en ? 'en' : 'ko'}" style="--nar-size:${prefs.font || 18}px">${text ? narration(text, { lang: prefs.lang, joke: prefs.joke !== false, gloss: prefs.gloss !== false }) : `<p class="muted">${empty}</p>`}</div>
        ${Panels.transition(st, prefs)}`;
    },

    // 동선마다 다른 “다음 장소로 이동” 멘트
    transition(st, prefs) {
      const route = App.currentRoute();
      const stops = App.routeStops(route);
      const i = stops.indexOf(st.id);
      if (i < 0 || i === stops.length - 1) return '';
      const next = Store.get('stations', stops[i + 1]);
      const row = Store.where('transitions', (t) => t.routeId === route.id && t.fromStationId === st.id && t.toStationId === next.id)[0];
      const en = prefs && prefs.lang === 'en';
      const txt = row ? (en ? row.textEn : row.text) : '';
      if (!txt && !Store.isUnlocked()) return '';   // 비전홀 구간처럼 대사 안에 이동 멘트가 있는 곳은 빈 상자를 숨김
      return `<div class="transition" style="--nar-size:${(prefs && prefs.font) || 18}px">
        <div class="tr-head">➜ 이동 멘트 · 다음 ${esc(next.no)}. ${esc(next.name)}
          ${row && row.status === '확인필요' ? '<span class="badge warn">초안 · 확인필요</span>' : ''}${badgeRecent(row)}
          <span class="grow"></span>${App.editBtn(`data-edit-transition="${route.id}|${st.id}|${next.id}"`, row ? '✎' : '+ 멘트 추가')}</div>
        ${txt ? (en ? `<div class="en" lang="en">${narration(txt, { lang: 'en', joke: prefs.joke !== false, gloss: prefs.gloss !== false })}</div>` : `<p>${esc(txt)}</p>`) : `<small class="muted">${esc(route.name)}에 등록된 ${en ? '영문 ' : ''}이동 멘트가 없습니다.</small>`}
      </div>`;
    },

    actions(st, prefs, checks) {
      const list = Store.where('actions', (a) => a.stationId === st.id && (a.tourType === 'all' || a.tourType === prefs.tourType)).sort((a, b) => a.order - b.order);
      const biz = st.id === 's2' ? Panels.business() : '';
      const vids = Panels.videos(st);
      const gs = App.guidesFor ? App.guidesFor(st.id, ['demo', 'ref']) : [];
      const guideBox = gs.length ? `<div class="card soft"><h4>시연 매뉴얼</h4>${gs.map(App.guideLink).join('')}</div>` : '';
      return `${guideBox}${biz}${vids}
        <ul class="checklist">${list.map((a) => `<li>
          <label class="check"><input type="checkbox" data-check="${a.id}"${checks && checks[a.id] ? ' checked' : ''}><span>${esc(a.text)}</span></label>
          ${a.tourType !== 'all' ? `<span class="badge">${esc(a.tourType)}</span>` : ''}${badgeRecent(a)}
          ${App.editBtn(`data-edit-action="${a.id}"`, '✎')}</li>`).join('') || '<li class="muted">등록된 행동이 없습니다.</li>'}</ul>
        ${App.editBtn(`data-add-action="${st.id}"`, '+ 행동 추가')}`;
    },

    business() {
      const all = Store.settingJson('businesses', []);
      return `<div class="card soft"><h4>LX판토스 비즈니스 화면 (6개)</h4>
        <div class="chips">${all.map((b) => `<span class="chip">${esc(b)}</span>`).join('')}</div>
        <small class="muted">방문 고객사의 사업영역에 맞는 화면 앞에서 설명하세요.</small></div>`;
    },

    videos(st) {
      const vids = Store.where('videos', (v) => v.stationId === st.id);
      if (!vids.length && !Store.isUnlocked()) return '';
      return `<div class="card soft"><h4>영상</h4><ul class="plain">${vids.map((v) => `<li><b>▶ ${esc(v.name)}</b>${v.purpose ? ` — ${esc(v.purpose)}` : ''}${v.note ? `<br><small class="muted">${esc(v.note)}</small>` : ''} ${badgeRecent(v)} ${App.editBtn(`data-edit-video="${v.id}"`, '✎')}</li>`).join('')}</ul>
        ${App.editBtn(`data-add-video="${st.id}"`, '+ 영상 추가')}</div>`;
    },

    specs(st) {
      if (!st.equipment) return '<p class="muted">설비 스펙 대상 장소가 아닙니다. 영상과 행동은 “체크” 탭에서 볼 수 있습니다.</p>';
      const fields = Store.settingJson('specFields', []);
      const rows = Store.where('specs', (s) => s.stationId === st.id);
      const groups = Array.from(new Set(rows.map((r) => r.group || ''))); if (!groups.length) groups.push('');
      const LEGACY_PRICE = ['투자비', '대당 가격'];           // 예전 데이터의 가격 칸 이름
      const SPECIAL = ['제조사 · 모델', '오픈프라이스', '당사 투자비'].concat(LEGACY_PRICE);
      const warn = (r) => r && r.status === '확인필요';
      const badges = (r) => `${warn(r) ? '<span class="badge warn">확인필요</span>' : ''}${badgeRecent(r)}`;
      const edit = (g, f) => App.editBtn(`data-edit-spec="${st.id}|${esc(g)}|${esc(f)}"`, '✎');
      return groups.map((g) => {
        const gRows = rows.filter((r) => (r.group || '') === g);
        const get = (f) => gRows.find((x) => x.field === f && x.value) || gRows.find((x) => x.field === f);
        const model = get('제조사 · 모델');
        const invest = get('당사 투자비') || LEGACY_PRICE.map(get).find(Boolean);
        const open = get('오픈프라이스');
        const priceTile = (r, f, label, sub) => `<div class="price${r && r.value ? '' : ' empty'}${warn(r) ? ' warn' : ''}">
            <div class="price-k">${label}<small>${sub}</small></div>
            <div class="price-v">${r && r.value ? Panels.specValue(r.value) : '<span class="muted">미입력</span>'} ${badges(r)}</div>
            ${r && r.note ? `<small class="note">${esc(r.note)}</small>` : ''}${edit(g, r ? r.field : f)}</div>`;
        const rest = fields.filter((f) => !SPECIAL.includes(f)).concat(gRows.map((r) => r.field).filter((f) => !fields.includes(f) && !SPECIAL.includes(f)));
        const uniq = Array.from(new Set(rest));
        const filled = uniq.filter((f) => { const r = get(f); return r && r.value; }).length;
        return `<section class="spec-group">
          <header class="spec-head"><div>${g ? `<h4>${esc(g)}</h4>` : ''}
            <p class="spec-model">${model && model.value ? esc(model.value) : '<span class="muted">제조사 · 모델 미입력</span>'} ${badges(model)}</p>
            ${model && model.note ? `<small class="note">${esc(model.note)}</small>` : ''}</div>${edit(g, '제조사 · 모델')}</header>
          <div class="price-pair">
            ${priceTile(open, '오픈프라이스', '오픈프라이스', '제조사 공개 가격')}
            ${priceTile(invest, '당사 투자비', '당사 투자비', '매뉴얼 기준 도입·투자 금액')}
          </div>
          <dl class="spec">${uniq.map((f) => {
            const r = get(f);
            const empty = !r || !r.value;
            if (empty && !Panels.showEmpty && !warn(r)) return '';
            const ref = f === '참고 · 비교';
            return `<div class="spec-row${empty ? ' empty' : ''}${warn(r) ? ' warn' : ''}${f === '제조사 공개 사양' || ref ? ' wide' : ''}${ref ? ' ref' : ''}">
              <dt>${esc(f)} ${badges(r)}</dt>
              <dd>${empty ? '<span class="muted">미입력</span>' : Panels.specValue(r.value, f === '제조사 공개 사양' || ref)}
                ${r && r.note ? `<small class="note">${esc(r.note)}</small>` : ''}</dd>
              ${edit(g, f)}</div>`;
          }).join('')}</dl>
          <div class="spec-meta"><span class="muted">표준양식 ${filled}/${uniq.length} 입력</span>
            <button class="btn small ghost" data-spec-empty>${Panels.showEmpty ? '빈 항목 숨기기' : `빈 항목 ${uniq.length - filled}개 보기`}</button></div>
        </section>`;
      }).join('') + (Store.isUnlocked() ? `<button class="btn small ghost" data-add-spec-group="${st.id}">+ 스펙 그룹(설비) 추가</button>` : '');
    },

    // 여러 줄 값은 목록으로, "항목: 값" 줄은 항목과 값을 나눠 보여 준다
    specValue(value, forceList) {
      const lines = String(value).split('\n').map((l) => l.trim()).filter(Boolean);
      const fmt = (t) => UI.markPlaceholders(esc(t));
      if (lines.length < 2 && !forceList) return `<span class="spec-v">${fmt(lines[0] || '')}</span>`;
      return `<ul class="spec-lines">${lines.map((l) => {
        const m = l.match(/^([^:：]{1,16})[:：]\s*(.+)$/);
        return m ? `<li><span class="k">${fmt(m[1])}</span><span class="v">${fmt(m[2])}</span></li>` : `<li><span class="v">${fmt(l)}</span></li>`;
      }).join('')}</ul>`;
    },

    qa(st, filter) {
      const q = (filter || '').toLowerCase();
      const list = Store.where('qa', (x) => x.stationId === st.id && (!q || (x.question + x.answer).toLowerCase().includes(q)))
        .sort((a, b) => (b.common - a.common) || ((b.updatedAt || b.createdAt || '') > (a.updatedAt || a.createdAt || '') ? 1 : -1));
      return `<div class="qa-tools"><input type="search" placeholder="이 장소 질문 검색" data-qa-filter value="${esc(filter || '')}" aria-label="질문 검색">
          <button class="btn small primary" data-add-qa="${st.id}">+ 받은 질문 추가</button></div>
        ${Panels.qaList(list)}`;
    },

    qaList(list, showStation) {
      if (!list.length) return '<p class="muted">질문이 없습니다.</p>';
      return `<ul class="qa-list">${list.map((x) => {
        const st = showStation ? Store.get('stations', x.stationId) : null;
        return `<li class="qa${x.status === '확인필요' ? ' warn' : ''}">
          <details><summary><span class="q">Q.</span> ${esc(x.question)}
            <span class="qa-badges">${x.common ? '<span class="badge common">공통</span>' : ''}${x.status === '확인필요' ? '<span class="badge warn">확인필요</span>' : ''}${badgeRecent(x)}${x.topic ? `<span class="badge">${esc(x.topic)}</span>` : ''}${st ? `<span class="badge station">${esc(st.no)} ${esc(st.name)}</span>` : ''}</span></summary>
            <div class="a"><span class="q">A.</span> ${x.answer ? UI.markPlaceholders(esc(x.answer)).replace(/\n/g, '<br>') : '<span class="muted">답변 미작성</span>'}</div>
            <div class="qa-foot"><small class="muted">${esc(x.source || '')} · ${esc(x.createdBy || '')} ${esc(x.createdAt || '')}${x.updatedAt ? ` · 수정 ${esc(x.updatedBy || '')} ${esc(x.updatedAt)}` : ''}</small>
              <button class="btn small ghost" data-edit-qa="${x.id}">✎ 수정</button></div>
          </details></li>`;
      }).join('')}</ul>`;
    },
  };

  // ───────── 편집 핸들러 (공용) ─────────
  const Edit = {
    async station(id) {
      const st = Store.get('stations', id);
      const res = await form(`${st.no}. ${st.name} — 대사 수정`, [
        { key: 'name', label: '장소 이름' },
        { key: 'minutes', label: '목표 시간(분)', type: 'number' },
        { key: 'script', label: '대사 (한국어)', type: 'textarea', rows: 10, hint: '[소제목] 한 줄은 구간 제목, 줄 맨 앞 (영상 Play) 같은 괄호는 행동 칩으로 보입니다.' },
        { key: 'scriptEn', label: '대사 (English)', type: 'textarea', rows: 10, hint: '농담은 {{ 이렇게 }} 감싸면 “농담 넣기/빼기” 스위치로 켜고 끌 수 있습니다. [ ] 는 안내 표시(소리 내어 읽지 않음).' },
        { key: 'tips', label: '가이드 팁 (주의사항)', type: 'textarea', rows: 3 },
      ], st);
      if (res) Store.upsert('stations', Object.assign({}, st, res));
    },
    async action(id, stationId) {
      const a = id ? Store.get('actions', id) : { id: '', stationId, text: '', tourType: 'all', order: Store.all('actions').length + 1 };
      const res = await form(id ? '행동 수정' : '행동 추가', [
        { key: 'text', label: '할 일', type: 'textarea', rows: 3, required: true },
        { key: 'tourType', label: '적용 투어', type: 'select', options: [['all', '전체'], ['일반', '일반 고객만'], ['VIP', 'VIP만']] },
      ], a, id ? { danger: '삭제' } : null);
      if (!res) return;
      if (res._action === 'delete') Store.remove('actions', id); else Store.upsert('actions', Object.assign({}, a, res));
    },
    async video(id, stationId) {
      const v = id ? Store.get('videos', id) : { id: '', stationId, name: '', purpose: '', note: '' };
      const res = await form(id ? '영상 수정' : '영상 추가', [
        { key: 'name', label: '영상 이름', required: true },
        { key: 'purpose', label: '언제 재생하나', type: 'textarea', rows: 2 },
        { key: 'note', label: '메모 (재생 방법, 길이 등)', type: 'textarea', rows: 2 },
      ], v, id ? { danger: '삭제' } : null);
      if (!res) return;
      if (res._action === 'delete') Store.remove('videos', id); else Store.upsert('videos', Object.assign({}, v, res));
    },
    async spec(key) {
      const [stationId, group, field] = key.split('|');
      const fields = Store.settingJson('specFields', []);
      const r = Store.where('specs', (s) => s.stationId === stationId && (s.group || '') === group && s.field === field)[0]
        || { id: '', stationId, group, field, value: '', status: '', note: '', order: fields.indexOf(field) };
      const res = await form(`${field}${group ? ` (${group})` : ''}`, [
        { key: 'value', label: '값', type: 'textarea', rows: 3 },
        { key: 'status', label: '상태', type: 'select', options: [['', '—'], ['확정', '확정'], ['확인필요', '확인필요']] },
        { key: 'note', label: '메모 / 출처', type: 'textarea', rows: 2 },
      ], r, r.id ? { danger: '값 지우기' } : null);
      if (!res) return;
      if (res._action === 'delete') Store.remove('specs', r.id); else Store.upsert('specs', Object.assign({}, r, res));
    },
    async transition(key) {
      const [routeId, from, to] = key.split('|');
      const r = Store.where('transitions', (t) => t.routeId === routeId && t.fromStationId === from && t.toStationId === to)[0]
        || { id: '', routeId, fromStationId: from, toStationId: to, text: '', textEn: '', status: '확정' };
      const a = Store.get('stations', from), b = Store.get('stations', to), route = Store.get('routes', routeId);
      const res = await form(`이동 멘트 · ${a.no} → ${b.no}`, [
        { key: 'text', label: `${route.name}: ${a.name} → ${b.name}`, type: 'textarea', rows: 4 },
        { key: 'textEn', label: 'English', type: 'textarea', rows: 3 },
        { key: 'status', label: '상태', type: 'select', options: ['확정', '확인필요'] },
      ], r, r.id ? { danger: '삭제' } : null);
      if (!res) return;
      if (res._action === 'delete') Store.remove('transitions', r.id); else Store.upsert('transitions', Object.assign({}, r, res));
    },
    async specGroup(stationId) {
      const res = await form('스펙 그룹 추가', [{ key: 'group', label: '그룹(설비) 이름', required: true, hint: '예: 휴머노이드처럼 한 장소에 설비가 둘 이상일 때' }]);
      if (!res) return;
      Store.upsert('specs', { id: '', stationId, group: res.group, field: '솔루션 구성', value: '', status: '', note: '', order: 0 });
    },
    async qa(id, stationId) {
      if (!(await requireUnlock())) return;
      const stations = App.stationsSorted();
      const x = id ? Store.get('qa', id) : { id: '', stationId: stationId || 's1', question: '', answer: '', common: false, status: '확인필요', topic: '', source: `투어 ${Store.today()}` };
      const res = await form(id ? '질문 수정' : '받은 질문 추가', [
        { key: 'stationId', label: '장소', type: 'select', options: stations.map((s) => [s.id, `${s.no}. ${s.name}`]) },
        { key: 'question', label: '질문', type: 'textarea', rows: 3, required: true },
        { key: 'answer', label: '답변', type: 'textarea', rows: 5, hint: '현장에서 답을 몰랐다면 비워 두고 상태를 “확인필요”로 두세요.' },
        { key: 'status', label: '상태', type: 'select', options: ['확인필요', '확정'] },
        { key: 'common', label: '', type: 'checkbox', checkLabel: '공통 질문 (여러 설비에서 자주 나옴)' },
        { key: 'topic', label: '세부 설비 (선택)', placeholder: '예: 휴머노이드' },
        { key: 'source', label: '출처', hint: '예: 투어 2026-10-14 ○○사' },
      ], x, id ? { danger: '삭제' } : null);
      if (!res) return;
      if (res._action === 'delete') Store.remove('qa', id);
      else { Store.upsert('qa', Object.assign({}, x, res)); toast('저장했습니다'); }
    },
  };

  function bindCommon(root, state) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button,[data-check]');
      if (!t) return;
      const d = t.dataset;
      if (d.lang) { const p = App.prefs.load(); p.lang = d.lang; App.prefs.save(p); App.rerender(); }
      else if ('joke' in d) { const p = App.prefs.load(); p.joke = p.joke === false; App.prefs.save(p); App.rerender(); }
      else if ('gloss' in d) { const p = App.prefs.load(); p.gloss = p.gloss === false; App.prefs.save(p); App.rerender(); }
      else if (d.font) { const p = App.prefs.load(); p.font = Math.max(14, Math.min(30, (p.font || 18) + Number(d.font) * 2)); App.prefs.save(p); App.rerender(); }
      else if (d.editStation) Edit.station(d.editStation);
      else if (d.editAction) Edit.action(d.editAction);
      else if (d.addAction) Edit.action('', d.addAction);
      else if (d.editVideo) Edit.video(d.editVideo);
      else if (d.addVideo) Edit.video('', d.addVideo);
      else if (d.editSpec) Edit.spec(d.editSpec);
      else if (d.addSpecGroup) Edit.specGroup(d.addSpecGroup);
      else if (d.editTransition) Edit.transition(d.editTransition);
      else if ('specEmpty' in d) { Panels.showEmpty = !Panels.showEmpty; App.rerender(); }
      else if (d.editQa) Edit.qa(d.editQa);
      else if (d.addQa) Edit.qa('', d.addQa);
      else if (d.tab && state) { state.tab = d.tab; App.rerender(); }
    });
    root.addEventListener('change', (e) => {
      const c = e.target.closest('[data-check]');
      if (c && state && state.checks) { state.checks[c.dataset.check] = c.checked; if (state.saveChecks) state.saveChecks(); }
    });
    root.addEventListener('input', (e) => {
      const f = e.target.closest('[data-qa-filter]');
      if (f && state) {
        state.qaFilter = f.value;
        const box = root.querySelector('.qa-list') || root.querySelector('.qa-tools + p');
        const st = Store.get('stations', state.stationId);
        const html = Panels.qa(st, f.value);
        const tmp = document.createElement('div'); tmp.innerHTML = html;
        const newList = tmp.querySelector('.qa-list') || tmp.querySelector('.qa-tools + p');
        if (box && newList) box.replaceWith(newList);
      }
    });
  }

  function tabsHtml(st, tab) {
    const qaN = Store.where('qa', (x) => x.stationId === st.id).length;
    const tabs = [['nar', '나레이션']].concat(st.equipment ? [['spec', '스펙']] : [], [['qa', `Q&A ${qaN}`], ['act', '체크']]);
    if (tab === 'spec' && !st.equipment) tab = 'nar';
    return `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  function tabBody(st, tab, prefs, state) {
    if (tab === 'spec' && st.equipment) return Panels.specs(st);
    if (tab === 'qa') return Panels.qa(st, state.qaFilter);
    if (tab === 'act') return Panels.actions(st, prefs, state.checks);
    return Panels.narration(st, prefs, { fontCtl: true });
  }

  // ───────── 투어 중 (메인) ─────────
  App.views.tour = {
    render() {
      const prefs = App.prefs.load();
      const route = App.currentRoute();
      const order = App.stopOrder(route);
      const stops = App.routeStops(route).map((id) => Store.get('stations', id)).filter(Boolean);
      const others = App.stationsSorted().filter((s) => !order[s.id]);
      const card = (s) => `<a class="st-card" href="#/station/${s.id}">
          <span class="st-no${s.optional ? ' opt' : ''}">${esc(s.no)}</span>
          <span class="st-body"><b>${esc(s.name)}</b><small>${esc(s.zone)} · ${esc(s.minutes)}분${App.pendingCount(s.id) ? ` · <span class="warn-text">확인필요 ${App.pendingCount(s.id)}</span>` : ''}</small></span>
          ${badgeRecent(s)}<span class="chev" aria-hidden="true">›</span></a>`;
      return `<section class="page tour-page">
        <div class="tour-setup card">
          <div class="row">
            <div class="seg big" role="group" aria-label="투어 유형">${['일반', 'VIP'].map((t) => `<button data-type="${t}" class="${prefs.tourType === t ? 'on' : ''}">${t === '일반' ? '일반 고객' : 'VIP'}</button>`).join('')}</div>
            <span class="route-name muted">${esc(route.name)}</span>
          </div>
          <div class="row lang-row"><span class="muted small">안내 언어</span>${Panels.langCtl(prefs)}</div>
          <div class="row summary"><span>정거장 <b>${stops.length}</b>곳 · 예상 <b>${App.minutesOf(route)}</b>분</span>
            <a class="btn primary big" href="#/run">▶ 투어 모드 시작</a></div>
          ${route.description ? `<small class="muted">${esc(route.description)}</small>` : ''}
        </div>
        <div class="tour-grid">
          <div class="map-wrap card">${FloorPlan.render({ stations: Store.all('stations'), points: App.routePoints(route), stopOrder: order, dimOthers: true })}
            <small class="muted">핀을 누르면 장소별 대사·스펙·Q&A가 열립니다.</small></div>
          <div class="st-list">
            <h3>이 동선의 순서</h3>${stops.map(card).join('')}
            ${others.length ? `<h3 class="muted">동선 밖 장소</h3>${others.map(card).join('')}` : ''}
          </div>
        </div></section>`;
    },
    mount(root) {
      root.addEventListener('click', (e) => {
        const pin = e.target.closest('[data-station]');
        if (pin) { App.navigate('#/station/' + pin.dataset.station); return; }
        const t = e.target.closest('button'); if (!t) return;
        const p = App.prefs.load();
        if (t.dataset.type) {
          p.tourType = t.dataset.type;
          const r = Store.all('routes').find((x) => x.tourType === p.tourType);
          if (r) p.routeId = r.id;
          App.prefs.save(p); App.rerender();
        } else if (t.dataset.lang) {
          p.lang = t.dataset.lang; App.prefs.save(p); App.rerender();
        } else if ('joke' in t.dataset) {
          p.joke = p.joke === false; App.prefs.save(p); App.rerender();
        } else if ('gloss' in t.dataset) {
          p.gloss = p.gloss === false; App.prefs.save(p); App.rerender();
        } else if (t.dataset.biz) {
          const b = t.dataset.biz; p.biz = p.biz || [];
          p.biz = p.biz.includes(b) ? p.biz.filter((x) => x !== b) : p.biz.concat(b);
          App.prefs.save(p); App.rerender();
        }
      });
      root.addEventListener('keydown', (e) => { const pin = e.target.closest('[data-station]'); if (pin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); App.navigate('#/station/' + pin.dataset.station); } });
      root.addEventListener('change', (e) => {
        const p = App.prefs.load();
      });
    },
  };

  // ───────── 장소 상세 ─────────
  const stationState = { tab: 'nar', qaFilter: '', checks: {}, stationId: '' };
  App.views.station = {
    nav: 'tour',
    render(id) {
      const st = Store.get('stations', id);
      if (!st) return '<p class="page">장소를 찾을 수 없습니다.</p>';
      if (stationState.stationId !== id) Object.assign(stationState, { stationId: id, qaFilter: '' });
      const prefs = App.prefs.load();
      const route = App.currentRoute();
      const stops = App.routeStops(route);
      const i = stops.indexOf(id);
      const prev = i > 0 ? Store.get('stations', stops[i - 1]) : null;
      const next = i >= 0 && i < stops.length - 1 ? Store.get('stations', stops[i + 1]) : null;
      return `<section class="page station-page">
        <a class="back" href="#/tour">‹ 투어 중</a>
        <header class="st-head"><span class="st-no big${st.optional ? ' opt' : ''}">${esc(st.no)}</span>
          <div><h2>${esc(st.name)} ${badgeRecent(st)}</h2><small class="muted">${esc(st.zone)} · 목표 ${esc(st.minutes)}분${i >= 0 ? ` · ${esc(route.name)} ${i + 1}/${stops.length}번째` : ''}</small></div></header>
        <div class="station-grid">
          <div class="mini-map card">${FloorPlan.render({ stations: Store.all('stations'), points: App.routePoints(route), activeId: id, dimOthers: true })}</div>
          <div class="card">${tabsHtml(st, stationState.tab)}<div class="tab-body">${tabBody(st, stationState.tab, prefs, stationState)}</div></div>
        </div>
        <nav class="pager">${prev ? `<a class="btn ghost" href="#/station/${prev.id}">‹ ${esc(prev.no)}. ${esc(prev.name)}</a>` : '<span></span>'}
          ${next ? `<a class="btn ghost" href="#/station/${next.id}">${esc(next.no)}. ${esc(next.name)} ›</a>` : ''}</nav>
      </section>`;
    },
    mount(root) {
      bindCommon(root, stationState);
      root.addEventListener('click', (e) => { const pin = e.target.closest('[data-station]'); if (pin) App.navigate('#/station/' + pin.dataset.station); });
    },
  };

  // ───────── 투어 모드 (휴대폰) ─────────
  const run = {
    state: null,
    load() {
      if (!this.state) {
        try { this.state = JSON.parse(sessionStorage.getItem('tdl.run') || 'null'); } catch (e) { this.state = null; }
      }
      const route = App.currentRoute();
      if (!this.state || this.state.routeId !== route.id) {
        this.state = { routeId: route.id, idx: 0, start: Date.now(), stepStart: Date.now(), tab: 'nar', checks: {}, qaFilter: '' };
        this.save();
      }
      return this.state;
    },
    save() { try { sessionStorage.setItem('tdl.run', JSON.stringify(this.state)); } catch (e) { /* 무시 */ } },
    reset() { try { sessionStorage.removeItem('tdl.run'); } catch (e) { /* 무시 */ } this.state = null; },
  };
  const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  App.views.run = {
    nav: 'tour',
    render() {
      const prefs = App.prefs.load();
      const route = App.currentRoute();
      const stops = App.routeStops(route);
      const s = run.load();
      const done = s.idx >= stops.length;
      const st = done ? null : Store.get('stations', stops[s.idx]);
      const total = App.minutesOf(route);
      const nextSt = !done && s.idx < stops.length - 1 ? Store.get('stations', stops[s.idx + 1]) : null;
      const top = `<header class="run-top">
          <button class="icon-btn" data-exit aria-label="투어 모드 종료">✕</button>
          <div class="run-title"><b>${esc(route.name)}</b><small>${done ? '마무리' : `${s.idx + 1} / ${stops.length}`} · 전체 <span data-timer="total">${mmss(Date.now() - s.start)}</span> / ${total}분</small></div>
          <button class="icon-btn" data-ask aria-label="받은 질문 메모">＋Q</button></header>
        <div class="run-progress"><span style="width:${Math.round((Math.min(s.idx, stops.length) / stops.length) * 100)}%"></span></div>`;
      if (done) {
        const en = prefs.lang === 'en';
        const closing = (en ? (route.closingEn || '') : (route.closing || '')).replace(/\{가이드\}/g, en ? '000' : '(본인 이름)');
        return `<section class="run">${top}
          <div class="run-body"><h2 class="run-st">투어 마무리</h2>
            <div class="nar-toolbar">${Panels.langCtl(prefs)}</div>
            <div class="narration closing${en ? ' en' : ''}" lang="${en ? 'en' : 'ko'}" style="--nar-size:${(prefs.font || 18) + 2}px">${en ? narration(closing, { lang: 'en', joke: prefs.joke !== false, gloss: prefs.gloss !== false }) : `<p>${esc(closing)}</p>`}</div>
            <div class="card soft"><h4>마무리 후 할 일</h4><ul class="plain"><li>특송장 연계 시 센터 담당자 / 영업사원에게 인계</li><li>받은 질문을 투어 기록에 남기기</li></ul></div>
            <a class="btn primary big block" href="#/close" data-finish>투어 종료 · 투어 기록 작성</a>
          </div>
          <nav class="run-nav"><button class="btn ghost big" data-prev>‹ 이전</button><span></span></nav></section>`;
      }
      const left = st.minutes * 60000 - (Date.now() - s.stepStart);
      return `<section class="run">${top}
        <div class="run-body">
          <details class="run-map"><summary>도면 보기</summary>${FloorPlan.render({ stations: Store.all('stations'), points: App.routePoints(route), activeId: st.id, dimOthers: true })}</details>
          <div class="run-head"><span class="st-no big${st.optional ? ' opt' : ''}">${esc(st.no)}</span>
            <div><h2 class="run-st">${esc(st.name)}</h2><small class="muted">목표 ${esc(st.minutes)}분 · <span data-timer="step" class="${left < 0 ? 'warn-text' : ''}">${left < 0 ? '+' + mmss(-left) + ' 초과' : mmss(left) + ' 남음'}</span></small></div></div>
          ${tabsHtml(st, s.tab)}
          <div class="tab-body">${tabBody(st, s.tab, prefs, s)}</div>
        </div>
        <nav class="run-nav"><button class="btn ghost big" data-prev${s.idx === 0 ? ' disabled' : ''}>‹ 이전</button>
          <button class="btn primary big" data-next>${nextSt ? `다음 · ${esc(nextSt.no)}. ${esc(nextSt.name)} ›` : '마무리 ›'}</button></nav>
      </section>`;
    },
    mount(root) {
      const s = run.state;
      s.saveChecks = () => run.save();
      bindCommon(root, s);
      root.addEventListener('click', async (e) => {
        const t = e.target.closest('button,a'); if (!t) return;
        const stops = App.routeStops(App.currentRoute());
        if (t.dataset.tab !== undefined) { run.save(); return; }
        if ('next' in t.dataset) { s.idx = Math.min(stops.length, s.idx + 1); s.stepStart = Date.now(); s.tab = 'nar'; run.save(); App.render(); }
        else if ('prev' in t.dataset) { s.idx = Math.max(0, s.idx - 1); s.stepStart = Date.now(); s.tab = 'nar'; run.save(); App.render(); }
        else if ('exit' in t.dataset) { if (confirm('투어 모드를 끝낼까요? 진행 위치가 초기화됩니다.')) { run.reset(); App.navigate('#/tour'); } }
        else if ('finish' in t.dataset) {
          try { sessionStorage.setItem('tdl.logDraft', JSON.stringify({ routeId: s.routeId, minutes: Math.round((Date.now() - s.start) / 60000) })); } catch (err) { /* 무시 */ }
          run.reset();
        } else if ('ask' in t.dataset) {
          const st = Store.get('stations', stops[Math.min(s.idx, stops.length - 1)]);
          Edit.qa('', st.id);
        }
      });
      this.timer = setInterval(() => {
        const tt = $('[data-timer="total"]', root); if (tt) tt.textContent = mmss(Date.now() - s.start);
        const ts = $('[data-timer="step"]', root);
        const stops = App.routeStops(App.currentRoute());
        const st = Store.get('stations', stops[s.idx]);
        if (ts && st) {
          const left = st.minutes * 60000 - (Date.now() - s.stepStart);
          ts.textContent = left < 0 ? '+' + mmss(-left) + ' 초과' : mmss(left) + ' 남음';
          ts.classList.toggle('warn-text', left < 0);
        }
      }, 1000);
      if ('wakeLock' in navigator && !this.wake) navigator.wakeLock.request('screen').then((w) => { this.wake = w; }).catch(() => {});
    },
    unmount() {
      clearInterval(this.timer);
      if (this.wake && document.body.dataset.view !== 'run') { this.wake.release().catch(() => {}); this.wake = null; }
    },
  };

  App.Panels = Panels;
  App.Edit = Edit;
})();
