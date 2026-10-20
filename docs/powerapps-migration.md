# PowerApps 이관 가이드

웹앱의 데이터는 모두 **평평한 테이블**이며, 지금은 구글 시트 TDL_Operator의 탭 하나가 테이블 하나입니다. 더보기 → “PowerApps 이관용 CSV”에서 테이블별 CSV를 받아
SharePoint 목록(또는 Dataverse 테이블)으로 가져오면 됩니다. 모든 테이블에 `updatedAt`(날짜), `updatedBy`(텍스트)가 있습니다.

| 목록 | 열 | 비고 |
|---|---|---|
| **stations** 장소 | id, no, name, zone(비전홀/이노베이션필드/연계구간), x, y(도면 좌표 0–780 × 0–900), minutes, equipment(예/아니요), optional, script(한국어 대사, 여러 줄), scriptEn(영문 대사 — {{농담}} 표시 포함), tips, order | 도면 핀 위치와 나레이션 |
| **actions** 장소별 행동 | id, stationId→stations, text, tourType(all/일반/VIP), order | 체크 탭 |
| **videos** 영상 | id, stationId, name, purpose, note | |
| **specs** 설비 스펙 | id, stationId, group(한 장소에 설비가 여럿일 때, 예: 휴머노이드), field, value, status(확정/확인필요), note, order | 행 하나 = 스펙 한 칸. 항목 목록은 settings.specFields |
| **qa** 질문·답변 | id, stationId, topic, question, answer, common(예/아니요), status, source, createdAt, createdBy | |
| **routes** 동선 | id, name, tourType, description, points(JSON 텍스트), closing, closingEn | points = `[{x,y,stop}]`, stop이 있는 점이 정거장 |
| **transitions** 동선별 이동 멘트 | id, routeId→routes, fromStationId, toStationId, text, textEn, status | 같은 장소라도 동선마다 다른 멘트 |
| **manual** 체크 항목 | id, phase(pre/post), stationId(설비 id 또는 common), section(check 공통 · field 현장 체크), title, body, tourType, routine(오늘 준비 루틴 순서), closeRoutine, order | 공통 체크와 현장 체크만. 설비 절차는 guides |
| **guides** 설비별 매뉴얼 | id, title, equip(설비 id), kind(pc PC 사전작업 / prep 시연 준비 / demo 시연 / close 정리 / ref 참고), variant(버튼 이름: 입고·출고·P2P 등), optional(필요 시), prepCat(준비 카테고리: order 오더 업로드 · field 현장 준비), routine(카테고리 안 순서), closeRoutine(정리 루틴 순서), stations(투어 중 보여 줄 장소), summary, order | 시연 매뉴얼 v3.1의 구분 그대로 |
| **guideSteps** 가이드 단계 | id, guideId→guides, order, title, image(드라이브 이미지 파일 이름), body(여러 줄), note | 매뉴얼 슬라이드 1장 = 1단계 |
| **contacts** 비상연락망 | id, role, org, name, phone, note, stations(관련 설비) | |
| **tourLogs** 투어 기록 | id, date, customer, tourType, guide, routeId, headcount, minutes, notes, createdAt, createdBy | |
| **history** 변경 이력 | id, table, rowId, action, before(JSON), after(JSON), at, by | SharePoint 자체 버전 기록으로 대체 가능 |
| **settings** 설정 | key, value | recentDays(“수정됨” 표시 일수, 기본 3), preRows(투어 전 설비별 표의 행 — 장소 id 쉼표 구분), specFields(JSON 배열), businesses(JSON 배열) |

## 화면 대응
- 투어 모드(휴대폰) → 캔버스 앱 휴대폰 레이아웃: stations를 routes.points 순서로 Gallery 표시, 이전/다음 버튼
- 도면 → 배경 이미지 + 핀 컨트롤의 X/Y를 stations.x/y × (화면폭/780)으로 배치
- 접속·편집 비밀번호(Apps Script 스크립트 속성) → PowerApps에서는 SharePoint 권한(열람/편집 그룹)으로 대체 권장
