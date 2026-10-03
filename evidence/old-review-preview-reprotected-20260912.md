# 이전 합성 검수 Preview 재보호 확인

| 항목 | 확인 결과 |
|---|---|
| 기존 preview URL | `futureenergytech-pxgq6ywrg-futureenergytech.vercel.app` |
| Vercel 설정 | 해당 단일 Deployment Protection Exception 제거 후 **Protection restored** toast 확인 |
| 비인증 API 요청 | `GET /api/trpc/prices.listActive`가 HTTP `302` 반환 |
| 차단 목적지 | Vercel SSO 인증 경로로 redirect |
| 프로젝트 전역 보호 | 화면에서 **Standard Protection** 유지 확인 |
| 운영·다른 preview | 이 작업에서는 변경하지 않음 |

> `curl -L`의 최종 HTTP 200은 Vercel 로그인 페이지를 따라간 결과이므로 공개 API 성공으로 판정하지 않았다. 리다이렉트를 따르지 않은 응답의 HTTP 302와 SSO Location 헤더로 차단을 확인했다.
