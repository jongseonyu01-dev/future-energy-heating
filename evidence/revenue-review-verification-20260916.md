# 매출·수금 review fixture 검증 — 2026-09-16

## 격리 경계

검수는 `review/revenue-collection-20260916` Git branch의 Vercel preview deployment 한 곳에서만 수행했다. `VERCEL_ENV=preview` 및 정확한 Git branch가 동시에 일치할 때만 review procedure가 활성화되며, fixture는 deployment 메모리 `Map`만 사용한다. 정적 격리 검증은 review procedure에서 DB·SMS·센서 모듈 호출이 없음을 확인했다.

운영 DB·고객 정보·SMS·실제 기사 계정·운영 수금관리에는 쓰기 요청을 하지 않았다. 따라서 아래 저장·조회 결과는 **실제 DB 저장 결과가 아닌 메모리 fixture 결과**다.

## API 및 본사 검수 화면 대조

동일 deployment에서 기사 review 로그인 후 단일 합성 접수 ID `981001`에 카드 결제·실제 수금액 `121,000원`을 저장했다. 같은 접수로 재조회 후 동일 저장을 재시도했고, `reportId` 기준 upsert로 월 합계가 1건·121,000원으로 유지됨을 확인했다. 본사 review 웹 화면에서도 동일 접수 ID `981001`, 카드, 실제 수금액 121,000원, 9월 검수 합계 1건·121,000원이 표시됐다.

| 검증 구분 | 결과 |
| --- | --- |
| 실제 preview API | 기사 로그인·저장·재조회·동일 접수 재시도 upsert·본사 동일 record 조회 통과 |
| fixture 단위 검증 | 카드·현금·계좌이체, KST 일별/월별 경계, 재진입 복원, 중복 방지 통과 |
| 본사 웹 화면 | 동일 접수 ID·카드·121,000원·월 합계 표시 확인 |
| 실제 DB | 미사용·미검증 |
| 실제 Android/에뮬레이터 | 실행 환경 부재로 미검증 |

## 보호 예외

이전 preview 예외는 최신 동일-deployment preview로 교체하기 전에 재보호했다. 최신 preview 예외는 검수 종료 절차에서 즉시 제거하고, 비인증 HTTP 401 복구를 확인해야 한다.
