/* 첫 화면: 시트 연결(URL) → 접속 비밀번호 → (시트가 비어 있으면) 초기 데이터 업로드 */
(function () {
  const { esc, $, toast } = UI;
  let msg = '';

  function readFile(input) {
    return new Promise((resolve, reject) => {
      const f = input.files && input.files[0];
      if (!f) return reject(new Error('파일을 고르세요'));
      const rd = new FileReader();
      rd.onload = () => resolve(rd.result);
      rd.onerror = () => reject(new Error('파일을 읽지 못했습니다'));
      rd.readAsText(f);
    });
  }

  App.views.gate = {
    render() {
      const st = Store.status;
      const box = (inner) => `<section class="gate"><div class="gate-card card">
        <div class="gate-brand"><span class="logo">TDL</span><b>투어 가이드</b></div>${inner}
        ${msg ? `<p class="gate-msg" role="alert">${esc(msg)}</p>` : ''}
        <small class="muted gate-ver">버전 ${esc(window.TDL_BUILD || '개발')}</small></div></section>`;
      if (st === 'boot') return box('<p class="muted">불러오는 중…</p>');
      if (st === 'setup') {
        return box(`<h2>구글 시트 연결</h2>
          <p class="small muted">TDL_Operator 시트의 Apps Script 웹앱 URL을 입력하세요. 설치 방법은 저장소의 <code>apps-script/Code.gs</code> 맨 위 설명을 참고하세요.</p>
          <form data-setup class="gate-form">
            <label for="g-url">웹앱 URL</label>
            <input id="g-url" name="url" type="url" required placeholder="https://script.google.com/macros/s/…/exec">
            <button class="btn primary big block" type="submit">연결</button>
          </form>
          <details class="gate-alt"><summary>시트 없이 시험해 보기</summary>
            <p class="small muted">데이터 JSON 파일을 열어 이 기기에서만 사용합니다. 수정 내용은 다른 사람과 공유되지 않습니다.</p>
            <input type="file" accept=".json,application/json" data-local-file aria-label="데이터 JSON 파일">
          </details>`);
      }
      if (st === 'login') {
        return box(`<h2>접속 비밀번호</h2>
          <form data-login class="gate-form">
            <label for="g-pw">비밀번호</label>
            <input id="g-pw" name="pw" type="password" required autocomplete="current-password">
            <label class="check"><input type="checkbox" name="remember"> 이 기기에서 기억하기</label>
            <button class="btn primary big block" type="submit">들어가기</button>
          </form>
          ${Store.lastError === 'network' ? `<div class="card soft gate-help"><b>연결 점검</b>
            <ol class="small"><li>아래 버튼으로 시트 서버 주소를 직접 엽니다.</li>
              <li><code>"ok":true</code>와 <code>"version"</code>이 보이면 서버는 정상입니다. 잠시 후 다시 시도하세요.</li>
              <li>구글 로그인 화면이 나오면 → Apps Script 배포의 <b>액세스 권한</b>을 “모든 사용자”로.</li>
              <li>오류 문구나 “파일을 찾을 수 없음”이 나오면 → Code.gs 붙여넣기·배포 상태를 확인.</li></ol>
            <a class="btn small" href="${esc(Store.adapter.url())}" target="_blank" rel="noopener">시트 서버 주소 열기</a></div>` : ''}
          ${Store.adapter.fixed && Store.adapter.fixed() ? '' : '<button class="btn small ghost" data-change-url>연결 URL 변경</button>'}`);
      }
      // 연결은 됐지만 시트가 비어 있음
      return box(`<h2>시트가 비어 있습니다</h2>
        <p class="small muted">처음 한 번, 전달받은 초기 데이터 파일(tdl-seed.json)을 시트에 올려 주세요. 편집 비밀번호가 필요합니다.</p>
        <form data-import class="gate-form">
          <label for="g-epw">편집 비밀번호</label><input id="g-epw" name="epw" type="password" required>
          <label for="g-ed">작성자 이름</label><input id="g-ed" name="editor" required value="${esc(Store.editor)}">
          <label for="g-file">초기 데이터 파일</label><input id="g-file" name="file" type="file" accept=".json,application/json" required>
          <button class="btn primary big block" type="submit">시트에 올리기</button>
        </form>
        <button class="btn small ghost" data-logout>로그아웃</button>`);
    },
    mount(root) {
      const busy = (form, on) => { const b = form.querySelector('[type=submit]'); if (b) { b.disabled = on; b.textContent = on ? '처리 중…' : b.dataset.label || b.textContent; } };
      root.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const btn = f.querySelector('[type=submit]'); if (btn) btn.dataset.label = btn.textContent;
        msg = '';
        if (f.matches('[data-setup]')) {
          Store.setScriptUrl(f.url.value);
          Store.status = 'login'; App.render();
        } else if (f.matches('[data-login]')) {
          busy(f, true);
          const r = await Store.login(f.pw.value.trim(), f.remember.checked);
          if (!r.ok) { msg = r.error; App.render(); }
        } else if (f.matches('[data-import]')) {
          busy(f, true);
          try {
            const text = await readFile(f.file);
            const u = await Store.unlock(f.epw.value.trim(), f.editor.value.trim());
            if (!u.ok) throw new Error(u.error);
            await Store.importAll(text);
            toast('초기 데이터를 시트에 올렸습니다');
            App.navigate('#/tour');
          } catch (err) { msg = err.message; App.render(); }
        }
      });
      root.addEventListener('change', async (e) => {
        if (!e.target.matches('[data-local-file]')) return;
        try { await Store.startLocal(await readFile(e.target)); } catch (err) { msg = err.message; App.render(); }
      });
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-change-url]')) { msg = ''; Store.status = 'setup'; App.render(); }
        if (e.target.closest('[data-logout]')) { msg = ''; Store.logout(); }
      });
      const first = $('input', root); if (first) first.focus();
    },
  };
})();
