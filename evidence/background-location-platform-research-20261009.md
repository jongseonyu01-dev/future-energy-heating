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
