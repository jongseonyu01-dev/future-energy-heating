# 기사앱 백그라운드 위치 P1 — 플랫폼 조사·후보 설계

> **경계:** 아래는 source/native 구현과 합성 실행·Android Kotlin 컴파일의 증거다. 실제 Android 기기에서 일반 앱 전환·일반 잠금 중 위치가 서버에 accepted로 저장됐다는 증거는 아니다.

## 확인된 소스·플랫폼 사실

1. 설치된 Expo SDK 54의 `expo-location 19.0.8` Android `LocationModule.kt`는 `foregroundService` 옵션으로 `startLocationUpdatesAsync`를 호출할 때 앱이 전경이 아니면 `ForegroundServiceStartNotAllowedException`을 던진다. `LocationTaskConsumer.didRegister()`는 `startLocationUpdates()` 뒤 `maybeStartForegroundService()`를 호출하고, 그 함수는 앱 전경 상태가 아니면 FGS 시작 없이 return한다.
2. 같은 native `startLocationUpdates()`는 `requestLocationUpdates()`의 `SecurityException`을 로그만 남기고 return한다. `hasStartedLocationUpdatesAsync`는 TaskManager consumer 등록 여부만 반환한다. 따라서 `registered=true`는 FGS·GPS·TaskManager JS callback·HTTP·서버 accepted의 증거가 아니다.
3. `expo-task-manager 14.0.9` `TaskService`는 headless app을 로드한 뒤 task manager에 대기 event를 넘긴다. task definition을 찾지 못하면 event를 취소할 수 있다. Expo Router Android context(`_ctx.android.js`)는 Metro `require.context`로 route context를 만든다.
4. Production Vercel 배포 `dpl_FSLz4gm7BJYcJBfcgray4y6uahf3`은 read-only 조회에서 `READY`, Git commit `4f49b140c3b4f86685933dc1cc53fa5083d66cd6`으로 확인됐다. 이 commit 및 현재 remote `main`의 `public/web/track.html` blob은 `d60964b0445e019331ef281543f78b77d00d1818`이다. 따라서 delayed 안내가 generic waiting으로 덮이는 문제는 **Production source identity와 일치하는 소스 버그**다. 실제 고객 세션의 최초 실패 지점은 미확정이다.

## 이번 후보 보완

### 1. 실제 package entry에서 headless task를 Router보다 먼저 정의

- `package.json` main을 `./index.ts`로 바꾼다.
- `index.ts`는 `./lib/location-task-entry`를 먼저 import해 `registerLocationTrackingTask()`를 실행한 후 `expo-router/entry`로 넘긴다.
- `LOCATION_CUSTOM_PACKAGE_ENTRY_HEADLESS_INTEGRATION_PASS`는 package main → 실제 SDK `entry.js`/`entry-classic.js`와 실제 Android `_ctx.android.js` source를 실행한다. Metro `require.context`만 synthetic primitive로 바꾸며, `require.context` 1회, Router root registration 1회, route evaluation 0회, React UI render 0회, task definition 1회를 확인한다.
- 같은 실행에서 synthetic native callback이 task handler까지 전달되고, local terminal stop 뒤 다음 headless callback이 저장 상태를 재채택해 HTTP를 호출하지 않는 것을 확인했다.

### 2. callback 진입과 세션 준비 실패를 안전하게 분리

- lifecycle은 native FGS 시작을 보조 control notification보다 먼저 수행한다. 보조 알림은 callback/HTTP/저장 성공 증거가 아니다.
- TaskManager callback은 entry 시각을 확보한다. native error·빈/오래된 측정·adoption timeout·no credential·no adoptable session은 token·좌표·고객정보 없이 module-scoped immutable unbound event로만 저장한다.
- unbound event는 A/B 어느 세션에도 임의 귀속하지 않는다. 원자 key가 아니라 eventId가 포함된 append-only key를 쓰며, `observedAt`과 같은 시각이면 operation sequence로 최신을 선택한다. 늦게 끝난 A write가 더 나중 B evidence를 덮지 않는 회귀를 actual TaskManager callback과 store 단위에서 실행했다.
- entry marker는 callback 총 10초 예산 중 최대 750ms만 사용한다. 멎은 storage/auth I/O는 fence 만료 뒤 callback 또는 later UI side effect 권한을 얻지 못한다.
- exact session 채택 뒤에는 callback·measurement·request start·response·accepted server saved time·native registration·safe app version/build·coordinate-invalid를 기존 session journal에 남긴다. late A/B UI isolation, terminal invalidation, auth/account boundary는 기존 보장을 유지한다.

### 3. 고객 지도 polling·SDK 실패·종료 세대 보호

- `DELAYED`/`LEGACY_RECEIPT_DELAYED`는 server가 좌표를 `null`로 제공하는 정책을 유지한다. Kakao map init에도 delay-specific empty message를 전달해 generic “기사 위치 수신 대기”가 덮지 못하게 한다.
- SDK의 각 script 시도는 attempt generation·settled·개별 timeout을 가진다. 첫 10초 timeout 뒤 재시도 B가 성공하면, 이전 A의 늦은 `onerror`/`onload`/map-load timeout이 B의 `sdkLoaded=true`와 오류 상태를 바꾸지 못한다. 즉시 무한 재시도 대신 최대 한 번의 5초 지연 재시도만 허용한다.
- fetch timeout은 HTTP headers뿐 아니라 `response.json()` body까지 포함한다. terminal 410/ended가 먼저 오면 request generation을 무효화해 앞선 200 response body·error·timeout이 화면·지도·poll을 되살리지 못하게 한다.
- HTTP 200의 JSON parse 실패는 빈 위치 payload로 렌더하지 않고 별도 “위치 세션 응답 오류” 카드와 한 번의 제한된 5초 recovery만 남긴다. non-2xx의 parse 실패는 status 기반 terminal/error 카드를 위해 비위치 fallback만 사용한다.
- `TRACK_LOCATION_DISPLAY_TERMINAL_AND_SDK_INTEGRATION_PASS`는 CURRENT map, DELAYED, first-signal wait, SDK failure 유지, SDK A timeout → B success → late A error, network failure, malformed 200 JSON, delayed 200 body A → terminal 410 B → late A no-op을 실제 inline script/controlled DOM에서 확인한다. stale coordinates are never rendered as current.

## 선택형 작은 상태창 설계

| 후보 | 권한/플랫폼 조건 | 이번 후보 판단 |
| --- | --- | --- |
| 기존 Android location FGS ongoing notification | 기존 location FGS/알림 구성 | **기본·최소 권한 surface.** 위치 수집의 제어/상태 기본면으로 유지한다. 알림이 수집·HTTP·accepted 저장 성공을 증명하지는 않는다. |
| 선택형 overlay/bubble | `SYSTEM_ALERT_WINDOW` manifest + 사용자가 Android Special app access Settings에서 별도 승인 | **구현 후보.** 기사 진단 화면에서 명시적으로 선택한 경우에만 Settings를 열고, 승인 후 다시 누르면 표시에 들어간다. ‘위치 공유 중’과 마지막 **서버 저장** 경과 또는 저장 확인 필요만 표시한다. 고객명·주소·좌표·token·인증값은 표시·수집하지 않는다. `앱 열기`와 `닫기`만 제공한다. 상태창 owner/generation을 terminal·A→B·닫기보다 먼저 무효화해 늦은 show/update/hide가 재표시하거나 B를 숨기지 못한다. native는 마지막 accepted 시각과 자체 시계로 경과를 매초 다시 계산한다. 닫기는 overlay만 제거하고 FGS/session을 정지하지 않으며, terminal/취소/logout 정지는 native stop await 전 overlay도 무효화한다. 화면 잠금에서는 표시를 보장하지 않는다. |
| PiP | Activity/PiP 전환 필요; Android 문서는 video playback/video call/navigation 중심 | **미채택.** location callback/FGS/잠금 생존을 보장하지 않는다. |

### 구현 검증

- `ANDROID_LOCAL_OVERLAY_AUTOLINKING_PASS`: Expo local module discovery에 `future-energy-status-overlay`가 확인됐다.
- `LOCATION_STATUS_OVERLAY_OWNER_AND_AGE_CONTRACT_PASS`: 권한 Settings, owner/generation 기반 A→B/닫기 fence, native에 넘기는 absolute accepted timestamp와 non-sensitive static rule을 실행했다.
- `LOCATION_TRACKING_CONTEXT_OVERLAY_AND_UNBOUND_INTEGRATION_PASS`: 실제 Provider source/hook harness에서 delayed `getStatus` → terminal stop → late resolution이 native show를 호출하지 않는 것과, AppState active가 현 technician scope의 새 unbound event만 재조회하는 것을 실행했다. 이 경로는 위치 upload를 시작하지 않는다.
- `LOCATION_TRACKING_PUBLIC_STOP_RACE_PASS`: delayed native stop 중에도 exact owner의 overlay invalidation 요청이 먼저 발생하는 것을 실제 tracking module transform으로 확인했다.
- `FUTURE_ENERGY_STATUS_OVERLAY_KOTLIN_COMPILE_PASS`: Expo prebuild 뒤 Android `:future-energy-status-overlay:compileDebugKotlin`이 local module autolink를 포함해 성공했다. APK는 생성·서명·배포하지 않았다.

공식 근거: [Android Foreground services](https://developer.android.com/develop/background-work/services/fgs), [Android special permissions](https://developer.android.com/training/permissions/requesting-special), [Android PiP](https://developer.android.com/develop/ui/views/picture-in-picture), [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/), [Expo TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/), [Expo native modules](https://docs.expo.dev/modules/config-plugin-and-native-module-tutorial/).

## 아직 미확정인 것

- Android 실기기에서 다른 앱 전환·일반 화면 잠금 **중**, 앱을 다시 열기 전 callback·HTTP response·서버 accepted 저장 시각이 계속 증가하는지.
- 일반 앱 전환/일반 잠금과 Android force-stop, OEM battery restriction, 권한 철회는 서로 다른 조건이다. source harness와 Kotlin compile로 하나를 다른 하나로 대체할 수 없다.
- APK54는 변경·재빌드·교체하지 않았다. source review 전 새 APK·main merge·Production 배포·운영 위치 호출을 하지 않는다.
