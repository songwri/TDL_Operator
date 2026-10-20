/* 이어서 진행: 설비 하나의 사전준비·현장조작을 슬라이드처럼 한 화면씩 넘기며 끝까지 진행한다 (목록으로 나가지 않음) */
(function () {
  const { esc, $, $$ } = UI;
  const COL = { prep: '사전준비', field: '현장조작' };
  const SUB = { in: '입고', out: '출고' };

  // 설비의 체크 항목(사전준비 → 현장조작, 구분 없음 → 입고 → 출고)을 가이드 단계 단위 슬라이드로 펼친다
  App.flowSlides = (sid, tourType) => {
    const items = Store.where('manual', (m) => m.phase === 'pre' && m.stationId === sid && App.isPreTask(m) && (m.tourType === 'all' || m.tourType === tourType));
    const rank = (m) => (App.preCol(m) === 'prep' ? 0 : 10) + ({ '': 0, in: 1, out: 2 }[App.preSub(m)] || 0);
    items.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
    const slides = []; const seenG = new Set();
    items.forEach((m, mi) => {
      const ctx = `${COL[App.preCol(m)]}${App.preSub(m) ? ' · ' + SUB[App.preSub(m)] : ''}`;
      const base = { item: m, ctx, itemNo: mi + 1, itemN: items.length };
      const gs = String(m.guideIds || '').split(',').map((x) => x.trim()).map((g) => Store.get('guides', g)).filter(Boolean);
      const first = slides.length;
      if (!gs.length) { slides.push(Object.assign({ type: 'note' }, base)); return; }
      gs.forEach((g) => {
        if (seenG.has(g.id)) { slides.push(Object.assign({ type: 'note', repeat: g }, base)); return; }   // 같은 가이드를 또 보여 주지 않고 안내만
        seenG.add(g.id);
        const steps = App.guideSteps(g.id);
        if (!steps.length) slides.push(Object.assign({ type: 'note', guide: g, empty: true }, base));
        steps.forEach((s, i) => slides.push(Object.assign({ type: 'step', guide: g, step: s, gi: i + 1, gn: steps.length }, base)));
      });
      slides[first].first = true;
    });
    if (slides.length) slides.push({ type: 'done' });
    return slides;
  };

  const checkKey = () => `tdl.check.pre.${Store.today()}`;
  function markItemDone(id) {
    try {
      const c = JSON.parse(localStorage.getItem(checkKey()) || '{}');
      c[id] = true; localStorage.setItem(checkKey(), JSON.stringify(c));
    } catch (e) { /* 무시 */ }
  }
  const ckKey = () => `tdl.gcheck.${Store.today()}`;
  function markStepDone(id) {
    try { const c = JSON.parse(localStorage.getItem(ckKey()) || '{}'); c[id] = true; localStorage.setItem(ckKey(), JSON.stringify(c)); } catch (e) { /* 무시 */ }
  }

  const parse = (arg) => { const [sid, n] = String(arg || '').split('/'); return { sid, idx: Math.max(0, Number(n) || 0) }; };
  const go = (sid, idx) => { history.replaceState(null, '', `#/flow/${sid}/${idx}`); App.render(); };   // 뒤로가기 기록을 쌓지 않는다

  function nextStation(sid, tourType) {
    const rows = App.preRows();
    const i = rows.findIndex((s) => s.id === sid);
    return rows.slice(i + 1).find((s) => App.flowSlides(s.id, tourType).length > 1) || null;
  }

  App.views.flow = {
    nav: 'pre',
    render(arg) {
      const { sid, idx } = parse(arg);
      const st = Store.get('stations', sid);
      const tourType = App.prefs.load().tourType || '일반';
      const slides = st ? App.flowSlides(sid, tourType) : [];
      if (!st || !slides.length) return `<section class="page"><p>이 설비는 진행할 준비 항목이 없습니다.</p><a href="#/pre">투어 전으로</a></section>`;
      const i = Math.min(idx, slides.length - 1);
      const s = slides[i];
      const top = `<header class="run-top">
          <button class="icon-btn" data-flow-exit aria-label="진행 종료">✕</button>
          <div class="run-title"><b>${esc(st.name)}</b><small>${s.type === 'done' ? '완료' : `${i + 1} / ${slides.length - 1}`}${s.type !== 'done' ? ` · 항목 ${s.itemNo}/${s.itemN}` : ''}</small></div>
          <details class="flow-toc"><summary class="icon-btn" aria-label="목차">☰</summary>
            <ol>${slides.map((x, k) => (x.first || (x.type === 'note' && !x.empty && x.itemNo !== (slides[k - 1] || {}).itemNo)) ? `<li><button data-flow-jump="${k}" class="${k === i ? 'on' : ''}">${esc(x.ctx)} · ${esc(x.item.title)}</button></li>` : '').join('')}</ol></details>
        </header>
        <div class="run-progress"><span style="width:${Math.round((i / (slides.length - 1)) * 100)}%"></span></div>`;

      if (s.type === 'done') {
        const nx = nextStation(sid, tourType);
        return `<section class="run">${top}<div class="run-body">
            <h2 class="run-st">✓ ${esc(st.name)} 준비 완료</h2>
            <p class="muted">체크한 항목은 투어 전 화면에 완료로 표시됩니다.</p>
            ${nx ? `<a class="btn primary big block" href="#/flow/${esc(nx.id)}/0">다음 설비: ${esc(nx.name)} ▶</a>` : '<p><b>모든 설비의 준비 안내를 마쳤습니다.</b></p>'}
            <a class="btn ghost big block" href="#/pre">투어 전 화면으로</a></div>
          <nav class="run-nav"><button class="btn ghost big" data-flow-prev>‹ 이전</button><span></span></nav></section>`;
      }
      const m = s.item;
      let body;
      if (s.type === 'step') {
        body = `<div class="flow-guide">${esc(s.guide.title)} <span class="muted">· 단계 ${s.gi}/${s.gn}</span></div>
          <h2 class="run-st">${esc(s.step.title)}</h2>
          <div class="g-grid flow-grid">${App.shot(s.step.image)}<div class="g-text">${App.guideStepBody(s.step.body)}${s.step.note ? `<p class="g-note">${esc(s.step.note)}</p>` : ''}</div></div>`;
      } else {
        body = `<h2 class="run-st">${esc(m.title)}</h2>
          ${m.system && m.system !== '-' ? `<span class="chip sys">${esc(m.system)}</span>` : ''}
          ${m.body ? `<p class="flow-note">${esc(m.body).replace(/\n/g, '<br>').replace(/(0\d{1,2}-\d{3,4}-\d{4})/g, '<a href="tel:$1">$1</a>')}</p>` : ''}
          ${s.repeat ? `<p class="flow-note">앞에서 진행한 ‘${esc(s.repeat.title)}’와 같은 절차입니다. 이번에는 이 항목 용도의 오더로 같은 방법을 한 번 더 진행하세요.</p><a class="btn" href="#/guide/${esc(s.repeat.id)}">그 가이드 다시 보기 ›</a>` : ''}
          ${s.empty ? `<div class="todo">✍️ ${esc(s.guide.title)} — 단계가 아직 없습니다</div>` : (s.repeat ? '' : '<p class="muted">직접 하는 항목입니다. 끝나면 ‘다음’을 누르세요.</p>')}`;
      }
      const nextS = slides[i + 1];
      const nextLabel = !nextS ? '' : nextS.type === 'done' ? '마치기' : (nextS.itemNo !== s.itemNo ? `다음 항목: ${nextS.item.title}` : nextS.guide && s.guide && nextS.guide.id !== s.guide.id ? `다음 가이드: ${nextS.guide.title}` : '다음');
      return `<section class="run">${top}
        <div class="run-body">
          <div class="flow-ctx"><span class="badge">${esc(s.ctx)}</span><b>${esc(m.title)}</b></div>
          ${body}
        </div>
        <nav class="run-nav"><button class="btn ghost big" data-flow-prev ${i === 0 ? 'disabled' : ''}>‹ 이전</button><button class="btn primary big" data-flow-next>${esc(nextLabel)} ›</button></nav></section>`;
    },
    mount(root, arg) {
      App.loadShots(root);
      const { sid, idx } = parse(arg);
      const tourType = App.prefs.load().tourType || '일반';
      const slides = App.flowSlides(sid, tourType);
      if (!slides.length) return;
      const i = Math.min(idx, slides.length - 1);
      const next = () => {
        const s = slides[i]; const n = slides[i + 1];
        if (s.type === 'step') markStepDone(s.step.id);
        // 이 항목의 마지막 슬라이드를 넘기면 투어 전 체크도 자동으로 완료
        if (s.item && (!n || n.type === 'done' || (n.item && n.item.id !== s.item.id))) markItemDone(s.item.id);
        if (i < slides.length - 1) go(sid, i + 1);
      };
      const prev = () => { if (i > 0) go(sid, i - 1); };
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-flow-next]')) next();
        else if (e.target.closest('[data-flow-prev]')) prev();
        else if (e.target.closest('[data-flow-exit]')) App.navigate('#/pre');
        const j = e.target.closest('[data-flow-jump]'); if (j) go(sid, Number(j.dataset.flowJump));
      });
      // 좌우 스와이프 · 방향키
      let x0 = null;
      root.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      root.addEventListener('touchend', (e) => {
        if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 70 && !e.target.closest('details')) { if (dx < 0) next(); else prev(); }
      });
      this._key = (e) => { if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); };
      document.addEventListener('keydown', this._key);
    },
    unmount() { if (this._key) { document.removeEventListener('keydown', this._key); this._key = null; } },
  };
})();
