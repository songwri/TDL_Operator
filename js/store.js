/* 데이터 저장소.
 * 모든 데이터는 평평한 테이블(행 목록)이다 → 구글 시트 탭 / SharePoint 목록 / Dataverse 로 그대로 대응.
 * 저장 위치는 어댑터로 분리:
 *   - SheetAdapter : 구글 시트(Apps Script 웹앱) — 기본. 접속·편집 비밀번호는 서버(스크립트 속성)에서 확인
 *   - LocalAdapter : 이 기기 브라우저 — 연결 전 시험용(JSON 파일을 열어 사용)
 * 화면은 메모리의 Store.data 를 바로 그리고, 저장은 뒤에서 어댑터로 보낸다.
 */
(function () {
  const TABLES = ['settings', 'stations', 'actions', 'videos', 'specs', 'qa', 'routes', 'transitions', 'manual', 'contacts', 'tourLogs', 'history', 'guides', 'guideSteps'];
  // 시트에는 모든 값이 글자로 저장되므로 읽을 때 형을 되돌린다
  const NUM = { stations: ['x', 'y', 'minutes', 'order'], actions: ['order'], specs: ['order'], manual: ['order'], tourLogs: ['headcount', 'minutes'], guides: ['order'], guideSteps: ['order'] };
  const BOOL = { stations: ['equipment', 'optional'], qa: ['common'] };
  // 배포 설정(config.js)의 주소가 있으면 항상 그것을 쓴다. 기기에 남은 예전 입력값보다 우선.
  const cfgUrl = () => String((window.TDL_CONFIG || {}).scriptUrl || '').trim();

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };
  const idField = (t) => (t === 'settings' ? 'key' : 'id');
  const IMG_CACHE = 'tdl-img-v1';
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nowStamp = () => { const d = new Date(); return `${today()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  async function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return 'nohash:' + text.length;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tdl:' + text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function normalize(data) {
    const out = { version: 1 };
    TABLES.forEach((t) => {
      out[t] = (data && Array.isArray(data[t]) ? data[t] : []).map((r) => {
        const o = Object.assign({}, r);
        (NUM[t] || []).forEach((k) => { if (k in o) o[k] = o[k] === '' || o[k] == null ? '' : Number(o[k]); });
        (BOOL[t] || []).forEach((k) => { if (k in o) o[k] = o[k] === true || String(o[k]).toLowerCase() === 'true'; });
        return o;
      });
    });
    out.history.sort((a, b) => (a.at < b.at ? 1 : -1));
    return out;
  }

  // ───────── 어댑터 ─────────
  const SheetAdapter = {
    kind: 'sheet',
    name: '구글 시트',
    url() { return cfgUrl() || ls.get('tdl.scriptUrl') || ''; },
    fixed() { return !!cfgUrl(); },
    async call(body) {
      const res = await fetch(this.url(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 사전 요청(CORS preflight) 없이 보내기
        body: JSON.stringify(Object.assign({ password: Store.password }, body)),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok) { const e = new Error(json.message || json.error || 'error'); e.code = json.error; throw e; }
      return json;
    },
    async load() { return (await this.call({ action: 'load' })).data; },
    async checkEdit(pw) { try { await this.call({ action: 'checkEdit', editPassword: pw }); return true; } catch (e) { if (e.code === 'wrong_edit_password') return false; throw e; } },
    upsert(table, row) { return this.call({ action: 'upsert', table, row, editPassword: Store.editPassword, editor: Store.editor }); },
    remove(table, id) { return this.call({ action: 'remove', table, id, editPassword: Store.editPassword, editor: Store.editor }); },
    importAll(data) { return this.call({ action: 'importAll', data, editPassword: Store.editPassword, editor: Store.editor }); },
    setPassword(kind, value) { return this.call({ action: 'setPassword', kind, value, editPassword: Store.editPassword, editor: Store.editor }); },
  };

  const LocalAdapter = {
    kind: 'local',
    name: '이 기기 (시험용)',
    key: 'tdl.local.data',
    async load() { const raw = ls.get(this.key); return raw ? JSON.parse(raw) : null; },
    save() { ls.set(this.key, JSON.stringify(Store.data)); },
    async checkEdit(pw) { return pw === (Store.setting('localEditPassword', '0000')); },
    async upsert() { this.save(); return { ok: true }; },
    async remove() { this.save(); return { ok: true }; },
    async importAll(data) { ls.set(this.key, JSON.stringify(data)); return { ok: true }; },
    async setPassword(kind, value) { Store.setSettingLocal('localEditPassword', value); this.save(); return { ok: true }; },
  };

  const Store = {
    TABLES,
    today,
    data: normalize({}),
    adapter: SheetAdapter,
    status: 'boot',          // boot | setup | login | ready
    sync: { state: 'idle', at: '', error: '' }, // idle | saving | saved | error | offline
    password: '',
    editPassword: '',
    editor: '',
    listeners: [],

    // ───────── 시작 · 접속 ─────────
    async init() {
      this.editor = ss.get('tdl.editor') || '';
      this.editPassword = ss.get('tdl.editPw') || '';
      // 배포 주소가 있으면 시험용 모드·예전 URL 기록은 지운다
      if (cfgUrl()) { ls.del('tdl.mode'); ls.del('tdl.scriptUrl'); }
      // 브라우저가 옛 config.js 를 기억해 주소가 비어 보이면, 새로 받아 한 번 더 확인
      if (!cfgUrl() && !ls.get('tdl.scriptUrl')) {
        try {
          const txt = await (await fetch('config.js?ts=' + Date.now(), { cache: 'no-store' })).text();
          const m = txt.match(/scriptUrl:\s*['"]([^'"]+)['"]/);
          if (m) window.TDL_CONFIG = Object.assign({}, window.TDL_CONFIG, { scriptUrl: m[1] });
        } catch (e) { /* 오프라인 등 — 무시 */ }
      }
      const mode = ls.get('tdl.mode');
      if (mode === 'local') {
        this.adapter = LocalAdapter;
        const d = await LocalAdapter.load();
        if (d) { this.data = normalize(d); this.status = 'ready'; } else this.status = 'setup';
        return this.emit();
      }
      this.adapter = SheetAdapter;
      if (!SheetAdapter.url()) { this.status = 'setup'; return this.emit(); }
      const pw = ss.get('tdl.pw') || ls.get('tdl.pw');
      if (!pw) { this.status = 'login'; return this.emit(); }
      await this.login(pw, !!ls.get('tdl.pw'));
    },
    async login(pw, remember) {
      this.password = pw; this.lastError = '';
      try {
        const d = await SheetAdapter.load();
        this.data = normalize(d);
        this.status = 'ready';
        this.sync = { state: 'saved', at: nowStamp(), error: '' };
        ss.set('tdl.pw', pw);
        if (remember) ls.set('tdl.pw', pw); else ls.del('tdl.pw');
        ls.set('tdl.cache', JSON.stringify(this.data));
        ls.set('tdl.cacheHash', await sha256(pw));
        ls.set('tdl.cacheAt', nowStamp());
        this.emit();
        return { ok: true };
      } catch (e) {
        if (e.code === 'wrong_password') { ss.del('tdl.pw'); ls.del('tdl.pw'); this.status = 'login'; this.emit(); return { ok: false, error: '비밀번호가 맞지 않습니다' }; }
        if (e.code === 'not_configured') { this.status = 'login'; this.emit(); return { ok: false, error: 'Apps Script에 ACCESS_PASSWORD가 설정되지 않았습니다' }; }
        // 네트워크 실패 → 이 기기에 저장된 마지막 데이터로 열기 (비밀번호 해시가 같을 때만)
        const cache = ls.get('tdl.cache');
        if (cache && ls.get('tdl.cacheHash') === (await sha256(pw))) {
          this.data = normalize(JSON.parse(cache));
          this.status = 'ready';
          this.sync = { state: 'offline', at: ls.get('tdl.cacheAt') || '', error: '' };
          ss.set('tdl.pw', pw);
          this.emit();
          return { ok: true };
        }
        this.status = 'login'; this.lastError = e.code ? 'server' : 'network'; this.emit();
        if (e.code === 'server_error') return { ok: false, error: 'Apps Script 실행 오류: ' + (e.message || '') };
        return { ok: false, error: '시트 서버에 연결하지 못했습니다 (' + e.message + ')' };
      }
    },
    logout() {
      ss.del('tdl.pw'); ls.del('tdl.pw'); ls.del('tdl.cache'); ls.del('tdl.cacheHash');
      this.images = {}; try { if (window.caches) caches.delete(IMG_CACHE); } catch (e) { /* 무시 */ }
      this.password = ''; this.lock(true);
      this.status = this.adapter.kind === 'local' ? 'setup' : 'login';
      this.data = normalize({});
      this.emit();
    },
    setScriptUrl(url) { ls.set('tdl.scriptUrl', url.trim()); ls.del('tdl.mode'); },
    async startLocal(jsonText) {
      const obj = JSON.parse(jsonText);
      if (!obj || !Array.isArray(obj.stations)) throw new Error('TDL 데이터 파일이 아닙니다');
      ls.set('tdl.mode', 'local');
      this.adapter = LocalAdapter;
      this.data = normalize(obj);
      LocalAdapter.save();
      this.status = 'ready';
      this.emit();
    },
    leaveLocal() { ls.del('tdl.mode'); ls.del(LocalAdapter.key); this.adapter = SheetAdapter; this.status = SheetAdapter.url() ? 'login' : 'setup'; this.data = normalize({}); this.emit(); },
    async reload() {
      if (this.adapter.kind !== 'sheet') return;
      this.setSync('saving');
      try {
        this.data = normalize(await SheetAdapter.load());
        ls.set('tdl.cache', JSON.stringify(this.data)); ls.set('tdl.cacheAt', nowStamp());
        this.setSync('saved');
        this.emit();
      } catch (e) { this.setSync('error', e.message); }
    },

    // ───────── 매뉴얼 이미지 (구글 드라이브 → Apps Script, 기기에 캐시) ─────────
    images: {},
    async image(name) {
      if (!name) return null;
      if (this.images[name]) return this.images[name];
      const key = location.origin + '/__tdl_img/' + encodeURIComponent(name);
      try {
        if (window.caches) {
          const hit = await (await caches.open(IMG_CACHE)).match(key);
          if (hit) return (this.images[name] = await hit.text());
        }
      } catch (e) { /* 캐시 사용 불가 — 무시 */ }
      if (this.adapter.kind !== 'sheet') throw new Error('시트에 연결해야 이미지를 볼 수 있습니다');
      const res = await SheetAdapter.call({ action: 'image', name });
      const url = `data:${res.mime || 'image/jpeg'};base64,${res.data}`;
      this.images[name] = url;
      try { if (window.caches) await (await caches.open(IMG_CACHE)).put(key, new Response(url)); } catch (e) { /* 무시 */ }
      return url;
    },

    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach((fn) => fn()); },
    setSync(state, error) {
      this.sync = { state, at: state === 'saved' ? nowStamp() : this.sync.at, error: error || '' };
      const el = document.getElementById('sync-slot');
      if (el && window.App) el.innerHTML = App.syncBadge();
    },

    // ───────── 조회 ─────────
    all(table) { return this.data[table] || []; },
    get(table, id) { return this.all(table).find((r) => r[idField(table)] === id); },
    where(table, pred) { return this.all(table).filter(pred); },
    setting(key, fallback) { const row = this.get('settings', key); return row ? row.value : fallback; },
    settingJson(key, fallback) { try { return JSON.parse(this.setting(key, '')); } catch (e) { return fallback; } },

    // ───────── 편집 잠금 ─────────
    isUnlocked() { return !!this.editPassword; },
    async unlock(password, editor) {
      let ok;
      try { ok = await this.adapter.checkEdit(password); } catch (e) { return { ok: false, error: '연결 실패: ' + e.message }; }
      if (!ok) return { ok: false, error: '편집 비밀번호가 맞지 않습니다' };
      this.editPassword = password; this.editor = editor;
      ss.set('tdl.editPw', password); ss.set('tdl.editor', editor);
      this.emit();
      return { ok: true };
    },
    lock(silent) { this.editPassword = ''; ss.del('tdl.editPw'); if (!silent) this.emit(); },

    // ───────── 쓰기 (화면 먼저 반영 → 뒤에서 저장) ─────────
    newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); },
    localLog(table, rowId, action, before, after) {
      this.data.history.unshift({
        id: this.newId('h'), table, rowId, action,
        before: before ? JSON.stringify(before) : '', after: after ? JSON.stringify(after) : '',
        at: nowStamp(), by: this.editor || '',
      });
    },
    async push(fn) {
      this.setSync('saving');
      try {
        await fn();
        this.setSync('saved');
        if (this.adapter.kind === 'sheet') { ls.set('tdl.cache', JSON.stringify(this.data)); ls.set('tdl.cacheAt', nowStamp()); }
      } catch (e) {
        this.setSync('error', e.code === 'wrong_edit_password' ? '편집 비밀번호가 바뀌었습니다. 다시 편집 모드를 켜 주세요' : e.message);
        if (e.code === 'wrong_edit_password') this.lock();
        if (window.UI) UI.toast('시트 저장 실패 — 상단 상태를 눌러 다시 불러오세요');
      }
    },
    upsert(table, row) {
      const list = this.all(table);
      const key = idField(table);
      const stamped = Object.assign({}, row, { updatedAt: today(), updatedBy: this.editor || '' });
      if (!stamped[key]) stamped[key] = this.newId(table.slice(0, 2));
      const idx = list.findIndex((r) => r[key] === stamped[key]);
      if (idx >= 0) { this.localLog(table, stamped[key], '수정', list[idx], stamped); list[idx] = stamped; }
      else {
        if (table === 'qa' || table === 'tourLogs') { stamped.createdAt = stamped.createdAt || today(); stamped.createdBy = stamped.createdBy || this.editor || ''; }
        this.localLog(table, stamped[key], '추가', null, stamped);
        list.push(stamped);
      }
      this.emit();
      this.push(() => this.adapter.upsert(table, stamped));
      return stamped;
    },
    remove(table, id) {
      const list = this.all(table);
      const idx = list.findIndex((r) => r[idField(table)] === id);
      if (idx < 0) return;
      this.localLog(table, id, '삭제', list[idx], null);
      list.splice(idx, 1);
      this.emit();
      this.push(() => this.adapter.remove(table, id));
    },
    setSetting(key, value) { this.upsert('settings', { key, value }); },
    setSettingLocal(key, value) {
      const row = this.get('settings', key);
      if (row) row.value = value; else this.data.settings.push({ key, value });
    },
    async setPassword(kind, value) {
      try { await this.adapter.setPassword(kind, value); } catch (e) { return { ok: false, error: e.code === 'too_short' ? '4자 이상으로 정해 주세요' : e.message }; }
      if (kind === 'edit') { this.editPassword = value; ss.set('tdl.editPw', value); }
      if (kind === 'access') { this.password = value; ss.set('tdl.pw', value); if (ls.get('tdl.pw')) ls.set('tdl.pw', value); ls.set('tdl.cacheHash', await sha256(value)); }
      return { ok: true };
    },
    restore(historyId) {
      const h = this.get('history', historyId);
      if (!h || h.table === 'settings' && !h.before) return false;
      const before = h.before ? JSON.parse(h.before) : null;
      if (before) this.upsert(h.table, before); else this.remove(h.table, h.rowId);
      return true;
    },
    isRecent(row) {
      if (!row || !row.updatedAt) return false;
      const days = Number(this.setting('recentDays', '3')) || 3;
      const t = new Date(String(row.updatedAt).slice(0, 10) + 'T00:00:00');
      return (Date.now() - t.getTime()) / 86400000 <= days;
    },

    // ───────── 내보내기 / 가져오기 ─────────
    exportJson() { return JSON.stringify(this.data, null, 1); },
    async importAll(jsonText) {
      const obj = normalize(JSON.parse(jsonText));
      if (!obj.stations.length) throw new Error('TDL 데이터 파일이 아닙니다');
      await this.adapter.importAll(obj);
      this.data = obj;
      if (this.adapter.kind === 'local') LocalAdapter.save();
      this.emit();
    },
    toCsv(table) {
      const rows = this.all(table);
      const cols = [];
      rows.forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
      const esc = (v) => {
        const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      return '﻿' + [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n');
    },
  };

  window.Store = Store;
})();
