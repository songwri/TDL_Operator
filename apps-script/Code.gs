/**
 * TDL 투어 가이드 — 구글 시트 연결용 Apps Script
 *
 * 설치 (시트 TDL_Operator 에서 1회):
 *   1) 확장 프로그램 → Apps Script → 이 파일 내용을 Code.gs 에 붙여넣고 저장
 *   2) 프로젝트 설정(톱니) → 스크립트 속성에 추가
 *        ACCESS_PASSWORD = 접속 비밀번호 (웹앱에 들어올 때)
 *        EDIT_PASSWORD   = 편집 비밀번호 (없으면 0000)
 *   3) 배포 → 새 배포 → 유형: 웹 앱
 *        다음 사용자 인증 정보로 실행: 나
 *        액세스 권한: 모든 사용자
 *      → 나오는 웹 앱 URL(…/exec)을 웹앱 설정에 입력
 *   코드를 고친 뒤에는 배포 → 배포 관리 → 수정 → 새 버전으로 다시 배포해야 반영됩니다.
 *
 * 데이터는 시트의 탭(테이블)마다 1행 머리글 + 행 단위로 저장됩니다.
 * 비밀번호는 시트가 아니라 스크립트 속성에만 저장되므로, 시트를 공유해도 노출되지 않습니다.
 */

const TABLES = ['settings', 'stations', 'actions', 'videos', 'specs', 'qa', 'routes', 'transitions',
  'manual', 'contacts', 'tourLogs', 'history'];
const TZ = 'Asia/Seoul';

function doGet() {
  return json_({ ok: true, app: 'TDL 투어 가이드 API', note: '웹앱에서 POST로 호출합니다.' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const props = PropertiesService.getScriptProperties();
  const access = props.getProperty('ACCESS_PASSWORD');
  const edit = props.getProperty('EDIT_PASSWORD') || '0000';
  if (!access) return json_({ ok: false, error: 'not_configured' });
  if (req.password !== access) { Utilities.sleep(700); return json_({ ok: false, error: 'wrong_password' }); }
  const isEditor = req.editPassword === edit;
  const needEdit = () => json_({ ok: false, error: 'wrong_edit_password' });

  try {
    switch (req.action) {
      case 'load':
        return json_({ ok: true, data: loadAll_(), serverTime: now_() });
      case 'checkEdit':
        if (!isEditor) Utilities.sleep(500);
        return json_({ ok: isEditor, error: isEditor ? '' : 'wrong_edit_password' });
      case 'upsert':
        if (!isEditor) return needEdit();
        return json_(withLock_(() => upsert_(req.table, req.row, req.editor)));
      case 'remove':
        if (!isEditor) return needEdit();
        return json_(withLock_(() => remove_(req.table, req.id, req.editor)));
      case 'importAll':
        if (!isEditor) return needEdit();
        return json_(withLock_(() => importAll_(req.data)));
      case 'setPassword':
        if (!isEditor) return needEdit();
        if (!req.value || String(req.value).length < 4) return json_({ ok: false, error: 'too_short' });
        props.setProperty(req.kind === 'access' ? 'ACCESS_PASSWORD' : 'EDIT_PASSWORD', String(req.value));
        appendHistory_('settings', req.kind === 'access' ? 'ACCESS_PASSWORD' : 'EDIT_PASSWORD', '수정', null, null, req.editor);
        return json_({ ok: true });
      default:
        return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}

/* ───────── 시트 입출력 ───────── */

function idField_(table) { return table === 'settings' ? 'key' : 'id'; }

function sheet_(table, create) {
  if (TABLES.indexOf(table) < 0) throw new Error('unknown table: ' + table);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(table);
  if (!sh && create) {
    sh = ss.insertSheet(table);
    sh.getRange(1, 1, 1, 1).setValue(idField_(table));
  }
  return sh;
}

function headers_(sh) {
  const last = sh.getLastColumn();
  if (!last) return [];
  return sh.getRange(1, 1, 1, last).getDisplayValues()[0].filter(String);
}

function ensureHeaders_(sh, keys) {
  const hs = headers_(sh);
  const missing = keys.filter((k) => hs.indexOf(k) < 0);
  if (missing.length) {
    sh.getRange(1, hs.length + 1, 1, missing.length).setNumberFormat('@').setValues([missing]);
    sh.setFrozenRows(1);
  }
  return hs.concat(missing);
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function readTable_(table) {
  const sh = sheet_(table, false);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  const hs = values[0];
  return values.slice(1).filter((r) => r.some(String)).map((r) => {
    const o = {};
    hs.forEach((h, i) => { if (h) o[h] = r[i]; });
    return o;
  });
}

function loadAll_() {
  const out = {};
  TABLES.forEach((t) => { out[t] = t === 'history' ? readTable_(t).slice(-300) : readTable_(t); });
  return out;
}

function findRow_(sh, hs, table, id) {
  const col = hs.indexOf(idField_(table)) + 1;
  if (!col || sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, col, sh.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === String(id)) return i + 2;
  return -1;
}

function rowObject_(sh, hs, r) {
  const vals = sh.getRange(r, 1, 1, hs.length).getDisplayValues()[0];
  const o = {};
  hs.forEach((h, i) => { o[h] = vals[i]; });
  return o;
}

function upsert_(table, row, editor) {
  if (!row || !row[idField_(table)]) return { ok: false, error: 'missing_id' };
  const sh = sheet_(table, true);
  const hs = ensureHeaders_(sh, Object.keys(row));
  const r = findRow_(sh, hs, table, row[idField_(table)]);
  const before = r > 0 ? rowObject_(sh, hs, r) : null;
  const merged = Object.assign({}, before || {}, row);
  const line = hs.map((h) => cell_(merged[h]));
  const target = r > 0 ? r : sh.getLastRow() + 1;
  sh.getRange(target, 1, 1, hs.length).setNumberFormat('@').setValues([line]);
  if (table !== 'history') appendHistory_(table, row[idField_(table)], before ? '수정' : '추가', before, row, editor);
  return { ok: true };
}

function remove_(table, id, editor) {
  const sh = sheet_(table, false);
  if (!sh) return { ok: true };
  const hs = headers_(sh);
  const r = findRow_(sh, hs, table, id);
  if (r > 0) {
    const before = rowObject_(sh, hs, r);
    sh.deleteRow(r);
    appendHistory_(table, id, '삭제', before, null, editor);
  }
  return { ok: true };
}

function importAll_(data) {
  if (!data || !Array.isArray(data.stations)) return { ok: false, error: 'bad_data' };
  TABLES.forEach((t) => {
    const rows = data[t] || [];
    let sh = sheet_(t, true);
    sh.clear();
    const keys = [idField_(t)];
    rows.forEach((r) => Object.keys(r).forEach((k) => { if (keys.indexOf(k) < 0) keys.push(k); }));
    const matrix = [keys].concat(rows.map((r) => keys.map((k) => cell_(r[k]))));
    sh.getRange(1, 1, matrix.length, keys.length).setNumberFormat('@').setValues(matrix);
    sh.setFrozenRows(1);
  });
  return { ok: true };
}

function appendHistory_(table, rowId, action, before, after, editor) {
  const sh = sheet_('history', true);
  const keys = ['id', 'table', 'rowId', 'action', 'before', 'after', 'at', 'by'];
  const hs = ensureHeaders_(sh, keys);
  const rec = {
    id: 'h' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    table: table, rowId: String(rowId), action: action,
    before: before ? JSON.stringify(before) : '', after: after ? JSON.stringify(after) : '',
    at: now_(), by: editor || '',
  };
  sh.getRange(sh.getLastRow() + 1, 1, 1, hs.length).setNumberFormat('@').setValues([hs.map((h) => cell_(rec[h]))]);
}

/* ───────── 도우미 ───────── */

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
