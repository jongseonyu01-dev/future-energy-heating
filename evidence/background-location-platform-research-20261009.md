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

## 2026-10-09 18:52 제보 후 확인된 진단 결함과 후보 보완

> **확정 범위:** 아래는 `9bd86d4`(APK55 source) 위 source-level TaskManager 통합 재현이다. 운영 HTTP·고객/기사 위치·출발/도착·DB에는 접근하지 않았다. 사진만으로 설치 build 또는 실제 중단 원인을 확정하지 않는다.

1. **수정 전 확인된 결함:** HTTP `200` + body `success:true` + `accepted:true`가 이미 도착한 뒤 session diagnostics `setItem`만 지연시키면, callback의 10초 fence가 반환하면서 화면을 `CALLBACK_DEADLINE_EXCEEDED`/`storedCount:0`/`lastStoredAt:null`로 남겼다. 기존 `publishCallbackDeadline()`은 실제 응답이 없는 경우에도 `lastResponseAt=now`를 기록해 deadline 시각을 응답 시각처럼 보이게 했다.
2. **후보 최소 수정:**
   - verified `accepted`는 일반 journal read/write chain과 분리된 scope-bound immutable `accepted outcome` event에 비차단 기록하고, 화면에는 `lastAcceptedAt`/실제 body 완료 시각/서버 `updatedAt`/신규 저장 count를 **즉시** 반영한다. outcome storage가 멎어도 callback이 기다리지 않는다.
   - 기존 journal의 늦은 pre-response record는 같은 owner의 더 최근 accepted 화면을 idle/error로 되돌리지 못한다. 복귀 `read()`는 immutable accepted outcome을 session journal에 병합한다. A outcome은 A scope에만 남아 B에 반영되지 않는다.
   - `lastResponseHeadersAt`, `lastResponseBodyAt`, `lastAcceptedAt`, `lastCallbackDeadlineAt`을 분리했다. deadline은 `lastResponseAt`을 만들지 않는다.
   - callback/attempt의 고정 비식별 stage(ADOPTED, QUEUE, HTTP_REQUEST, HTTP_HEADERS, RESPONSE_BODY, SERVER_ACCEPTED, CALLBACK_DEADLINE), stage 시각·경과와 AppState 전환 시각을 기록한다. token, 고객/기사 식별정보, 정확한 좌표, 인증값은 새 journal/event/test fixture에 넣지 않는다. AppState 기록은 upload를 시작하거나 복귀 한 번 전송하지 않는다.
3. **실행 재현:**
   - `node --import tsx tests/location-taskmanager-terminal.integration.test.ts` → `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`. accepted 뒤 journal write hold 중 callback이 반환하고 stored 화면/카운터를 유지, 시작 시 diagnostics `setItem` hold 중에도 유효 callback fetch가 진행, headers-only/body timeout은 body 완료 시각을 만들지 않음, network reject·A/B isolation을 확인했다. 이 standalone runner는 CJS 환경에서도 keepalive로 exported completion promise가 settle할 때까지 종료하지 않는다.
   - `npx vitest run tests/location-runtime-diagnostics.test.ts tests/location-callback-isolation.test.ts --reporter=dot` → 20 tests PASS. accepted outcome이 same-callback deadline을 덮지 않고 B scope로 넘어가지 않음을 확인했다.
   - `node --import …/tsx/dist/loader.mjs tests/location-tracking-context-overlay.integration.test.ts` → `LOCATION_TRACKING_CONTEXT_OVERLAY_AND_UNBOUND_INTEGRATION_PASS`. background AppState marker와 active의 unbound 재조회가 upload API를 호출하지 않음을 확인했다.

## 2026-10-09 19:32~20:05 Codex e29 후속 4건 보완

> **확정 범위:** 이 항목도 source-level synthetic storage/clock/HTTP 실행 결과다. APK55에 포함되지 않았고, 홈 화면 overlay의 3~4분 정체와 같은 실기기 원인이라고 단정하지 않는다.

1. **same-session 늦은 deadline:** callback A의 늦은 deadline은 현재 session만 같아도 callback B의 newer callback/attempt/accepted 시각이 있으면 화면·journal을 error로 바꾸지 않는다. TaskManager B accepted 뒤 test-only delayed A deadline delivery를 실행해 stored/null error와 persisted deadline error 부재를 확인했다.
2. **복귀 accepted와 과거 오류:** immutable accepted outcome 병합은 같은 scope의 더 이전 `NETWORK_TIMEOUT`만 해소한다. 더 새 callback의 error/terminal은 과거 accepted가 지우지 않는다. same-callback deadline은 verified accepted 뒤의 local false deadline인 경우에만 별도로 해소한다.
3. **정확한 accepted count retention:** summary에는 immutable `acceptedOutcomeIds`를 기록한다. timestamp/checkpoint 순서는 지연 `setItem`이 실제로 합산됐다는 증거가 아니므로, exact event ID가 durable summary에 있을 때만 해당 event key를 정리한다. 새 reader에서 30개 outcome을 정확히 한 번 합산하고, summary write 후 exact ID가 반영된 event만 정리하는 회귀를 실행했다.
4. **초기 diagnostics I/O:** callback entry/adoption 이전에는 session diagnostics `ensure/update`를 await하지 않는다. 시작의 첫 diagnostics `setItem`을 hold한 상태에서도 FGS start 뒤 valid TaskManager callback의 fetch가 시작되는 통합 회귀를 실행했다. owner/credential/measurement/terminal fence는 그대로 필수 경계다.
5. **검증 결과:** `npx vitest run tests/location-runtime-diagnostics.test.ts tests/location-callback-isolation.test.ts --reporter=dot`은 2 files/22 tests PASS, TaskManager integration은 final marker PASS, lifecycle/headless/public-stop/context/overlay/auth 계약도 별도 PASS했다. edited-module ESLint는 errors 0(기존 `tech-schedule.tsx` unused warning 2개), `git diff --check` PASS, full TypeScript는 e29 기준과 각 83 errors/normalized diff 0이다.

## 2026-10-09 20:19 Codex runtime2019 4건 후속 보완

> **확정 범위:** 아래 네 항목은 source-level synthetic storage/clock/HTTP 재현의 diagnostics 결함과 후보 수정이다. 실제 단말의 3~4분 accepted 공백 원인으로 확정하지 않으며, 운영 HTTP·고객/기사 위치·출발/도착·DB에는 접근하지 않았다.

1. **현재 callback deadline의 소유권:** 같은 callback에서 request start는 당연히 callback entry보다 늦다. 이를 후속 callback으로 오인하던 timestamp 비교를 제거하고, session generation + callback lease로 A/B를 구분했다. 따라서 현재 callback의 10초 만료는 `CALLBACK_DEADLINE`으로 종결되며, 실제 후속 B callback만 A deadline의 화면·journal write를 막는다. owner read를 2ms 지연한 뒤 pending fetch가 10초를 넘는 actual TaskManager 회귀와 A owner → B accepted → A deadline delivery 회귀를 추가했다.
2. **늦은 accepted outcome:** B가 먼저 summary에 반영된 뒤 A outcome `setItem`이 늦게 끝나도 observedAt/checkpoint 시각만으로 A를 skip/delete하지 않는다. immutable event ID가 summary에 실제 반영된 경우에만 compaction한다. 이 event가 다음 summary write에서 정확히 한 번 합산되어 storedCount 2로 복원되는 gate-based 회귀를 추가했다.
3. **두 Store summary/compaction 교차:** 동일 storage/scope의 Store instances는 shared scope lock으로 summary mutation을 직렬화한다. deadline이 기존 immutable write를 detach하면 lock을 해제해 다음 callback을 막지 않고, late A record는 immutable journal merge가 B의 `storedCount`/accepted·stored 시각 floor를 보존한다. summary setItem gate 중 두 번째 Store update가 대기하고, compaction 뒤에도 `1`/non-null을 보존하는 회귀를 추가했다.
4. **정상 callback·measurement 복원:** HTTP가 실제 시작된 뒤에만 비차단 summary update로 `lastCallbackAt`, `lastMeasuredAt`, native registration/check, attempt를 남긴다. pre-request diagnostic await를 되살리지 않았다. summary가 전혀 없는 scope에서도 immutable accepted outcome + 첫 update가 callback/measurement/attempt/stored evidence를 생성하는 store 회귀와 actual TaskManager 통합 회귀를 추가했다.
5. **실행 결과:** `node --import tsx tests/location-taskmanager-terminal.integration.test.ts` → `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`; `npx vitest run tests/location-callback-isolation.test.ts tests/location-runtime-diagnostics.test.ts --reporter=dot` → 2 files/25 tests PASS. 이후 기존 위치·인증 Vitest 6 files/46 tests 및 standalone terminal/headless/owner/auth 12개 final markers도 PASS했다. 이는 Android 실기기/Production accepted 성공이 아닌 합성 실행 결과다.

## 아직 미확정인 것

- Android 실기기에서 다른 앱 전환·일반 화면 잠금 **중**, 앱을 다시 열기 전 callback·HTTP response·서버 accepted 저장 시각이 계속 증가하는지.
- 일반 앱 전환/일반 잠금과 Android force-stop, OEM battery restriction, 권한 철회는 서로 다른 조건이다. source harness와 Kotlin compile로 하나를 다른 하나로 대체할 수 없다.
- APK54와 APK55 내부 검증 APK 원본은 보존한다. 이 새 source 후보는 코드 재검수 전 APK 재빌드·재서명·교체를 하지 않으며, main merge·Production 배포·운영 위치 호출도 하지 않는다.

## 2026-10-09 20:59 Codex 최종 결과·accepted 합산 3건 보완

> **확정 범위:** 아래는 `09b4e00` 위 source-level actual TaskManager/합성 storage 재현의 진단 결함과 후보 보완이다. 실제 Android 단말의 3~4분 accepted 공백 원인으로 확정하지 않으며, 운영 HTTP·고객/기사 위치·출발/도착·DB에는 접근하지 않았다.

1. **최종 응답 결과 보호:** callback lease에 `pending → accepted|ignored|error|terminal` 최종 결과를 추가했다. HTTP_HEADERS·attempt 같은 늦은 진행 진단 snapshot은 안전하게 영속될 수 있지만, 같은 callback의 verified accepted나 그 뒤 callback의 network error/`accepted:false`를 다시 `stored`로 화면에 표시할 수 없다. `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`에서 accepted → network error, accepted → ignored 뒤 detached diagnostics가 모두 settle된 뒤에도 최종 화면이 각각 error/ignored로 유지되고, durable restore도 `storedCount:1`로 확인했다.
2. **accepted 단일 합산 경로:** verified accepted는 immutable `accepted outcome`을 `readMergedUnsafe()`에서 정확히 한 번 fold하는 경로만 count를 올린다. response follow-up은 response/stage 시각만 보완하며 outcome ID·`storedCount`를 다시 수정하지 않는다. compaction 뒤에도 summary의 acknowledged exact ID를 제거하지 않아, event key가 사라진 것을 “미합산”으로 오인하지 않는다. actual TaskManager normal acceptance 1회/2회는 settle·fresh read 뒤 각각 count 1/2로 확인했다.
3. **만료 뒤 분리 summary 합산:** `releaseExpiredWork()`로 먼저 시작한 summary write가 detach된 뒤 두 번째 Store가 서로 다른 accepted outcome을 기록하면, summary merge는 acknowledged ID 합집합의 크기를 count floor로 사용한다. 따라서 `ID=[A,B]`/저장2건이 `Math.max(1,1)`로 1건이 되는 것을 막는다. 실제 gate-based store regression은 late first summary와 newer second summary가 교차·compaction을 끝낸 뒤 `storedCount:2`, `acceptedOutcomeIds:2`, immutable key 0으로 fresh restore됨을 확인했다.
4. **실행 결과:** `npx vitest run tests/location-runtime-diagnostics.test.ts --reporter=dot` → 21 tests PASS; `node --import tsx tests/location-taskmanager-terminal.integration.test.ts` → `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`; 기존 terminal/headless/owner/auth standalone 10개 marker와 Vitest 6 files/47 tests도 PASS했다. edited-file ESLint·`git diff --check` PASS. full TypeScript는 `09b4e00` 기준과 각각 83 errors/normalized diff 0으로, 기존 전역 오류를 통과로 표기하지 않는다.


## 2026-10-09 23:03 실기기 정체 제보 후 — Android background location 권한 경계

> **확정 범위:** APK56 source (`dac05ba`)와 설치된 Expo SDK54 Android source/config plugin, 그리고 격리 permission-flow 실행 결과다. YouTube 위 overlay에서 “마지막 서버 저장 1분 전”이 보인 사진은 빌드·callback·HTTP·accepted 시각이 없으므로, 이 결함이 해당 1~4분 정체의 실제 단일 원인이라는 뜻은 아니다. 운영 HTTP·고객/기사 위치·출발/도착·DB에는 접근하지 않았다.

1. **확정된 source 결함:** APK56 source의 `app.config.ts`는 `expo-location.isAndroidBackgroundLocationEnabled: false`였고, 출발 권한 flow는 foreground 위치+알림만 요청했다. `ACCESS_BACKGROUND_LOCATION`이 config/manifest에 없고 `requestBackgroundPermissionsAsync()`도 호출하지 않았다.
2. **왜 수정 후보인지:** 설치된 Expo SDK54 config plugin은 `isAndroidBackgroundLocationEnabled:true`일 때 `android.permission.ACCESS_BACKGROUND_LOCATION`을 추가한다. 같은 Expo `LocationTaskConsumer.didRegister()`/`setOptions()`는 `startLocationUpdates()`를 다시 호출하지만, `requestLocationUpdates()`의 `SecurityException`은 로그 후 return한다. 또한 `maybeStartForegroundService()`는 app foreground가 아니면 FGS 시작 없이 return한다. 따라서 registration/overlay/FGS notification만으로 background callback·HTTP·accepted를 증명할 수 없고, restored/background update permission을 명시적으로 확보해야 한다.
3. **최소 candidate:**
   - Expo config의 `isAndroidBackgroundLocationEnabled:true`, `isAndroidForegroundServiceEnabled:true`, 명시 `ACCESS_BACKGROUND_LOCATION`을 추가했다. source `expo config --type public`과 `--type introspect`에서 `ACCESS_BACKGROUND_LOCATION` 및 `FOREGROUND_SERVICE_LOCATION`이 모두 존재함을 확인했다. 이는 **candidate source config** 검증이지 새 APK Manifest 검증이 아니다.
   - 출발을 누르면 foreground 승인 뒤 Android 11+ Settings 전환의 목적(출발 후 다른 앱·홈·잠금 중 공유, 도착/취소/logout/권한 철회 시 종료, PII 미표시)을 먼저 설명한다. 이어 `requestBackgroundPermissionsAsync()`를 요청한다. `foreground/background/notification` 모두 승인되기 전에는 server `location.startTracking` mutation을 호출하지 않는다. 앱을 수시로 열라는 우회 문구도 제거했다.
   - 기사 진단은 background permission을 “FGS 방식”으로 정상처럼 표시하지 않고, 미승인 시 “항상 허용 필요”로 별도 보인다.
4. **실행 증거:**
   - `tests/location-permission-flow.test.ts`: foreground 거절, 사전안내 취소, background 거절, notification 거절 각각 server session 0회; foreground → 설명 → background → notification → session 1회 순서를 실행했다.
   - `node --import tsx ./node_modules/vitest/vitest.mjs run tests/location-permission-flow.test.ts tests/location-runtime-diagnostics.test.ts tests/location-callback-isolation.test.ts tests/location-consent-confirmation.test.ts tests/location-upload-scheduler.test.ts` → 5 files / 43 tests PASS.
   - standalone `LOCATION_TRACKING_LIFECYCLE_RACE_PASS`, `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`, `LOCATION_CUSTOM_PACKAGE_ENTRY_HEADLESS_INTEGRATION_PASS`, `LOCATION_TRACKING_RUNTIME_INTEGRATION_PASS`, `LOCATION_TRACKING_PUBLIC_STOP_RACE_PASS`, `LOCATION_TRACKING_CONTEXT_OVERLAY_AND_UNBOUND_INTEGRATION_PASS`, `LOCATION_BACKGROUND_SHARING_CONTRACT_PASS`, `LOCATION_STATUS_OVERLAY_OWNER_AND_AGE_CONTRACT_PASS`를 재실행했다.
   - edited-file ESLint errors 0 (기존 `tech-schedule.tsx` unused warning 2개), `git diff --check` PASS. full TypeScript는 APK56 baseline과 candidate 모두 83 errors이며, 수정 파일의 신규 error 0이다.
5. **남은 실기기 증거:** candidate는 code review 후 새 내부 APK에서만 검증한다. 실제 Android에서 앱을 다시 열기 **전** 일반 앱 전환·홈·일반 잠금 중 callback/measurement/request/headers/body/accepted 시각이 증가해야 한다. `ACCESS_BACKGROUND_LOCATION` 승인, overlay 표기, native registration 또는 FGS notification 단독은 accepted 저장 성공 증거가 아니다. force-stop/OEM battery restriction/권한 철회는 별도 조건이다.

## 2026-10-10 00:12 — 기존 세션 restore·headless 권한 철회 보완

> **확정 범위:** `e38ed6f` 권한 후보에 대한 source-level 보완이다. 실제 Android FGS가 일반 앱 전환·잠금 중 왜 멈췄는지의 확정 원인은 아니다. `ACCESS_BACKGROUND_LOCATION`이 이미 foreground에서 시작한 모든 location FGS에 무조건 필요하다고 주장하지 않는다.

1. **수정 전 결함:** 새 출발만 foreground → background → notification gate를 통과했다. 이미 APK56에서 저장된 active session의 `restoreLocationTrackingForUser()`와 headless TaskManager callback은 그 gate를 거치지 않아, 권한 철회 뒤에도 native 재등록 또는 upload path를 시도할 수 있었다. 권한 전용 error 뒤 정확한 local pointer stop도 없었다.
2. **최소 보완:**
   - `readExistingLocationTrackingPermissionEligibility()`는 foreground/background의 **현재 상태만 읽고** prompt·Settings·server mutation을 실행하지 않는다. restore 전 및 headless exact adoption 뒤, HTTP `fetch` 전 이 read를 적용했다.
   - confirmed denial은 **그 exact saved session**만 native stop 대상으로 만든다. permission-query failure는 승인으로 취급하지 않고 복원을 막되, 다른 session을 추정해 stop하지 않는다.
   - native task의 exact `E_LOCATION_UNAUTHORIZED`만 permission-revoked unbound evidence로 기록한다. error payload에 session ID가 없으므로 in-memory exact owner가 없으면 arbitrary A/B를 stop하지 않는다. 늦은 A error는 새 B를 멈출 수 없다.
   - restore permission read 사이에 logout/stop/B start가 생기면 captured lifecycle generation이 달라져 restore를 포기한다. 승인 상태는 repeat prompt 없이 normal restore로 진행한다.
3. **합성 실행 증거:**
   - `tests/location-permission-flow.test.ts` 8 cases: approved existing read는 get-only, confirmed denied/unavailable은 비승인으로 분리했다.
   - actual TaskManager integration: classified native permission revoke는 current session native stop 후 후속 HTTP 0; regular callback의 denied permission도 exact adopted session을 fetch 전에 stop; delayed old-A native revoke 중 B start 뒤 B HTTP 1을 확인했다. `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`.
   - actual public restore race: delayed pre-read + concurrent stop이 native restore를 재시작하지 않고, denied persisted session은 native start 0/stop 1로 차단되며 승인된 persisted session은 normal native start로 진행함을 completion keepalive와 함께 확인했다. `LOCATION_TRACKING_PUBLIC_STOP_RACE_PASS`.
4. **유지된 경계:** callback deadline/terminal A-B lease/accepted exact count/auth-account protection과 overlay owner stop을 같은 focused suite에서 재실행했다. 새 AppState upload, retry loop, overlay 성공 표시 변경, APK build/운영 호출은 추가하지 않았다.

## 2026-10-10 06:24 Codex 권한 대기·same-session resume 3건 보완

> **확정 범위:** `dad4e7a` 위 source-level lifecycle/TaskManager 합성 재현의 권한 처리 결함이다. 이는 APK56의 앱 밖 accepted 공백의 실제 원인을 확정하지 않으며, Android FGS에 `ACCESS_BACKGROUND_LOCATION`이 항상 필수라는 주장도 아니다. 운영 HTTP·고객/기사 위치·출발/도착·DB는 호출하지 않았다.

1. **수정 전 확인된 세 결함:** cold persisted session은 confirmed denial 때 terminal inactive 처리·pointer clear되어 나중 승인해도 같은 업무를 이어갈 수 없었다. warm current session은 `stopStoredExact()`의 cold-state read 조건 때문에 `intent`가 이미 있을 때 native collection을 즉시 fence하지 못했다. native `E_LOCATION_UNAUTHORIZED` callback은 unbound journal await가 앞서면 지연 중 다음 callback이 HTTP를 한 번 더 시도할 여지가 있었다.
2. **최소 보완:**
   - `TrackingLifecycleCoordinator`에 terminal과 별도의 **permission-pending suspend**를 추가했다. exact owner/generation을 즉시 무효화하고 native stop을 journal marker보다 먼저 queue하며, `location_tracking_state_v2` pointer를 지우거나 inactive marker를 쓰지 않는다.
   - permission-pending marker는 token/좌표/고객정보 없이 exact state identity 범위에만 저장한다. `restoreLocationTrackingForUser()`는 foreground/background 승인 재조회 후 같은 pointer를 normal restore하며, 성공 native start 뒤 marker를 비차단 정리한다. UI/Settings/server mutation을 반복 실행하지 않는다.
   - headless adoption은 permission-pending marker가 있으면 fail-closed로 HTTP 전에 반환한다. native permission error는 in-memory exact owner가 있을 때 authority를 먼저 suspend하고 unbound diagnostic은 detached로 기록한다. unknown cold error는 A/B에 귀속하거나 중지하지 않는다.
3. **실행 증거:**
   - `LOCATION_TRACKING_PUBLIC_STOP_RACE_PASS`: cold denied persisted session은 native start 0/stop 1이면서 pointer를 유지하고, background 승인 후 **같은 requestId**가 UI 안내·새 server session 없이 native start 1로 재개됨을 확인했다.
   - `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`: warm exact `E_LOCATION_UNAUTHORIZED`는 delayed unbound journal이 pending이어도 native stop 1, next callback fetch 0, resumable pointer 보존을 확인했다. delayed old A revoke 이후 replacement B HTTP 1도 유지했다.
   - `LOCATION_TRACKING_LIFECYCLE_RACE_PASS`, `LOCATION_CUSTOM_PACKAGE_ENTRY_HEADLESS_INTEGRATION_PASS`, `LOCATION_TRACKING_RUNTIME_INTEGRATION_PASS`, `LOCATION_STATUS_OVERLAY_OWNER_AND_AGE_CONTRACT_PASS`, `MOBILE_AUTH_SESSION_CONTRACT_PASS`, `LOCATION_BACKGROUND_SHARING_CONTRACT_PASS`와 Vitest 3 files/34 tests를 재실행했다. edited-file ESLint 및 `git diff --check` PASS. full TypeScript는 `dad4e7a`와 각각 기존 83 errors, normalized new lines 0이다.
4. **유지된 경계:** terminal server response는 여전히 inactive marker/pointer clear를 사용한다. permission pending은 terminal을 되살리지 않으며, grant 전 headless upload도 허용하지 않는다. 새 APK build·재서명·운영 호출·merge/deploy는 하지 않았다.

## 2026-10-10 06:52 권한 대기 UI·명시 재개 보완 후보

> **확정 범위:** `c2fcf26` 위 source-level lifecycle/TaskManager/Provider 합성 실행 보완이다. 이 후보는 실제 Android 앱 밖 accepted 공백의 원인을 확정하지 않으며, 권한 승인·작은 상태창·native registration을 server accepted 성공으로 표기하지 않는다. 운영 HTTP·고객/기사 위치·출발/도착·문자·DB에는 접근하지 않았다.

1. **권한 대기는 terminal이 아니다.** confirmed denial/`E_LOCATION_UNAUTHORIZED`는 exact native collection과 upload authority만 먼저 suspend한다. 저장된 request pointer는 유지하고 Provider에도 같은 session을 publish한다. 따라서 권한 대기 화면에서도 기존 업무의 도착·업무 취소 경로는 유지된다.
2. **재개는 별도 foreground action이다.** 기사 화면은 “권한 확인·공유 재개”를 표시한다. 이 action은 Android 현재 권한만 읽어 승인되면 같은 `requestId` pointer를 native collection으로 restore한다. 새 `location.startTracking` server mutation, 고객 문자, 좌표 읽기, 즉시 upload를 수행하지 않는다. 앱 active reconciliation도 같은 eligibility read를 거치며, 아직 grant 전인 cold/headless TaskManager callback은 HTTP 전에 fail-closed 한다.
3. **늦은 marker 역전 보호:** permission-pending marker와 permission-resumed acknowledgement는 동일 exact-state identity에 versioned record로 남긴다. 재개 acknowledgement를 기록한 뒤 예전 pending `setItem`이 늦게 끝나도 cold read는 resume record를 우선한다. 재개한 in-memory owner는 pending marker 제거 await가 늦어도 exact owner를 유지하며, 다른 A/B/terminal에는 적용되지 않는다.
4. **실행 증거:**
   - `LOCATION_TRACKING_PUBLIC_STOP_RACE_PASS`: denied existing session은 화면에 같은 request로 남고, explicit approval resume은 native start 1회·same requestId·pending=false를 확인했다.
   - `LOCATION_TRACKING_CONTEXT_OVERLAY_AND_UNBOUND_INTEGRATION_PASS`: actual Provider hook harness에서 permission pending session이 visible이며 resume action이 local API 1회만 호출하고 original requestId를 보존하는 것을 확인했다.
   - `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`: revoke 뒤 approval만으로는 cold callback HTTP 0회, explicit resume 뒤 다음 valid callback HTTP 1회; delayed old pending marker write가 resume acknowledgement 뒤 settle해도 pending=false와 next callback HTTP 1회를 확인했다.
   - lifecycle/headless/background-sharing contract standalone marker 및 Vitest 4 files/39 tests를 재실행했다. edited-file ESLint errors 0(기존 `tech-schedule.tsx` unused warnings 2개), `git diff --check` PASS. full TypeScript는 `c2fcf26` baseline과 candidate 모두 기존 83 errors, normalized diff 0이다.
5. **금지/한계:** 이 후보는 새 APK·재서명·merge·Production deploy·공개 링크 변경을 만들지 않았다. 실기기 수용은 새 내부 APK가 독립 code review를 통과한 뒤, 앱 재진입 전 일반 앱 전환·홈·일반 잠금 중 callback → request/body → accepted 시각 증가와 terminal 후 update 0으로 별도 판단한다.


## 2026-10-10 07:34 권한 변경 즉시 일시중지·늦은 재개 결과 격리 후보

> **확정 범위:** 이 항목은 `f5b78fe` 위 source-level lifecycle/Provider/TaskManager 합성 실행의 두 권한 경합 결함과 최소 보완이다. APK56에서 관측된 앱 밖 accepted 공백의 실제 원인을 확정하지 않는다. 운영 HTTP·고객/기사 위치·출발/도착·문자·DB는 호출하지 않았다.

1. **현재 공유 중 권한 거부:** foreground AppState 복귀의 non-interactive permission read가 `denied`를 확인할 때, 기존 코드의 cold `suspendStoredExact()`만 사용하면 current in-memory `intent`는 즉시 native collection/upload authority를 fence하지 못할 수 있었다. 이제 same exact current state이면 `suspendKnownExact()`로 generation·upload authority·overlay owner를 먼저 무효화하고 native stop을 이어서 시작한다. 따라서 다음 location callback을 기다리지 않으며, session pointer는 terminal로 지우지 않고 permission-pending으로 유지한다.
2. **권한 재개 결과 소유권:** “권한 확인·공유 재개”는 클릭 당시의 exact state를 입력으로 잡고, Android permission read 뒤 persisted pointer를 다시 비교한다. 업무 도착/취소·logout·다른 계정·다른 업무 B가 그 사이 발생하면 `no_matching_session`으로 종료한다. `restoreForUser`도 expected pointer가 아니면 native collection을 시작하지 않는다. Provider는 동일 exact state가 바뀔 때 resume generation을 즉시 취소하므로 늦은 A 결과가 B 화면을 clear/overwrite/restart하지 못한다.
3. **AppState와 native callback의 동일 정책:** AppState active reconciliation은 `restoreLocationTrackingForUser()`를 통해 위 exact permission suspend를 사용하고, native `E_LOCATION_UNAUTHORIZED` 및 headless permission eligibility denial은 이미 동일 `suspendCurrentTrackingForPermissionRevocation()`으로 upload authority를 first-step으로 무효화한다. 권한 대기 중에는 기존 업무의 도착·취소만 유지하며, 명시 foreground 재개 전 native re-registration·새 server session·고객 문자·좌표 read·강제 upload를 실행하지 않는다.
4. **실행 증거:**
   - `LOCATION_TRACKING_PUBLIC_STOP_RACE_PASS`: current exact A의 denied restore가 다음 callback 없이 native stop을 시작하고 permission-pending pointer를 유지함, delayed A permission approval 중 B start 후 A result가 `no_matching_session`이며 B intent를 보존함을 실제 transformed tracking module로 확인했다.
   - `LOCATION_TRACKING_CONTEXT_OVERLAY_AND_UNBOUND_INTEGRATION_PASS`: actual Provider hook harness에서 delayed A permission result 뒤 B state와 terminal/null state를 차례로 전달해, late result가 B trackingRequestId를 덮지 않고 종료된 A를 되살리지 않음을 확인했다. 재개 버튼은 pending 중 disabled/spinner로 중복 query도 막는다.
   - `LOCATION_TASKMANAGER_TERMINAL_INTEGRATION_PASS`와 `tests/location-permission-flow.test.ts` 8 cases PASS: native callback permission revoke와 headless denied path는 HTTP 전에 exact session suspend/return하며, new departure의 permission denial은 server session 0회다.
   - 추가 보호 suite: `LOCATION_CUSTOM_PACKAGE_ENTRY_HEADLESS_INTEGRATION_PASS`, `LOCATION_TRACKING_LIFECYCLE_RACE_PASS`, `LOCATION_STATUS_OVERLAY_OWNER_AND_AGE_CONTRACT_PASS`, `LOCATION_BACKGROUND_SHARING_CONTRACT_PASS`; Vitest `location-runtime-diagnostics`, `location-callback-isolation`, `location-permission-flow` 3 files/34 tests PASS. Edited-file ESLint는 errors 0, 기존 `tech-schedule.tsx` unused warning 2개는 그대로다.
5. **남은 한계:** Android real-device에서 permission Settings의 실제 AppState transition, 승인 뒤 explicit same-work resume, 일반 앱 전환·홈·잠금 중 callback → HTTP → accepted 지속은 새 검수 APK 이후 별도 증거가 필요하다. 이 후보는 APK build·재서명·merge·Production deploy·실제 운영 호출을 만들지 않는다.
