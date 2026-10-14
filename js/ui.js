/* 공통 UI 도우미: 이스케이프, 나레이션 서식, 모달 폼, 토스트, 편집 잠금 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // "00", "000" 같은 미기재 수치 강조
  function markPlaceholders(html) {
    return html.replace(/(^|[^\d.,])(0{2,})(?![\d.,])/g, '$1<mark class="ph" title="매뉴얼 미기재 값 — 확인 필요">$2</mark>');
  }
  const CUE = /Play|시연|오픈|정위치|포인터|가리키|이동하면서|가면서/;

  /** 나레이션 서식: [구간 제목] 줄은 소제목, (행동 지시)는 칩으로 */
  function narration(text, opts) {
    const o = opts || {};
    let t = text || '';
    if (o.guide) t = t.replace(/000\s?입니다/g, `${o.guide} 입니다`);
    // 엑셀 셀 안의 줄바꿈은 문장 중간에서 끊긴 경우가 많아, 문장이 끝나지 않은 줄은 이어 붙인다
    const lines = [];
    t.split('\n').forEach((raw) => {
      const line = raw.trim();
      const prev = lines[lines.length - 1];
      const startsNew = !line || /^[\[(（\-•※]/.test(line) || /^\d+\)/.test(line);
      if (prev && line && !startsNew && !/^\[[^\]]+\]$/.test(prev) && !/[.?!。)\]]$/.test(prev)) lines[lines.length - 1] = prev + ' ' + line;
      else lines.push(line);
    });
    return lines.map((raw) => {
      const line = raw.trim();
      if (!line) return '';
      const head = line.match(/^\[([^\]]+)\]$/);
      if (head) return `<h4 class="nar-seg">${esc(head[1])}</h4>`;
      let h = esc(line);
      h = h.replace(/\[([^\]]{1,60})\]/g, '<span class="cue">$1</span>');
      h = h.replace(/(^|\s)\(([^()]{1,60})\)/g, (m, pre, inner, offset) => {
        const atStart = offset === 0 || /^\s*$/.test(h.slice(0, offset));
        return atStart || CUE.test(inner) ? `${pre}<span class="cue">${inner}</span>` : m;
      });
      h = h.replace(/^-([^-]+)-/, '<span class="cue">$1</span>');
      return `<p>${markPlaceholders(h)}</p>`;
    }).join('');
  }

  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /**
   * 모달 폼. fields: [{key,label,type,options,hint,rows,required}]
   * 반환: 저장 시 값 객체, 취소 시 null. extra: {danger:'삭제'} → {_action:'delete'}
   */
  function form(title, fields, values, extra) {
    return new Promise((resolve) => {
      const v = values || {};
      const dlg = document.createElement('dialog');
      dlg.className = 'modal';
      const body = fields.map((f) => {
        const id = 'f_' + f.key;
        const val = v[f.key] == null ? '' : v[f.key];
        let input;
        if (f.type === 'textarea') input = `<textarea id="${id}" name="${f.key}" rows="${f.rows || 6}">${esc(val)}</textarea>`;
        else if (f.type === 'select') input = `<select id="${id}" name="${f.key}">${f.options.map((op) => {
          const [ov, ol] = Array.isArray(op) ? op : [op, op];
          return `<option value="${esc(ov)}"${String(ov) === String(val) ? ' selected' : ''}>${esc(ol)}</option>`;
        }).join('')}</select>`;
        else if (f.type === 'checkbox') input = `<label class="check"><input type="checkbox" id="${id}" name="${f.key}"${val ? ' checked' : ''}> ${esc(f.checkLabel || '')}</label>`;
        else input = `<input id="${id}" name="${f.key}" type="${f.type || 'text'}" value="${esc(val)}"${f.required ? ' required' : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>`;
        return `<div class="field">${f.type === 'checkbox' ? '' : `<label for="${id}">${esc(f.label)}</label>`}${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
      }).join('');
      dlg.innerHTML = `<form method="dialog" class="modal-form">
        <header><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-x aria-label="닫기">✕</button></header>
        <div class="modal-body">${body}</div>
        <footer>${extra && extra.danger ? `<button type="button" class="btn danger" data-del>${esc(extra.danger)}</button>` : ''}<span class="grow"></span>
          <button type="button" class="btn ghost" data-x>취소</button><button type="submit" class="btn primary">${esc((extra && extra.submit) || '저장')}</button></footer>
      </form>`;
      document.body.appendChild(dlg);
      const done = (res) => { dlg.close(); dlg.remove(); resolve(res); };
      $$('[data-x]', dlg).forEach((b) => b.addEventListener('click', () => done(null)));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      const del = $('[data-del]', dlg);
      if (del) del.addEventListener('click', () => { if (confirm('정말 삭제할까요? (변경 이력에서 되돌릴 수 있습니다)')) done({ _action: 'delete' }); });
      $('form', dlg).addEventListener('submit', (e) => {
        e.preventDefault();
        const out = {};
        fields.forEach((f) => {
          const el = $('#f_' + f.key, dlg);
          out[f.key] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? Number(el.value) : el.value.trim();
        });
        done(out);
      });
      dlg.showModal();
      const first = $('input,textarea,select', dlg);
      if (first) first.focus();
    });
  }

  async function requireUnlock() {
    if (Store.isUnlocked()) return true;
    const res = await form('편집 모드', [
      { key: 'password', label: '비밀번호', type: 'password', required: true, hint: '편집 권한 비밀번호 (기본 0000)' },
      { key: 'editor', label: '작성자 이름', required: true, hint: '수정 이력에 이름이 남습니다' },
    ], { editor: Store.editor }, { submit: '편집 시작' });
    if (!res) return false;
    const r = await Store.unlock(res.password, res.editor);
    if (!r.ok) { toast(r.error); return false; }
    toast(`${res.editor} 님, 편집 모드가 켜졌습니다`);
    return true;
  }

  const badgeRecent = (row) => Store.isRecent(row) ? `<span class="badge recent" title="${esc(row.updatedAt)} ${esc(row.updatedBy || '')}">수정됨</span>` : '';

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  window.UI = { esc, $, $$, narration, markPlaceholders, toast, form, requireUnlock, badgeRecent, download };
})();
