# 운영 위치 전송 장애 — code 43 보완 및 다운로드 전환 결과

## 실제 원인

2026-09-15 11:56 KST 전후의 운영 runtime 로그에서 `/api/location/update` 요청이 **HTTP 401**로 확인됐다. 운영 REST handler는 기사 로그인 Bearer token을 요구하지만, code 42의 foreground sender·background task sender·세션 종료 sender는 해당 header를 공통으로 전달하지 않았다. 이는 앱 UI의 성공/실패 문구 문제가 아니라 서버 인증 단계에서 좌표 저장 전 차단된 실제 전송 실패다.

## 최소 수정

`lib/location-request-auth.ts`의 현재 로그인 token 기반 header helper를 도입하고, `lib/location-tracking.ts`의 foreground update·background update·stop 요청이 모두 이를 사용하도록 통일했다. 401·네트워크 오류는 성공으로 기록하지 않으며, 마지막 전송 시각은 실제 성공 응답에서만 갱신된다.

## build 및 공식 다운로드 검증

| 항목 | 결과 |
|---|---|
| 기준 native APK | 운영 code 42 (`1.1.42` / code `42`) |
| 생성 방식 | Expo Repack — native 구성은 code 42 유지, 위치 인증 JavaScript 및 version metadata만 반영 |
| 결과 APK | `1.1.43` / code `43` |
| package | `com.futureenergy.heatingcare` |
| v1/v2/v3 signer certificate SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |
| APK SHA-256 | `71184600b1a9290a8ec6bed195d0333e7fd3ed0b09e4bad671d4daf96f4d2ac5` |
| fixed URL | `https://xn--h50b270bp0ceuddugnobx2m.kr/download/driver/latest` |
| fixed URL 검증 | 실제 다운로드 APK에서 package, version `1.1.43`/code `43`, v1/v2/v3 signer 및 SHA-256 일치 |

고정 URL resolver가 신뢰하는 repository는 `jongseonyu01-dev/future-energy-heating`이며, code 43 immutable release에 resolver 요구 asset 이름 `future-energy-heating.apk`와 schema v1 integrity metadata를 등록했다. 기존 code 42 및 이전 release는 삭제하지 않았다.

## 검증 상태

`location-request-auth` 3건, `location-tracking` 6건, foreground/background/stop Bearer contract를 focused test로 확인했다. 다만 **실제 기기에서 code 43 설치 후 새 좌표가 운영 DB에 저장되는지, 고객 추적 링크가 갱신되는지, 앱의 마지막 전송 시각이 갱신되는지는 아직 미확인**이다. 고객 문자 재발송은 수행하지 않았다.
