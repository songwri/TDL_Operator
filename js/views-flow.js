/* 매뉴얼 진행(슬라이드형): 한 화면에 사진 한 장 · 단계 하나. ‘다음’만 누르면 완료 처리하며 끝까지 이어진다.
   #/play/routine/<n>  오늘 준비 루틴   #/play/close/<n>  정리 루틴   #/play/g~<가이드id>/<n>  가이드 하나
   <n> 자리에 @<항목번호>를 주면 그 항목의 첫 화면부터 */
(function () {
  const { esc } = UI;

  const whichOf = (key) => (key === 'close' ? 'close' : key === 'routine' ? 'field' : key.startsWith('r~') ? key.slice(2) : '');

  // 화면 목록 만들기. 루틴에서는 같은 사진 · 같은 설명의 단계(예: AMR P2P와 오더피킹의 공통 전원 단계)를 한 번만 보여 준다
  function build(key) {
    const slides = []; const starts = [];
    const seen = new Map();   // 같은 내용 → 처음 보여 준 화면
    const pushGuide = (g, ctx, dedupe) => {
      const steps = App.guideSteps(g.id);
      if (!steps.length) { slides.push({ type: 'empty', guide: g, ctx }); return; }
      steps.forEach((s, i) => {
        const sig = `${s.image}|${s.title}|${s.body}`;
        if (dedupe && seen.has(sig)) { seen.get(sig).dups.push(s.id); return; }   // 앞 화면을 넘기면 이 단계도 함께 완료
        const sl = { type: 'step', guide: g, step: s, gi: i + 1, gn: steps.length, ctx, dups: [] };
        seen.set(sig, sl); slides.push(sl);
      });
    };
    const which = whichOf(key);
    if (which) {
      App.routineEntries(which).forEach((e, i) => {
        starts[i] = slides.length;
        if (e.optional) return;   // ‘필요 시’ 매뉴얼은 이어서 진행에 넣지 않는다 (목록에서 따로 열기)
        if (e.type === 'guide') {
          const g = e.guide;
          pushGuide(g, { group: e.group, title: g.variant ? `${App.stName(g.equip)} ${g.variant}` : g.title, equip: App.stName(g.equip) }, which === 'field');   // 오더 업로드는 매뉴얼마다 Pantos View 접속부터 전부 보여 준다
        } else slides.push({ type: 'note', item: e.item, phase: e.phase, ctx: { group: e.group, title: e.item.title, equip: e.item.stationId === 'common' ? '' : App.stName(e.item.stationId) } });
      });
    } else if (key.startsWith('g~')) {
      const g = Store.get('guides', key.slice(2));
      if (g) pushGuide(g, { group: App.KIND_LABEL[g.kind] || '', title: g.variant ? `${App.stName(g.equip)} ${g.variant}` : g.title, equip: App.stName(g.equip) }, false);
    }
    if (slides.length) slides.push({ type: 'done' });
    return { slides, starts };
  }
  App.playSlides = (key) => build(key).slides;

  const parse = (arg) => { const m = String(arg || '').match(/^([^/]+)\/?(.*)$/) || []; return { key: m[1] || '', pos: m[2] || '0' }; };
  const exitTo = (key) => (key === 'close' ? '#/close' : key === 'routine' || key.startsWith('r~') ? '#/prep' : key.startsWith('g~') ? `#/prep/${(Store.get('guides', key.slice(2)) || {}).equip || ''}` : '#/prep');
  const go = (key, idx) => { history.replaceState(null, '', `#/play/${key}/${idx}`); App.render(); };   // 화면마다 뒤로가기 기록을 쌓지 않는다

  // 가이드 하나를 마친 뒤 이어서 할 것: 같은 설비의 다음 가이드
  function nextGuide(g) {
    const list = Store.all('guides').filter((x) => x.equip === g.equip).sort((a, b) => a.order - b.order);
    const i = list.findIndex((x) => x.id === g.id);
    return list[i + 1] || null;
  }

  App.views.play = {
    nav: 'prep',
    render(arg) {
      const { key, pos } = parse(arg);
      const { slides, starts } = build(key);
      const back = exitTo(key);
      const which = whichOf(key);
      if (!slides.length) return `<section class="page"><p>진행할 매뉴얼이 없습니다.</p><a href="${back}">돌아가기</a></section>`;
      let i = pos.startsWith('@') ? (starts[Number(pos.slice(1))] ?? 0) : Number(pos) || 0;
      i = Math.max(0, Math.min(i, slides.length - 1));
      this._i = i; this._key = key; this._n = slides.length;
      const s = slides[i];
      const total = slides.length - 1;
      const head = s.ctx || {};
      const top = `<header class="run-top">
          <a class="icon-btn" href="${back}" aria-label="진행 종료">✕</a>
          <div class="run-title"><b>${esc(which ? (App.CATS[which] || {}).label || '' : (head.title || ''))}</b>
            <small>${s.type === 'done' ? '완료' : `${i + 1} / ${total}`}</small></div>
          <details class="flow-toc"><summary class="icon-btn" aria-label="목차">☰</summary>${tocHtml(slides, i)}</details>
        </header>
        <div class="run-progress"><span style="width:${Math.round((i / total) * 100)}%"></span></div>
        ${stripHtml(key, slides, i)}`;

      if (s.type === 'done') {
        let next = '';
        if (which === 'order') next = '<a class="btn primary big block" href="#/play/r~field/0">현장 준비 시작 ▶</a>';
        else if (which === 'field') next = '<a class="btn primary big block" href="#/tour">투어 화면으로 ▶</a>';
        else if (key === 'close') next = '<button class="btn primary big block" data-write-log>투어 기록 작성 ▶</button>';
        else { const g = Store.get('guides', key.slice(2)); const n = g && nextGuide(g); if (n) next = `<a class="btn primary big block" href="#/play/g~${esc(n.id)}/0">다음: ${esc(n.variant ? `${App.stName(n.equip)} ${n.variant}` : n.title)} ▶</a>`; }
        return `<section class="run">${top}<div class="run-body done-body">
            <div class="done-mark" aria-hidden="true">✓</div>
            <h2 class="run-st">${which ? `${(App.CATS[which] || {}).label}을(를) 모두 마쳤습니다` : '이 매뉴얼을 모두 마쳤습니다'}</h2>
            <p class="muted">‘다음’으로 넘긴 단계는 오늘 날짜로 완료 표시됩니다.</p>
            ${next}<a class="btn ghost big block" href="${back}">목록으로</a></div>
          <nav class="run-nav"><button class="btn ghost big" data-prev>‹ 이전</button><span></span></nav></section>`;
      }

      let body = '';
      if (s.type === 'step') {
        const st = s.step;
        body = `<div class="flow-guide">${esc(s.guide.title)} <span class="muted">· ${s.gi}/${s.gn}</span></div>
          <h2 class="run-st">${esc(st.title)}</h2>
          <div class="g-grid flow-grid">${App.shot(st.image)}<div class="g-text">${App.guideStepBody(st.body)}${st.note ? `<p class="g-note">${esc(st.note)}</p>` : ''}</div></div>`;
      } else if (s.type === 'note') {
        const m = s.item;
        body = `<h2 class="run-st big">${esc(m.title)}</h2>${m.body ? `<p class="flow-note">${App.richText(m.body)}</p>` : ''}
          <p class="muted small">확인했으면 ‘다음’을 누르세요.</p>`;
      } else {
        body = `<h2 class="run-st">${esc(s.guide.title)}</h2><div class="todo">✍️ 단계가 아직 없습니다 — 편집 모드에서 추가하세요</div>`;
      }
      const n = slides[i + 1];
      const label = !n || n.type === 'done' ? '완료' : (n.ctx && n.ctx.title !== head.title) ? `다음: ${n.ctx.title}` : '다음';
      return `<section class="run">${top}
        <div class="run-body">
          <div class="flow-ctx">${head.group ? `<span class="badge">${esc(head.group)}</span>` : ''}${head.equip ? `<span class="chip">${esc(head.equip)}</span>` : ''}<b>${esc(head.title || '')}</b></div>
          ${body}
        </div>
        <nav class="run-nav"><button class="btn ghost big" data-prev ${i === 0 ? 'disabled' : ''}>‹ 이전</button><button class="btn primary big" data-next>${esc(label)} ›</button></nav></section>`;
    },
    mount(root, arg) {
      App.loadShots(root);
      const key = this._key; const i = this._i;
      const { slides } = build(key);
      const cur = root.querySelector('.flow-strip .cur');
      if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
      // 다음 화면들의 이미지를 미리 받아 둔다 (가까운 것부터)
      const imgs = (from, to) => slides.slice(from, to).filter((x) => x.type === 'step').map((x) => x.step.image);
      Store.prefetch(imgs(i + 1, i + 6).concat(imgs(i + 6, slides.length)));
      const next = () => {
        const s = slides[i];
        if (s.type === 'step') [s.step.id].concat(s.dups || []).forEach((id) => App.checks.setStep(id, true));
        if (s.type === 'note') App.checks.setItem(s.phase, s.item.id, true);
        if (i < slides.length - 1) go(key, i + 1);
      };
      const prev = () => { if (i > 0) go(key, i - 1); };
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-next]')) next();
        else if (e.target.closest('[data-prev]')) prev();
        else if (e.target.closest('[data-write-log]')) { App.navigate('#/close'); setTimeout(() => App.editLog(''), 60); }
        const j = e.target.closest('[data-jump]'); if (j) go(key, Number(j.dataset.jump));
      });
      let x0 = null;
      root.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      root.addEventListener('touchend', (e) => {
        if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 70 && !e.target.closest('details, dialog')) { if (dx < 0) next(); else prev(); }
      });
      this._keyh = (e) => { if (document.querySelector('dialog[open]')) return; if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); };
      document.addEventListener('keydown', this._keyh);
    },
    unmount() { if (this._keyh) { document.removeEventListener('keydown', this._keyh); this._keyh = null; } },
  };

  // 상단 얇은 진행 막대: 루틴은 항목(가이드 · 체크) 단위, 가이드 하나는 단계 단위. 지금 위치와 다음에 올 것을 한눈에
  function stripHtml(key, slides, cur) {
    let chips;
    if (key.startsWith('g~')) {
      chips = slides.map((s, k) => (s.type === 'step' ? { k, t: s.step.title, n: s.gi } : null)).filter(Boolean)
        .map((c) => ({ k: c.k, label: `<b>${c.n}</b> ${esc(c.t)}`, state: c.k < cur ? 'past' : c.k === cur ? 'cur' : '' }));
    } else {
      const items = [];
      slides.forEach((s, k) => {
        const t = s.ctx && s.ctx.title; if (!t) return;
        const last = items[items.length - 1];
        if (last && last.t === t) { last.end = k; return; }
        items.push({ k, end: k, t, eq: s.ctx.equip });
      });
      chips = items.map((x) => {
        const state = cur > x.end ? 'past' : cur >= x.k ? 'cur' : '';
        const n = x.end - x.k + 1;
        return { k: x.k, state, label: `${esc(x.t)}${n > 1 ? ` <small>${state === 'cur' ? `${cur - x.k + 1}/` : ''}${n}</small>` : ''}` };
      });
    }
    return `<nav class="flow-strip" aria-label="진행 순서">${chips.map((c) => `<button data-jump="${c.k}" class="${c.state}"${c.state === 'cur' ? ' aria-current="step"' : ''}>${c.label}</button>`).join('<span class="fs-sep" aria-hidden="true">›</span>')}</nav>`;
  }

  // 목차: 항목(가이드 · 체크)의 첫 화면
  function tocHtml(slides, cur) {
    const items = [];
    slides.forEach((s, k) => {
      const t = s.ctx && s.ctx.title; if (!t) return;
      const prevT = k > 0 && slides[k - 1].ctx && slides[k - 1].ctx.title;
      if (t !== prevT) items.push({ k, t, g: s.ctx.group, eq: s.ctx.equip });
    });
    let curItem = 0; items.forEach((x, n) => { if (x.k <= cur) curItem = n; });
    return `<ol>${items.map((x, n) => `<li><button data-jump="${x.k}" class="${n === curItem ? 'on' : ''}"><small>${esc(x.g || '')}</small>${esc(x.t)}</button></li>`).join('')}</ol>`;
  }

  // 예전 주소 호환 (#/flow/설비)
  App.views.flow = { nav: 'prep', render: () => '', mount: () => App.navigate('#/prep') };
})();
