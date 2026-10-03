# v1.1.38 출발 동의 응답 호환성 보완

## 변경 결론

운영 서버의 `location.saveConsent`는 실제로 `{ success: true }`만 반환한다. 이 형식을 변경하지 않았다. 앱의 실제 `LocationConsentModal.onConsent` 콜백은 이제 저장 응답의 `hasConsented` 여부를 읽지 않고, **저장 `success:true` → 인증 tRPC `location.getConsent` 재조회 → `hasConsented:true`** 순서가 모두 확인될 때에만 `doDepart()`를 호출한다.

| 상황 | 화면 콜백 결과 | 출발 호출 |
|---|---|---|
| 운영 응답 `{ success:true }` + getConsent `{ hasConsented:true }` | 정상 | 허용 |
| 합성 응답 `{ success:true }` + getConsent `{ hasConsented:true }` | 정상 | 허용 |
| 저장 오류 또는 `{ success:false }` | `동의 저장 실패` | 차단 |
| 재조회 오류 | `동의 저장 실패` | 차단 |
| 재조회 `{ hasConsented:false }` | `동의 저장 실패` | 차단 |

## 운영 코드 대조

`server/routers.ts` 1954–1960은 `db.createLocationConsent()` 뒤 `{ success:true }`를 반환한다. 이 운영 router·DB·응답은 변경하지 않았다. 앱의 `trpc` client는 Bearer token을 포함하는 인증 header를 사용하며, readback도 같은 client query로 실행한다.

## 합성 review API와 이월 접수

새 preview deployment `dpl_GXX8UP4RLGNT73aBSoKxjDKaZmNX`는 현재 `futureenergytech-2dhinw2q6-futureenergytech.vercel.app`이다. source files는 review-server package와 tRPC/location handlers 네 파일뿐이며 운영 DB driver·Solapi·운영 고객 data를 포함하지 않는다.

합성 `location.saveConsent`도 운영과 동일하게 `{ success:true }`만 반환하도록 맞췄다. 동의 상태는 authenticated `location.getConsent`로 확인한다. 합성 접수의 `scheduledDate`는 하드코드 날짜가 아니라 실행 시점 KST 전날로 생성하므로, 검수 당일에도 `scheduledDate < 오늘` 조건의 **미작업·이월** 탭에 노출된다.

## 검증 결과

| 증거 | 결과 |
|---|---|
| 운영 `saveConsent` source response 확인 | `{ success:true }` 확인 |
| 화면 callback helper Vitest | 5 PASS: 운영 성공, 합성 성공, 저장 실패, 재조회 실패, 동의 없음 차단 |
| isolated review API Vitest | 6 PASS: bare save response, getConsent readback, KST 이월 schedule 포함 |
| 화면 source contract | 7 PASS: 인증 mutation·readback·차단 연결 확인 |
| 새 preview actual HTTP | 401/403/412, bare `{success:true}`, authenticated readback `true`, own start 200, checklist null-safe, SMS substitute 확인 |
| 이전 `4tlv7asl8` preview | unauthenticated HTTP 302 Vercel SSO redirect: 보호 복원 확인 |
| review EAS profile | 새 preview 한 URL만 주입, bypass secret/header 없음 |
| Expo config | `1.1.38`, Android `versionCode:38`, iOS `buildNumber:38`, package/bundle `com.futureenergy.heatingcare` |

Vercel Standard Protection은 유지했다. 예외는 새 `2dhinw2q6` preview 한 건으로 교체했으며, 운영 도메인·홈페이지 견적·공용 단가·운영 고객 data·실제 SMS·운영 게시·TestFlight 제출은 변경/실행하지 않았다.

Vercel 설정 화면도 최종적으로 Standard Protection과 `futureenergytech-2dhinw2q6-futureenergytech.vercel.app` 한 건의 예외만 표시했다.

## 미실시

v1.1.38 APK 빌드와 Android 실기기 목록·이월·출발·점검표 흐름, logcat, 영상은 아직 미실시다. 따라서 Android 강제 종료 해결 여부는 확정하지 않는다.
