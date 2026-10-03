# 기사 매출·결제수단·본사 수금관리 복구 설계 — 2026-09-16

## 복구 원칙

이번 복구는 code32에 있던 기사앱의 결제 입력과 월별 완료보고 합계 화면을 code45 작업본에 다시 연결하는 작업이다. 운영 production 서버의 `work_reports` 결제 필드, 기사 본인 월별 집계 API, 본사 수금관리 화면과 ledger는 이미 존재하므로 스키마를 교체하거나 과거 매출을 이관하지 않는다.

| 항목 | 유지할 기존 기준 | 복구 방식 |
| --- | --- | --- |
| 매출 귀속일 | 작업보고 `isCompleted=true`의 `completedAt` | 한국시간(Asia/Seoul) 기준으로 당일과 월 1일 00:00 이상·다음 달 1일 00:00 미만을 계산 |
| 기사 매출 | 기사 보고의 `paymentAmount` | 견적금액과 별도 입력·저장하며 완료보고 월별 집계에서 합산 |
| 결제수단 | 기존 `현금`, `카드`, `계좌이체`, `미수·후불`, `기타` | 기존 다섯 선택값을 유지하고, 요청된 카드·현금·계좌이체 세 경우는 분리 검수 |
| 부가세 | 작업보고·기사 월별 집계 모델에 별도 VAT 필드 없음 | 세전/세후 값을 새로 계산·변환하지 않고 입력된 실제 수금액 그대로 보존 |
| 취소·환불 | 완료 상태가 아닌 보고는 월별 집계에서 제외; 별도 환불 금액 모델 없음 | 완료보고를 임의로 취소·환불 처리하거나 음수 수금액을 만들지 않음 |
| 미수금 | 기사 월별 집계와 본사 실제 입금은 분리됨 | 기사 입력 `paymentAmount`와 본사 `actualDepositAmount`를 같다고 가정하지 않으며, 별도 job-order 수금 목록은 기존 흐름 유지 |
| 본사 연동·중복 방지 | 본사 ledger의 `workReportId` unique key | 기사 보고는 작업보고 행 하나만 upsert하고, 본사 입금 확인은 동일 보고별 ledger upsert를 재사용 |

## 변경 범위

기사앱에서는 `app/work-report.tsx`에 결제수단·실제 수금액의 입력, 기존 보고 재조회, 임시저장·완료보고 payload를 되살린다. `app/(tabs)/tech-works.tsx`에는 로그인한 기사만 호출하는 기존 `workReport.monthlySummary`를 재연결하고, 수신한 동일 월 rows를 한국시간으로 다시 분류해 당일 매출과 해당 월 매출을 동시에 표시한다. 월 집계 결과는 서버가 기사 ID를 세션에서 결정하므로 클라이언트가 다른 기사 ID를 전달하지 않는다.

본사 수금관리와 production API에는 원칙적으로 기능 변경을 하지 않는다. 해당 경로는 이미 기사 완료보고의 결제수단·수금액을 본사 월별 현황과 총매출·실입금 달력에 제공하며, 별도 수금 목록과는 서로 다른 모델이다. 따라서 이번 앱 복구가 견적금액·고객 매출·실입금 데이터를 자동으로 덮어쓰거나 고객/SMS·누수·유량 센서·공통 인증에 영향을 주지 않는다.

## 검수 범위

분리된 검수 fixture는 카드·현금·계좌이체 각 1건과 한국시간 월말 23:59:59/다음 달 월초 00:00:00 경계 데이터를 사용한다. 같은 requestId의 반복 저장은 한 작업보고를 갱신하는 경우만 허용하고 월별·본사 레코드를 중복 생성하지 않아야 한다. API contract 검증과 실제 Android 화면 검증은 최종 보고에서 별도로 표시한다.

## 2026-09-16 검수 결과

`tests/revenue-recovery.test.ts`는 분리 fixture로 다음 다섯 검증을 통과했다: 카드·현금·계좌이체 결제수단별 월 합계, 한국시간 월말 23:59:59와 다음 달 월초 00:00:00의 월 분리, 동일 `reportId` 재시도·새로고침 중복 제거, 빈값/잘못된 실제 수금액 처리, 저장된 결제수단·수금액의 재진입 복원 및 화면 API contract. 이 fixture는 운영 DB를 읽거나 쓰지 않는다.

운영 production 저장소의 기존 `field-work-integration` 및 `hq-revenue-calendar` 검증도 통과했다. 이는 `workReport.save`의 결제 필드, 세션 기반 `workReport.monthlySummary`, 완료보고 기반 본사 monthly collections, `workReportId` 고유 ledger, 총매출과 실제 입금 분리의 기존 계약이 잔존함을 확인한다. 무인증 production 요청에서는 기사 월별 API와 본사 매출 달력 API 모두 HTTP 401 / `UNAUTHORIZED`로 차단됐다.

수정 앱의 Android JavaScript bundle export는 성공했다. 반면 실제 Android 기기·emulator가 없으므로 결제 입력, 저장 후 앱 재실행, 당일·월간 카드 렌더링, 본사 화면 반영을 **실제 APK 화면에서 확인하지 못했다**. 전체 TypeScript는 복구 파일 관련 오류 없이 기존 84건이 남아 있으므로 전체 통과로 표시하지 않는다.

## 2026-09-16 기존 검수 경로 분리 여부 조사

기존 `review` EAS profile은 `EXPO_PUBLIC_TECH_ESTIMATE_REVIEW_MODE=1`과 과거 preview URL을 사용한다. 하지만 source에서 분리되는 것은 `estimates.techRequest`, `reviewMyAssignedRequests`, `listMyTechRequests`, `prices.listActive`의 견적 검수 fixture뿐이다. `workReport.save`와 `workReport.monthlySummary`, 결제수단·실제 수금액 및 본사 `hq_revenue_entries` 수금 ledger에는 review mode 분기나 별도 검수 저장소가 없다.

따라서 이 경로로 합성 접수를 생성하거나 Android에서 결제 저장을 실행하면 이름을 테스트로 표기하더라도 운영 work report·본사 수금·정산 집계에 연결될 수 있다. 이는 이번 승인 범위의 실제 분리 조건을 충족하지 않는다. 운영 DB·고객·매출·수금 기록을 전혀 생성·수정·삭제하지 않았으며, 실제 Android와 본사 수금 화면의 end-to-end 검증은 **차단**했다.
