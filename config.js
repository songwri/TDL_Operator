/* 배포 설정. GitHub Actions 배포 때 저장소 변수 SCRIPT_URL 값으로 이 파일이 다시 만들어집니다.
 * 아래 값은 변수가 없을 때 쓰는 예비값입니다. scriptUrl 에 구글 시트 Apps Script 웹앱 URL(…/exec)을 넣으면
 * 구성원은 접속 비밀번호만 입력하면 됩니다. 비워 두면 첫 화면에서 URL을 입력받습니다.
 * (URL만으로는 데이터를 볼 수 없고, 접속 비밀번호가 있어야 합니다.) */
window.TDL_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbyoZSe1Q8ks1JVfSRF2QYH2y2zuTZqx7WFdbY2JkF7K4_T7Dbv5q-ahFTeIQsEt6zgD0g/exec',
};
