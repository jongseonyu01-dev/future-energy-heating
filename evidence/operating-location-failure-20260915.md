# 운영 위치 공유 전송 실패 — 2026-09-15 11:56 KST

## 실제 운영 로그

Vercel production project `futureenergytech`의 2026-09-15 02:45~03:05 UTC(11:45~12:05 KST) runtime log를 read-only로 조회했다.

| KST | UTC | route | HTTP | production deployment |
|---|---|---|---:|---|
| 11:55:47~11:56:10 | 02:55:47~02:56:10 | `POST /api/location/update` | `401` 반복 | `dpl_A7uazzMAPAFuYpJc9bvBwQv4Leec` |
| 11:59:26~11:59:29 | 02:59:26~02:59:29 | `POST /api/location/update` | `401` 반복 | 동일 |
| 12:00:22~12:00:35 | 03:00:22~03:00:35 | `POST /api/location/update` | `401` 반복 | 동일 |
| 12:03:34~12:03:37 | 03:03:34~03:03:37 | `POST /api/location/update` | `401` 반복 | 동일 |

`LocationUpdate` handler 내부 log가 같은 window에 없었던 것은, 요청이 handler 진입 전 `requireTechnicianApi` 인증 middleware에서 거절됐다는 route·status log와 일치한다.

## 코드 대조

운영 server `POST /api/location/update`는 `requireTechnicianApi`를 먼저 적용한다. 이는 올바른 Bearer 기사 인증이 없으면 HTTP 401을 반환한다. 그러나 code 42 APK의 foreground interval, background `TaskManager` callback 및 `sendLocationToServer()`는 `Content-Type`만 보내고 `Authorization: Bearer <현재 기사 token>`을 보내지 않는다.

따라서 현재 확인된 실제 원인은 **운영 API 전환 뒤 REST 위치 전송 두 경로에서 기사 Bearer 인증 header가 누락된 것**이다. 좌표·속도·권한 취득 및 server DB write helper가 원인이라는 증거는 현재 없다. 401이므로 session/token·coordinate 검증 및 `updateLocationSessionPosition()` 실행 전 단계에서 막혔다.

## 범위

이 진단은 요청 경로와 HTTP 상태만 사용했다. 기사 token, tracking token, 좌표, 고객 식별값은 기록하거나 노출하지 않았다. 고객 SMS 재발송·고객 데이터 변경은 수행하지 않았다.

## 보완 내용

| 변경 파일 | 최소 변경 | 대상 경로 |
|---|---|---|
| `lib/location-request-auth.ts` | 비어 있지 않은 현재 기사 token일 때만 `Authorization: Bearer <token>` header를 생성하고, HTTP 실패 상태·사유를 표시하는 순수 helper 추가 | 공통 |
| `lib/location-tracking.ts` | `Auth.getSessionToken()`을 전송마다 SecureStore에서 재조회하고 위 helper의 header를 사용 | foreground timer, background TaskManager callback, foreground 복귀 즉시 전송 |
| `lib/location-tracking.ts` | `/api/location/stop`도 같은 기사 Bearer header 사용 | 도착 완료, 업무 취소 |
| `tests/location-request-auth.test.ts` | token 보존, token 부재 시 무전송, 실제 HTTP 실패 상태 보존 | 3 assertions |
| `tests/location-tracking-auth-contract.verify.mjs` | update/stop 인증 header, background 공통 sender, unauthenticated update fetch 부재 | source contract |

전경과 화면꺼짐 callback은 이제 각각 fetch를 갖지 않고 `sendLocationToServer()` 하나를 공유한다. 그 함수는 현재 native SecureStore의 기사 token을 호출 시점마다 읽으므로 로그아웃·기사 계정 변경 뒤 오래된 token을 전송하지 않는다. HTTP가 성공한 경우에만 `lastSuccessAt`을 갱신한다. HTTP 401 같은 서버 실패는 `HTTP 401: <safe server reason>`으로 남고 성공으로 표시되지 않는다.

| 검증 | 결과 | 한계 |
|---|---|---|
| `location-request-auth.test.ts` + `location-tracking.test.ts` | 9 PASS | native SecureStore와 fetch는 unit mock 범위 |
| location tracking authenticated sender contract | PASS | source contract 범위 |
| `pnpm build` server bundle | PASS | 기존 전체 TypeScript 88건 오류와 별개 |
| 운영 11:56 KST log | code 42의 401 반복 확인 | code 43 실기기 송신 전이므로 새 좌표 저장·고객 링크·앱 시각은 미확인 |
