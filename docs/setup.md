# 설치 가이드 (처음 1회)

## 1. 구글 시트에 Apps Script 붙이기
1. 구글 시트 **TDL_Operator** 열기 → 메뉴 **확장 프로그램 → Apps Script**
2. 기본 `Code.gs` 내용을 지우고, 이 저장소의 [`apps-script/Code.gs`](../apps-script/Code.gs) 전체를 붙여넣고 저장(💾)
3. 왼쪽 **프로젝트 설정(⚙)** → 맨 아래 **스크립트 속성 → 속성 추가**
   | 속성 | 값 |
   |---|---|
   | `ACCESS_PASSWORD` | 접속 비밀번호 (구성원에게 공유할 것) |
   | `EDIT_PASSWORD` | 편집 비밀번호 (기본 `0000`) |
4. 오른쪽 위 **배포 → 새 배포** → 톱니에서 **웹 앱** 선택
   - 다음 사용자 인증 정보로 실행: **나**
   - 액세스 권한이 있는 사용자: **모든 사용자**
   - **배포** → 권한 승인(“확인되지 않은 앱” 경고가 나오면 고급 → 이동) → **웹 앱 URL**(`…/exec`) 복사

> “모든 사용자”여도 접속 비밀번호를 모르면 데이터를 받을 수 없습니다. 시트 자체의 공유 설정은 바꿀 필요가 없습니다.
> Code.gs를 고친 뒤에는 **배포 → 배포 관리 → ✎ → 버전: 새 버전 → 배포**를 해야 반영됩니다(URL은 그대로).

## 2. 웹앱 주소는 GitHub 변수로 (첫 화면에서 URL을 묻지 않게)
1. 저장소 **Settings → Secrets and variables → Actions → Variables 탭 → New repository variable**
   - Name: `SCRIPT_URL`
   - Value: 위에서 복사한 웹 앱 URL(`https://script.google.com/macros/s/…/exec`)
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 변경
3. **Actions 탭 → Deploy to GitHub Pages → Run workflow** (또는 `main`에 푸시하면 자동 실행)
4. 배포가 끝나면 `https://songwri.github.io/TDL_Operator/` 에서 접속 비밀번호만 입력하면 됩니다.

- 배포할 때마다 `SCRIPT_URL` 변수 값으로 `config.js` 가 자동으로 만들어집니다. 웹 앱 URL이 바뀌면 변수만 고치고 Run workflow 하면 됩니다.
- 변수가 없으면 저장소의 `config.js` 값을 그대로 씁니다(경고만 표시).
- 웹 앱 URL은 브라우저가 시트 서버를 호출하려면 필요한 값이라 배포된 사이트의 `config.js` 에는 보입니다. 데이터 보호는 URL이 아니라 **접속 비밀번호**가 합니다.

## 3. 초기 데이터 올리기
1. 웹앱 접속 → 접속 비밀번호 입력
2. “시트가 비어 있습니다” 화면에서 편집 비밀번호, 작성자 이름, 전달받은 `tdl-seed.json` 선택 → **시트에 올리기**
3. 시트에 탭 12개(stations, specs, qa …)가 생깁니다. 시트에서 직접 고쳐도 되고, 웹앱 편집 모드에서 고쳐도 됩니다.
   - 시트에서 직접 고칠 때: 1행 머리글은 바꾸지 마세요. `id` 열은 고유해야 합니다.

## 4. 접속
`https://songwri.github.io/TDL_Operator/` (배포는 2번 참고)

## 비밀번호 바꾸기
웹앱 **더보기 → 설정**(편집 모드에서)에서 접속/편집 비밀번호를 바꿀 수 있습니다. Apps Script 스크립트 속성에서 직접 바꿔도 됩니다.
