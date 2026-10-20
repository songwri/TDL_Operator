/* 앱 셸: 라우터, 공통 상태, 공통 조각 */
(function () {
  const { esc, $, $$ } = UI;

  const App = {
    views: {},
    // 현재 투어 설정 (기기별로 기억)
    prefs: {
      load() {
        try { return Object.assign({ routeId: 'r_basic', tourType: '일반', biz: [], guide: '', lang: 'ko', joke: true, font: 18 }, JSON.parse(localStorage.getItem('tdl.prefs') || '{}')); }
        catch (e) { return { routeId: 'r_basic', tourType: '일반', biz: [], guide: '', lang: 'ko', joke: true, font: 18 }; }
      },
      save(p) { try { localStorage.setItem('tdl.prefs', JSON.stringify(p)); } catch (e) { /* 무시 */ } },
    },

    routePoints(route) { try { return JSON.parse(route.points || '[]'); } catch (e) { return []; } },
    routeStops(route) {
      const seen = new Set();
      return this.routePoints(route).filter((p) => p.stop && !seen.has(p.stop) && seen.add(p.stop)).map((p) => p.stop);
    },
    currentRoute() {
      const p = this.prefs.load();
      return Store.get('routes', p.routeId) || Store.all('routes')[0];
    },
    stationsSorted() { return Store.all('stations').slice().sort((a, b) => a.order - b.order); },
    stopOrder(route) {
      const m = {};
      this.routeStops(route).forEach((id, i) => { m[id] = i + 1; });
      return m;
    },
    minutesOf(route) {
      return this.routeStops(route).reduce((sum, id) => sum + (Number((Store.get('stations', id) || {}).minutes) || 0), 0);
    },
    pendingCount(stationId) {
      return Store.where('qa', (q) => q.stationId === stationId && q.status === '확인필요').length
        + Store.where('specs', (s) => s.stationId === stationId && s.status === '확인필요').length;
    },

    lockButton() {
      if (Store.status !== 'ready') return '';
      const on = Store.isUnlocked();
      return `<button class="lock-btn${on ? ' on' : ''}" data-lock aria-label="${on ? '편집 모드 끄기' : '편집 모드 켜기'}">
        <span aria-hidden="true">${on ? '🔓' : '🔒'}</span><span class="lock-text">${on ? esc(Store.editor) + ' 편집 중' : '편집'}</span></button>`;
    },
    editBtn(attrs, label) {
      return Store.isUnlocked() ? `<button class="btn small ghost" ${attrs}>${label || '✎ 수정'}</button>` : '';
    },

    navigate(hash) { if (location.hash === hash) this.render(); else location.hash = hash; },

    syncBadge() {
      const s = Store.sync;
      const map = {
        saving: ['saving', '저장 중…'],
        saved: ['ok', `${Store.adapter.kind === 'local' ? '이 기기' : '시트'} 동기화 ${s.at.slice(11)}`],
        error: ['err', '저장 실패 · 다시 불러오기'],
        offline: ['off', `오프라인 · ${s.at} 데이터`],
        idle: ['ok', Store.adapter.kind === 'local' ? '시험용(이 기기)' : '시트 연결됨'],
      };
      const [cls, text] = map[s.state] || map.idle;
      return `<button class="sync ${cls}" data-sync title="${esc(s.error || '')}">${esc(text)}</button>`;
    },

    render() {
      const hash = location.hash || '#/tour';
      let [, name, arg] = hash.match(/^#\/([^/?]+)\/?([^?]*)/) || [null, 'tour', ''];
      if (Store.status !== 'ready' || !Store.all('stations').length) { name = 'gate'; arg = ''; }
      const view = this.views[name] || this.views.tour;
      document.body.dataset.view = name;
      $('#sync-slot').innerHTML = name !== 'gate' ? this.syncBadge() : '';
      $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === (view.nav || name)));
      $('#lock-slot').innerHTML = name !== 'gate' ? this.lockButton() : '';
      if (view.unmount) view.unmount();
      if (this._active && this._active !== view && this._active.unmount) this._active.unmount();
      // 렌더마다 새 컨테이너로 교체해 이전 화면의 이벤트 리스너가 쌓이지 않게 한다
      const old = $('#main');
      const main = old.cloneNode(false);
      old.replaceWith(main);
      this._active = view;
      main.innerHTML = view.render(decodeURIComponent(arg || ''));
      if (view.mount) view.mount(main, decodeURIComponent(arg || ''));
      // 접속되면 잠시 뒤 매뉴얼 이미지를 이 기기에 미리 받아 둔다 (한 번만, 데이터 절약 모드면 건너뜀)
      if (!this._prefetched && Store.status === 'ready' && Store.adapter.kind === 'sheet' && !(navigator.connection && navigator.connection.saveData)) {
        this._prefetched = true;
        setTimeout(() => Store.prefetch(Store.all('guideSteps').map((x) => x.image)), 2500);
      }
      if (!this._keepScroll) window.scrollTo(0, 0);
      this._keepScroll = false;
    },
    rerender() { this._keepScroll = true; this.render(); },
  };

  window.App = App;

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-sync]')) { if (Store.adapter.kind === 'sheet') { await Store.reload(); UI.toast(Store.sync.state === 'saved' ? '시트에서 다시 불러왔습니다' : '불러오기 실패'); } return; }
    const lock = e.target.closest('[data-lock]');
    if (!lock) return;
    if (Store.isUnlocked()) { Store.lock(); UI.toast('편집 모드를 껐습니다'); }
    else await UI.requireUnlock();
  });

  window.addEventListener('DOMContentLoaded', () => {
    Store.onChange(() => { App.rerender(); });
    window.addEventListener('hashchange', () => App.render());
    App.render();
    Store.init();
  });
})();

// 헤더 높이를 CSS 변수로 알려 줘서, 헤더 아래에 고정되는 요소(진행 바)가 정확히 붙도록 한다
(function () {
  const head = document.querySelector('.app-head');
  if (!head) return;
  const set = () => document.documentElement.style.setProperty('--head-h', head.offsetHeight + 'px');
  set();
  window.addEventListener('resize', set);
  if (window.ResizeObserver) new ResizeObserver(set).observe(head);
})();
