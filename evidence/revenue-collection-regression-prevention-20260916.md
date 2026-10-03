# 기사 매출·수금 기능 누락 원인과 재발 방지 — 2026-09-16

## 확정 원인

매출·결제수단·본사 수금 데이터는 운영에서 삭제되지 않았다. 정상 기준은 GitHub `android-v1.1.21-32` release의 `9219ab5`이며, 이 기준에는 기사 작업목록의 `workReport.monthlySummary` 호출과 작업보고의 `paymentMethod`·`paymentAmount` 재조회/저장 payload가 있었다. current code45 작업본은 해당 release 이력이 병합되지 않은 별도 검수 소스 계보를 기준으로 했고, 확인 가능한 code37 검수 후보 시점부터 두 화면의 매출 카드·결제 입력·payload 연결이 이미 빠져 있었다.

따라서 이번 문제는 운영 데이터 유실이나 본사 수금 API 삭제가 아니라, **기사앱 화면·메뉴·API 연결 누락**이다. production 서버와 본사 화면의 기존 work report 결제 필드, 기사 월별 집계, `workReportId` 고유 ledger는 잔존했다.

## 기존 검수에서 놓친 이유

기존 검수는 견적·초안·권한·위치·사진·서명·정렬을 중심으로 수행됐으며, work report의 결제수단·실제 수금액·기사 월간 매출 카드·본사 수금 화면의 동일 record 대조를 release gate 항목으로 포함하지 않았다. 또한 이전 review fixture는 견적 경로만 격리했고, 매출·수금 fixture는 없어 운영 데이터에 영향을 주지 않는 end-to-end 검수를 수행할 수 없었다.

## 재발 방지

앞으로 기사앱 release 후보는 다음을 별도 gate로 확인한다.

1. 정상 release 기준의 화면/메뉴/API 계약 diff에 `workReport.monthlySummary`, `paymentMethod`, `paymentAmount`, 재조회 payload가 포함되는지 검사한다.
2. 운영 DB·SMS와 격리된 preview-only fixture에서 카드·현금·계좌이체, KST 월말/월초, 재진입, 동일 report 재시도 upsert를 자동 검증한다.
3. 동일 deployment의 기사 저장과 본사 검수 화면이 같은 record·금액·월 합계를 표시하는지 확인한다.
4. 실제 Android 화면 검증과 fixture/API 검증을 분리 기록하고, Android 미검증 상태에서는 운영 다운로드 전환을 하지 않는다.
5. preview 검수 종료 시 단일 Protection Exception 제거와 비인증 SSO 차단 복구를 확인한다.
