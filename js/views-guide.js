/* 절차 가이드: 사전 준비 매뉴얼의 슬라이드 이미지 + 단계별 설명 */
(function () {
  const { esc, $, $$, form, toast } = UI;
  const PHASE = new Proxy({}, { get: (o, k) => (App.KIND_LABEL || {})[k] || '' });

  // ───────── 매뉴얼 이미지 ─────────
  // 이미지 이름을 쉼표로 여러 개 적으면 한 화면에 나란히 보여 준다 (예: 화면 캡처 + 현장 사진)
  App.shot = (name, alt) => {
    const list = String(name || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (list.length > 1) return `<div class="shots n${list.length}">${list.map((n) => one(n)).join('')}</div>${alt ? `<p class="small muted">${esc(alt)}</p>` : ''}`;
    return one(list[0] || '', alt);
  };
  const one = (name, alt) => name
    ? `<figure class="shot" data-img="${esc(name)}"><button class="shot-btn" data-zoom="${esc(name)}" aria-label="${esc(alt || '매뉴얼 이미지')} 크게 보기"><span class="shot-ph">이미지 불러오는 중…</span></button>
        ${alt ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>`
    : '';

  App.loadShots = (root) => {
    $$('[data-img]', root).forEach(async (fig) => {
      const name = fig.dataset.img;
      const btn = $('.shot-btn', fig);
      try {
        const url = await Store.image(name);
        if (!url) throw new Error('이미지 없음');
        btn.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
      } catch (e) {
        const msg = e.code === 'image_folder_missing' || e.code === 'image_not_found'
          ? '이미지가 아직 드라이브에 없습니다 (시트의 TDL 도구 → 매뉴얼 이미지 zip 풀기)'
          : e.message;
        btn.innerHTML = `<span class="shot-ph warn">${esc(msg)}</span>`;
        btn.disabled = true;
      }
    });
  };

  function lightbox(name) {
    const url = Store.images[name];
    if (!url) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.innerHTML = `<div class="lb-bar"><span class="muted small">이미지를 누르면 확대·축소</span><button class="icon-btn" data-x aria-label="닫기">✕</button></div>
      <div class="lb-scroll"><img src="${url}" alt="매뉴얼 이미지"></div>`;
    document.body.appendChild(dlg);
    const close = () => { dlg.close(); dlg.remove(); };
    $('[data-x]', dlg).addEventListener('click', close);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    $('img', dlg).addEventListener('click', (e) => e.currentTarget.classList.toggle('zoomed'));
    dlg.showModal();
  }
  document.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]');
    if (z && !z.disabled) lightbox(z.dataset.zoom);
  });

  // 단계 본문: ①②… 줄은 번호 목록으로, 주소는 링크로
  function stepBody(text) {
    const link = (t) => esc(t).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    return `<ol class="g-lines">${lines.map((l) => {
      if (l.startsWith('!!')) return `<li class="g-alert" role="alert"><span>${link(l.replace(/^!!\s*/, ''))}</span></li>`;
      const m = l.match(/^([①-⑳])\s*(.*)$/);
      return m ? `<li><span class="g-no">${m[1]}</span><span>${link(m[2])}</span></li>` : `<li class="plain"><span>${link(l)}</span></li>`;
    }).join('')}</ol>`;
  }

  // 오늘 날짜로 기기에 저장되는 단계 체크
  const ckKey = () => `tdl.gcheck.${Store.today()}`;
  const loadCk = () => { try { return JSON.parse(localStorage.getItem(ckKey()) || '{}'); } catch (e) { return {}; } };
  const saveCk = (c) => { try { localStorage.setItem(ckKey(), JSON.stringify(c)); } catch (e) { /* 무시 */ } };

  App.guidesFor = (stationId, kinds) => Store.all('guides')
    .filter((g) => (!stationId || String(g.stations || g.equip || '').split(',').includes(stationId)) && (!kinds || kinds.includes(g.kind)))
    .sort((a, b) => a.order - b.order);
  App.guideSteps = (gid) => Store.where('guideSteps', (s) => s.guideId === gid).sort((a, b) => a.order - b.order);

  App.guideLink = (g) => {
    const n = App.guideSteps(g.id).length;
    return `<a class="g-link" href="#/play/g~${esc(g.id)}/0"><span class="badge">${esc(PHASE[g.kind] || '')}</span>
      <b>${esc(g.title)}</b><small>${n ? `${n}단계` : '작성 필요'}</small><span class="chev" aria-hidden="true">›</span></a>`;
  };

  App.views.guide = {
    nav: 'prep',
    render(id) {
      const g = Store.get('guides', id);
      if (!g) return '<section class="page"><p>가이드를 찾을 수 없습니다.</p><a href="#/prep">준비로</a></section>';
      const steps = App.guideSteps(id);
      const ck = loadCk();
      const done = steps.filter((s) => ck[s.id]).length;
      return `<section class="page guide-page">
        <button class="back linkish" data-back>‹ 뒤로</button>
        <header class="page-head"><div>
          <span class="badge">${esc(PHASE[g.kind] || '')}</span>
          <h2>${esc(g.title)} ${UI.badgeRecent(g)}</h2>
          ${g.summary ? `<p class="muted small g-summary">${esc(g.summary)}</p>` : ''}
        </div>${App.editBtn(`data-edit-guide="${esc(id)}"`, '✎ 가이드 정보')}</header>
        ${steps.length ? `<div class="progress card"><div class="bar"><span style="width:${Math.round((done / steps.length) * 100)}%"></span></div>
          <span><b>${done}</b> / ${steps.length} 단계 완료</span><small class="muted">체크는 이 기기에 오늘 날짜로 저장</small></div>
          <nav class="g-toc" aria-label="단계 목록">${steps.map((s, i) => `<a href="#gs-${esc(s.id)}" data-jump="${esc(s.id)}" class="${ck[s.id] ? 'done' : ''}">${i + 1}. ${esc(s.title)}</a>`).join('')}</nav>`
          : '<div class="todo">✍️ 작성 필요<small>절차를 전달받으면 편집 모드에서 단계를 추가하세요.</small></div>'}
        <ol class="g-steps">${steps.map((s, i) => `<li class="g-step card${ck[s.id] ? ' done' : ''}" id="gs-${esc(s.id)}">
          <header><span class="st-no">${i + 1}</span><h3>${esc(s.title)}</h3>${UI.badgeRecent(s)}${App.editBtn(`data-edit-step="${esc(s.id)}"`, '✎')}</header>
          <div class="g-grid">${App.shot(s.image)}<div class="g-text">${stepBody(s.body)}
            ${s.note ? `<p class="g-note">${esc(s.note)}</p>` : ''}
            <label class="check g-done"><input type="checkbox" data-step="${esc(s.id)}"${ck[s.id] ? ' checked' : ''}><span>이 단계 완료</span></label></div></div>
        </li>`).join('')}</ol>
        ${App.editBtn(`data-add-step="${esc(id)}"`, '+ 단계 추가')}
      </section>`;
    },
    mount(root) {
      App.loadShots(root);
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-back]')) { if (history.length > 1) history.back(); else App.navigate('#/prep'); return; }
        const j = e.target.closest('[data-jump]');
        if (j) { e.preventDefault(); const el = document.getElementById('gs-' + j.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.editStep) editStep(t.dataset.editStep);
        else if (t.dataset.addStep) editStep('', t.dataset.addStep);
        else if (t.dataset.editGuide) editGuide(t.dataset.editGuide);
      });
      root.addEventListener('change', (e) => {
        const c = e.target.closest('[data-step]'); if (!c) return;
        const ck = loadCk(); ck[c.dataset.step] = c.checked; saveCk(ck);
        App.rerender();
      });
    },
  };

  async function editStep(id, guideId) {
    const s = id ? Store.get('guideSteps', id) : { id: '', guideId, order: App.guideSteps(guideId).length + 1, title: '', image: '', body: '', note: '' };
    const res = await form(id ? '단계 수정' : '단계 추가', [
      { key: 'title', label: '단계 제목', required: true },
      { key: 'body', label: '설명', type: 'textarea', rows: 8, hint: '한 줄에 하나. ①②③ 으로 시작하면 이미지의 번호와 맞춰 표시됩니다. 주소(https://…)는 링크가 됩니다.' },
      { key: 'note', label: '주의 (선택)', type: 'textarea', rows: 2 },
      { key: 'image', label: '이미지 파일 이름 (선택)', placeholder: '예: v052-1.jpg', hint: '구글 드라이브 TDL_manual_images 폴더에 있는 파일 이름. 여러 장이면 쉼표로 구분하면 나란히 보입니다' },
      { key: 'order', label: '순서', type: 'number' },
    ], s, id ? { danger: '삭제' } : null);
    if (!res) return;
    if (res._action === 'delete') Store.remove('guideSteps', id); else Store.upsert('guideSteps', Object.assign({}, s, res));
  }

  async function editGuide(id) {
    const g = Store.get('guides', id);
    const res = await form('가이드 정보', [
      { key: 'title', label: '제목', required: true },
      { key: 'summary', label: '요약', type: 'textarea', rows: 3 },
      { key: 'equip', label: '설비', type: 'select', options: App.equipTabs().map((t) => [t.id, t.short]) },
      { key: 'kind', label: '구분', type: 'select', options: Object.entries(App.KIND_LABEL).filter(([k]) => k !== 'field') },
      { key: 'variant', label: '버튼 이름 (예: 입고, 출고, P2P — 비우면 제목)' },
      { key: 'optional', label: '필요할 때만 하는 매뉴얼', type: 'select', options: [['false', '아니요'], ['true', '예 (필요 시)']] },
      { key: 'prepCat', label: '준비 카테고리', type: 'select', options: [['', '없음'], ['order', '오더 업로드'], ['field', '현장 준비']] },
      { key: 'routine', label: '카테고리 안 순서 (비우면 이어서 진행에서 빠짐)', type: 'number' },
      { key: 'closeRoutine', label: '정리 루틴 순서 (비우면 빠짐)', type: 'number' },
      { key: 'stations', label: '투어 중 보여 줄 장소 (쉼표로 구분)', hint: '예: s9,s11 — 그 장소의 투어 화면 ‘체크’ 탭에 시연 · 참고 매뉴얼이 보입니다' },
    ], Object.assign({}, g, { optional: String(g.optional) }));
    if (res) Store.upsert('guides', Object.assign({}, g, res, { optional: res.optional === 'true' }));
  }
  App.editGuide = editGuide;

  App.guideStepBody = stepBody;
})();
