# 매출·수금 review fixture 검수 종료·재보호 확인 — 2026-09-16

## 예외 종료

검수에만 사용한 `futureenergytech-hrvb6kh6v-futureenergytech.vercel.app`의 Deployment Protection Exception을 Vercel 설정에서 제거했다. 성공 안내는 해당 domain의 protection restored였다.

비인증 `curl`로 검수 본사 페이지를 재조회한 결과는 Vercel SSO 로그인 endpoint를 향하는 HTTP 302였다. Vercel Authentication 보호는 401 대신 SSO 로그인으로 302 redirect하는 동작을 사용하므로, 이는 review 페이지의 비인증 직접 접근이 다시 차단된 결과다. redirect를 따라간 HTTP 200은 검수 페이지가 아닌 Vercel SSO 로그인 페이지 응답이므로 공개 접근 성공으로 해석하지 않는다.

프로젝트 전체 Standard Protection, 운영 도메인, 다른 preview 예외와 앱 자체 로그인/권한은 변경하지 않았다. 검수 중 제거하려던 대상이 아닌 기존 exception을 먼저 선택한 사실을 도메인 확인 단계에서 발견해 취소했고, 기존 exception에는 변경을 적용하지 않았다.

## 검수 데이터 정리 및 운영 비영향

검수 record는 preview deployment 메모리 fixture에만 존재하며 DB insert·SMS·실제 계정 활성화·운영 수금 ledger 호출이 없다. 따라서 실제 고객·운영 매출·운영 수금·운영 정산 합계에는 생성·수정·삭제할 record가 없었다. 예외 제거 후 fixture를 호출할 공개 경로도 없다.

실제 Android 기기와 emulator는 이 환경에 없어, Android UI에서 저장·재로그인·본사 반영을 수행한 검증은 하지 않았다. 해당 부분은 production API 또는 fixture API 검증과 구분해 미검증 상태로 유지한다.

## 최종 보호 목록 재확인

재보호 완료 후 Vercel Deployment Protection Exceptions 목록을 다시 확인했다. 검수에 사용한 `futureenergytech-hrvb6kh6v-futureenergytech.vercel.app`는 목록에서 사라졌고, 검수 이전부터 존재하던 다른 preview exception 한 건만 남아 있었다. 프로젝트 전체 Standard Protection은 유지됐다.
