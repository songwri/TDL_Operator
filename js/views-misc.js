/* Q&A 라이브러리, 동선(Flowgram) 편집, 더보기(데이터·설정·변경이력) */
(function () {
  const { esc, $, $$, form, toast, requireUnlock, download } = UI;

  // ───────── Q&A 라이브러리 ─────────
  const qaState = { q: '', station: '', common: false, pending: false, recent: false };
  function qaFiltered() {
    const q = qaState.q.toLowerCase();
    return Store.all('qa').filter((x) => (!qaState.station || x.stationId === qaState.station)
      && (!qaState.common || x.common) && (!qaState.pending || x.status === '확인필요')
      && (!qaState.recent || Store.isRecent(x))
      && (!q || (x.question + ' ' + x.answer + ' ' + (x.topic || '')).toLowerCase().includes(q)));
  }
  function qaResults() {
    const list = qaFiltered();
    const order = App.stationsSorted().map((s) => s.id);
    list.sort((a, b) => (order.indexOf(a.stationId) - order.indexOf(b.stationId)) || (b.common - a.common));
    return `<p class="muted small">${list.length}건</p>${App.Panels.qaList(list, true)}`;
  }
  App.views.qa = {
    render() {
      const pending = Store.where('qa', (x) => x.status === '확인필요').length;
      return `<section class="page qa-page">
        <header class="page-head"><div><h2>Q&A 라이브러리</h2><small class="muted">전체 ${Store.all('qa').length}건 · 확인필요 ${pending}건</small></div>
          <button class="btn primary" data-add-qa>+ 받은 질문 추가</button></header>
        <div class="card filters">
          <input type="search" data-q placeholder="질문·답변 검색 (예: 배터리, 투자비)" value="${esc(qaState.q)}" aria-label="검색">
          <select data-station aria-label="장소"><option value="">모든 장소</option>${App.stationsSorted().map((s) => `<option value="${s.id}"${qaState.station === s.id ? ' selected' : ''}>${esc(s.no)}. ${esc(s.name)}</option>`).join('')}</select>
          <div class="chips">
            <button class="chip${qaState.common ? ' on' : ''}" data-f="common">공통 질문</button>
            <button class="chip${qaState.pending ? ' on' : ''}" data-f="pending">확인필요</button>
            <button class="chip${qaState.recent ? ' on' : ''}" data-f="recent">최근 수정</button></div>
        </div>
        <div data-results>${qaResults()}</div></section>`;
    },
    mount(root) {
      root.addEventListener('input', (e) => {
        if (e.target.matches('[data-q]')) { qaState.q = e.target.value; $('[data-results]', root).innerHTML = qaResults(); }
      });
      root.addEventListener('change', (e) => {
        if (e.target.matches('[data-station]')) { qaState.station = e.target.value; $('[data-results]', root).innerHTML = qaResults(); }
      });
      root.addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.f) { qaState[t.dataset.f] = !qaState[t.dataset.f]; App.rerender(); }
        else if ('addQa' in t.dataset) App.Edit.qa('', qaState.station || '');
        else if (t.dataset.editQa) App.Edit.qa(t.dataset.editQa);
      });
    },
  };

  // ───────── 동선 목록 ─────────
  App.views.routes = {
    nav: 'more',
    render(id) {
      if (id) return editor.render(id);
      const routes = Store.all('routes');
      return `<section class="page routes-page">
        <a class="back" href="#/more">‹ 더보기</a>
        <header class="page-head"><div><h2>투어 동선 (Flowgram)</h2><small class="muted">도면 위에 직접 경로를 그려 새 동선을 만듭니다</small></div>
          <button class="btn primary" data-new-route>+ 새 동선</button></header>
        <div class="route-grid">${routes.map((r) => `<article class="card route-card">
          ${FloorPlan.render({ stations: Store.all('stations'), points: App.routePoints(r), stopOrder: App.stopOrder(r), dimOthers: true })}
          <h3>${esc(r.name)} <span class="badge">${esc(r.tourType)}</span> ${UI.badgeRecent(r)}</h3>
          <small class="muted">정거장 ${App.routeStops(r).length}곳 · 예상 ${App.minutesOf(r)}분</small>
          ${r.description ? `<p class="small">${esc(r.description)}</p>` : ''}
          <div class="row"><a class="btn small" href="#/routes/${r.id}">${Store.isUnlocked() ? '✎ 편집' : '보기'}</a>
            <button class="btn small ghost" data-use-route="${r.id}">이 동선으로 투어</button>
            ${App.editBtn(`data-dup-route="${r.id}"`, '복제')}</div></article>`).join('')}</div></section>`;
    },
    mount(root, id) {
      if (id) return editor.mount(root, id);
      editor.routeId = '';
      root.addEventListener('click', async (e) => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.useRoute) { const p = App.prefs.load(); p.routeId = t.dataset.useRoute; const r = Store.get('routes', p.routeId); if (r && r.tourType) p.tourType = r.tourType; App.prefs.save(p); App.navigate('#/tour'); }
        else if (t.dataset.dupRoute) {
          const r = Store.get('routes', t.dataset.dupRoute);
          const n = Store.upsert('routes', Object.assign({}, r, { id: '', name: r.name + ' (복제)' }));
          App.navigate('#/routes/' + n.id);
        } else if ('newRoute' in t.dataset) {
          if (!(await requireUnlock())) return;
          const res = await form('새 동선', [{ key: 'name', label: '동선 이름', required: true }, { key: 'tourType', label: '투어 유형', type: 'select', options: ['일반', 'VIP'] }]);
          if (!res) return;
          const base = Store.get('routes', 'r_basic') || {};
          const n = Store.upsert('routes', { id: '', name: res.name, tourType: res.tourType, description: '', points: '[]', closing: base.closing || '' });
          App.navigate('#/routes/' + n.id);
        }
      });
    },
    unmount() { editor.unmount(); },
  };

  // ───────── 동선 편집기 ─────────
  const editor = {
    pts: [], sel: -1, undo: [], routeId: '', dirty: false,
    render(id) {
      const r = Store.get('routes', id);
      if (!r) return '<p class="page">동선을 찾을 수 없습니다.</p>';
      if (this.routeId !== id) { this.routeId = id; this.pts = App.routePoints(r); this.sel = -1; this.undo = []; this.dirty = false; }
      const can = Store.isUnlocked();
      const stops = this.pts.filter((p) => p.stop).map((p) => Store.get('stations', p.stop)).filter(Boolean);
      const mins = stops.reduce((s, st) => s + (Number(st.minutes) || 0), 0);
      const order = {}; stops.forEach((s, i) => { if (!order[s.id]) order[s.id] = i + 1; });
      return `<section class="page editor-page">
        <a class="back" href="#/routes">‹ 동선 목록</a>
        <header class="page-head"><div><h2>${esc(r.name)}</h2><small class="muted">${esc(r.tourType)} · 정거장 ${stops.length}곳 · 예상 ${mins}분${this.dirty ? ' · <b class="warn-text">저장 안 됨</b>' : ''}</small></div>
          ${can ? `<div class="row"><button class="btn ghost" data-meta>정보 수정</button><button class="btn primary" data-save${this.dirty ? '' : ' disabled'}>저장</button></div>` : ''}</header>
        ${can ? `<div class="toolbar card">
            <span class="hint">빈 곳 탭 = 경유점 추가 · 번호 핀 탭 = 정거장 추가 · 점 끌기 = 이동</span>
            <button class="btn small ghost" data-undo${this.undo.length ? '' : ' disabled'}>↶ 되돌리기</button>
            <button class="btn small ghost" data-del-point${this.sel >= 0 ? '' : ' disabled'}>선택 점 삭제</button>
            <button class="btn small ghost" data-play>▶ 재생</button>
            <button class="btn small ghost danger" data-clear>전체 지우기</button></div>` : '<p class="muted">편집하려면 오른쪽 위 🔒 편집을 눌러 주세요.</p>'}
        <div class="editor-grid">
          <div class="card map-edit${can ? ' can-edit' : ''}">${FloorPlan.render({ stations: Store.all('stations'), points: this.pts, stopOrder: order, editPoints: can })}</div>
          <div class="card"><h3>정거장 순서</h3>
            <ol class="stop-list">${this.pts.map((p, i) => p.stop ? `<li class="${this.sel === i ? 'sel' : ''}"><span class="st-no small">${esc((Store.get('stations', p.stop) || {}).no)}</span>
              ${esc((Store.get('stations', p.stop) || {}).name)}
              ${can ? `<span class="grow"></span><button class="icon-btn" data-up="${i}" aria-label="앞으로">↑</button><button class="icon-btn" data-down="${i}" aria-label="뒤로">↓</button><button class="icon-btn" data-rm="${i}" aria-label="빼기">✕</button>` : ''}</li>` : '').join('') || '<li class="muted">도면에서 번호 핀을 눌러 정거장을 추가하세요.</li>'}</ol>
            <p class="muted small">순서를 바꾸면 해당 정거장 앞뒤 경유점은 그대로 두고 정거장만 자리를 바꿉니다. 경로 모양은 경유점을 끌어 다듬으세요.</p>
            <h4>마무리 멘트</h4><p class="small">${esc(r.closing || '—')}</p></div>
        </div></section>`;
    },
    mount(root) {
      const svg = $('svg.floorplan', root);
      const can = Store.isUnlocked();
      const self = this;
      const push = () => { self.undo.push(JSON.stringify(self.pts)); if (self.undo.length > 50) self.undo.shift(); self.dirty = true; };
      const redraw = () => App.rerender();

      if (can && svg) {
        let drag = -1, moved = false;
        const down = (e) => {
          const h = e.target.closest('.fp-handle');
          if (h) { drag = Number(h.dataset.point); moved = false; self.sel = drag; e.preventDefault(); }
        };
        const move = (e) => {
          if (drag < 0) return;
          if (!moved) { push(); moved = true; }
          const p = FloorPlan.toSvgPoint(svg, e);
          self.pts[drag].x = p.x; self.pts[drag].y = p.y;
          const routeEls = $$('.fp-route,.fp-route-shadow', svg);
          routeEls.forEach((el) => el.setAttribute('d', FloorPlan.smoothPath(self.pts)));
          const hEl = $(`.fp-handle[data-point="${drag}"]`, svg);
          if (hEl) { hEl.setAttribute('cx', p.x); hEl.setAttribute('cy', p.y); }
          e.preventDefault();
        };
        const up = () => { if (drag >= 0) { drag = -1; redraw(); } };
        svg.addEventListener('pointerdown', down);
        svg.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: false });
        this._up = up;
        svg.addEventListener('click', (e) => {
          if (e.target.closest('.fp-handle')) { redraw(); return; }
          const pin = e.target.closest('[data-station]');
          if (pin) {
            const st = Store.get('stations', pin.dataset.station);
            push(); self.pts.push({ x: st.x, y: st.y, stop: st.id }); self.sel = self.pts.length - 1; redraw(); return;
          }
          const p = FloorPlan.toSvgPoint(svg, e);
          push();
          const at = nearestSegment(self.pts, p);
          self.pts.splice(at, 0, { x: p.x, y: p.y, stop: '' });
          self.sel = at; redraw();
        });
      }

      root.addEventListener('click', async (e) => {
        const t = e.target.closest('button'); if (!t || !root.contains(t)) return;
        const d = t.dataset;
        if ('undo' in d && self.undo.length) { self.pts = JSON.parse(self.undo.pop()); self.dirty = true; redraw(); }
        else if ('delPoint' in d && self.sel >= 0) { push(); self.pts.splice(self.sel, 1); self.sel = -1; redraw(); }
        else if ('clear' in d) { if (confirm('경로를 모두 지울까요?')) { push(); self.pts = []; redraw(); } }
        else if (d.rm) { push(); self.pts.splice(Number(d.rm), 1); redraw(); }
        else if (d.up || d.down) {
          const i = Number(d.up || d.down);
          const stopIdx = self.pts.map((p, k) => (p.stop ? k : -1)).filter((k) => k >= 0);
          const pos = stopIdx.indexOf(i);
          const j = stopIdx[pos + (d.up ? -1 : 1)];
          if (j === undefined) return;
          push();
          const a = self.pts[i], b = self.pts[j];
          self.pts[i] = b; self.pts[j] = a; redraw();
        } else if ('play' in d) play(svg);
        else if ('save' in d) {
          const r = Store.get('routes', self.routeId);
          self.dirty = false;
          Store.upsert('routes', Object.assign({}, r, { points: JSON.stringify(self.pts) }));
          toast('동선을 저장했습니다');
        } else if ('meta' in d) {
          const r = Store.get('routes', self.routeId);
          const res = await form('동선 정보', [
            { key: 'name', label: '이름', required: true },
            { key: 'tourType', label: '투어 유형', type: 'select', options: ['일반', 'VIP'] },
            { key: 'description', label: '설명', type: 'textarea', rows: 2 },
            { key: 'closing', label: '마무리 멘트', type: 'textarea', rows: 3, hint: '{가이드} 자리에는 가이드 이름 안내 표시가 들어갑니다.' },
            { key: 'closingEn', label: '마무리 멘트 (English)', type: 'textarea', rows: 3, hint: '{{ 농담 }} 은 농담 스위치로 끌 수 있습니다.' },
          ], r, r.id === 'r_basic' ? null : { danger: '동선 삭제' });
          if (!res) return;
          if (res._action === 'delete') { Store.remove('routes', r.id); self.routeId = ''; App.navigate('#/routes'); return; }
          Store.upsert('routes', Object.assign({}, r, res, { points: JSON.stringify(self.pts) }));
          self.dirty = false;
        }
      });
    },
    unmount() { if (this._up) window.removeEventListener('pointerup', this._up); this._up = null; },
  };

  function nearestSegment(pts, p) {
    if (pts.length < 2) return pts.length;
    let best = pts.length, bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
      if (d < bestD) { bestD = d; best = i + 1; }
    }
    // 경로에서 멀리 떨어진 곳을 누르면 끝에 이어 붙인다
    return bestD > 60 ? pts.length : best;
  }

  function play(svg) {
    const path = svg && svg.querySelector('.fp-route');
    if (!path) return;
    const len = path.getTotalLength();
    let dot = svg.querySelector('.fp-walker');
    if (!dot) { dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('class', 'fp-walker'); dot.setAttribute('r', '10'); svg.appendChild(dot); }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : Math.min(12000, Math.max(4000, len * 4));
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const pt = path.getPointAtLength(k * len);
      dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
      if (k < 1) requestAnimationFrame(step); else setTimeout(() => dot.remove(), 600);
    };
    requestAnimationFrame(step);
  }
  App.playRoute = play;

  // ───────── 더보기: 데이터 · 설정 · 변경 이력 ─────────
  const TABLE_LABEL = { guides: '절차 가이드', guideSteps: '가이드 단계', transitions: '이동 멘트', stations: '장소·대사', actions: '장소별 행동', videos: '영상', specs: '설비 스펙', qa: 'Q&A', routes: '동선', manual: '투어 전/후 매뉴얼', contacts: '비상연락망', tourLogs: '투어 기록', history: '변경 이력', settings: '설정' };
  App.views.more = {
    render() {
      const can = Store.isUnlocked();
      const hist = Store.all('history').slice(0, 40);
      return `<section class="page more-page">
        <header class="page-head"><h2>더보기</h2></header>
        <div class="more-grid">
          <a class="card link-card" href="#/routes"><b>🗺️ 투어 동선 (Flowgram)</b><small>도면 위에 새 동선 그리기 · 동선별 순서 · 재생</small></a>
          <div class="card"><h3>데이터 · 연결</h3>
            <p class="small">저장 위치: <b>${esc(Store.adapter.name)}</b>${Store.sync.at ? ` · 마지막 동기화 ${esc(Store.sync.at)}` : ''}</p>
            ${Store.adapter.kind === 'sheet'
              ? '<p class="small muted">수정 내용은 바로 구글 시트(TDL_Operator)에 저장되고, 다른 구성원은 새로고침하거나 상단 동기화 표시를 누르면 최신 내용을 봅니다.</p>'
              : '<p class="small muted">시험용 모드입니다. 수정 내용은 이 기기에만 저장됩니다.</p>'}
            <div class="row wrap">
              ${Store.adapter.kind === 'sheet' ? '<button class="btn small" data-reload>↻ 시트에서 다시 불러오기</button>' : '<button class="btn small" data-leave-local>시험용 모드 끝내기</button>'}
              <button class="btn small ghost" data-export>⬇ JSON 백업</button>
              ${can ? '<label class="btn small ghost file-btn">⬆ JSON으로 전체 덮어쓰기<input type="file" accept=".json,application/json" data-import hidden></label>' : ''}
              <button class="btn small ghost" data-logout>로그아웃</button></div>
            <h4>PowerApps 이관용 CSV (테이블별)</h4>
            <div class="row wrap">${Store.TABLES.map((t) => `<button class="btn small ghost" data-csv="${t}">${esc(TABLE_LABEL[t] || t)}</button>`).join('')}</div>
            <small class="muted">각 CSV는 시트 탭 / SharePoint 목록 하나에 대응합니다. 열 정의는 docs/powerapps-migration.md 참고.</small>
          </div>
          <div class="card"><h3>설정</h3>
            ${can ? `<div class="row wrap"><button class="btn small" data-pw="edit">편집 비밀번호 변경</button>
              ${Store.adapter.kind === 'sheet' ? '<button class="btn small" data-pw="access">접속 비밀번호 변경</button>' : ''}
              <button class="btn small ghost" data-recent>“수정됨” 표시 기간 (${esc(Store.setting('recentDays', '3'))}일)</button>
              <button class="btn small ghost" data-biz>비즈니스 목록</button>
              <button class="btn small ghost" data-specfields>스펙 표준양식 항목</button></div>`
              : '<p class="muted small">설정을 바꾸려면 🔒 편집을 켜 주세요.</p>'}
          </div>
          <div class="card history"><h3>변경 이력 <small class="muted">최근 40건</small></h3>
            ${hist.length ? `<ul class="hist">${hist.map((h) => `<li><span class="badge">${esc(h.action)}</span> <b>${esc(TABLE_LABEL[h.table] || h.table)}</b> ${esc(summary(h))}
              <small class="muted">${esc(h.by)} · ${esc(h.at)}</small>${can && h.table !== 'settings' ? `<button class="btn small ghost" data-restore="${h.id}">되돌리기</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">아직 변경 내역이 없습니다.</p>'}
          </div>
        </div></section>`;
    },
    mount(root) {
      root.addEventListener('change', (e) => {
        if (!e.target.matches('[data-import]')) return;
        const f = e.target.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          if (!confirm('가져온 파일로 이 기기의 데이터를 교체할까요?')) return;
          try { Store.importJson(rd.result); toast('가져왔습니다'); } catch (err) { toast('가져오기 실패: ' + err.message); }
        };
        rd.readAsText(f);
      });
      root.addEventListener('click', async (e) => {
        const t = e.target.closest('button'); if (!t) return;
        const d = t.dataset;
        if ('export' in d) download(`tdl-guide-data-${Store.today()}.json`, Store.exportJson());
        else if (d.csv) download(`tdl-${d.csv}.csv`, Store.toCsv(d.csv), 'text/csv;charset=utf-8');
        else if (d.pw) {
          const label = d.pw === 'access' ? '접속 비밀번호' : '편집 비밀번호';
          const res = await form(`${label} 변경`, [{ key: 'pw', label: `새 ${label} (4자 이상)`, type: 'password', required: true }]);
          if (!res) return;
          const r = await Store.setPassword(d.pw, res.pw);
          toast(r.ok ? `${label}를 변경했습니다. 구성원에게 알려 주세요` : '변경 실패: ' + r.error);
        }
        else if ('reload' in d) { await Store.reload(); toast(Store.sync.state === 'saved' ? '다시 불러왔습니다' : '불러오기 실패'); }
        else if ('logout' in d) { if (confirm('로그아웃할까요? 이 기기에 저장된 데이터도 지웁니다.')) Store.logout(); }
        else if ('leaveLocal' in d) { if (confirm('시험용 데이터를 지우고 시트 연결 화면으로 갈까요?')) Store.leaveLocal(); } else if ('recent' in d) {
          const res = await form('“수정됨” 표시 기간', [{ key: 'days', label: '수정 후 며칠 동안 표시할까요?', type: 'number' }], { days: Store.setting('recentDays', '3') });
          if (res && res.days > 0) Store.setSetting('recentDays', String(res.days));
        } else if ('biz' in d) {
          const res = await form('비즈니스 목록 (2번 ZONE)', [{ key: 'list', label: '한 줄에 하나', type: 'textarea', rows: 7 }], { list: Store.settingJson('businesses', []).join('\n') });
          if (res) Store.setSetting('businesses', JSON.stringify(res.list.split('\n').map((x) => x.trim()).filter(Boolean)));
        } else if ('specfields' in d) {
          const res = await form('스펙 표준양식 항목', [{ key: 'list', label: '한 줄에 하나 (순서대로 표시)', type: 'textarea', rows: 14 }], { list: Store.settingJson('specFields', []).join('\n') });
          if (res) Store.setSetting('specFields', JSON.stringify(res.list.split('\n').map((x) => x.trim()).filter(Boolean)));
        } else if (d.restore) { if (Store.restore(d.restore)) toast('되돌렸습니다'); }
      });
    },
  };

  function summary(h) {
    try {
      const o = JSON.parse(h.after || h.before || '{}');
      return o.question || o.name || o.title || o.field || o.text || o.customer || o.value || '';
    } catch (e) { return ''; }
  }
})();
