# 매출·수금 review preview 격리 및 보호 예외 기록 — 2026-09-16

## 사전 격리 확인

review branch `review/revenue-collection-20260916`의 fixture는 `VERCEL_ENV=preview`와 해당 Git branch가 동시에 일치할 때만 동작한다. fixture source와 procedure block을 정적으로 점검해 운영 DB helper, 고객 ledger, SMS 발송, notification 및 sensor 모듈 호출이 없음을 확인했다. `REVENUE_REVIEW_ISOLATION_PASS preview_branch_only_no_db_no_sms_no_sensor`와 fixture 3결제수단·KST 집계·동일 report upsert 테스트가 통과했다.

## 임시 보호 예외

운영 domain·프로젝트 전체 SSO·다른 preview 설정을 바꾸지 않고, 2026-09-16에 `futureenergytech-eu3egs12k-futureenergytech.vercel.app` 하나만 Deployment Protection Exception으로 등록했다. 등록 직전 이 URL의 API는 Vercel Authentication에 의해 HTTP 401로 차단되는 것을 확인했고, 등록 후 해당 URL에서 review API 검증을 수행했다.

## 교체 필요 확인

Vercel deployment마다 메모리 fixture 인스턴스가 분리된다. 따라서 기사 API 저장을 실행한 deployment와 본사 검수 정적 화면 deployment가 다르면 본사 화면에는 기록이 보이지 않는다. 최신 동일 review branch deployment `dpl_45cRxbGeCn6vcmGuDJYWZ7P7NZa6` (`futureenergytech-a516lohuw-futureenergytech.vercel.app`)가 fixture·본사 검수 화면을 함께 포함하므로, 다음 검수 전에는 기존 예외를 이 URL 하나로 교체해야 한다. 교체 시 이전 `eu3egs12k` 예외는 즉시 제거한다.

## 보호 기준

기존 예외 `futureenergytech-mcdhzapb2-futureenergytech.vercel.app`는 이번 작업 범위 밖이므로 변경하지 않는다. 검수 종료 또는 중단 시 이번에 등록한 예외 한 건만 제거하고, 해당 URL의 비인증 접근이 다시 HTTP 401이 되는지 확인한다.
