
## P1 후속 소스 조사·후보 보완 — 2026-10-09 15:xx KST

### 확인된 소스 사실 (실기기 원인 확정 아님)

1. 설치 후보의 `expo-location 19.0.8` Android `LocationModule.kt`는 `foregroundService` 옵션으로 `startLocationUpdatesAsync`를 호출할 때 앱이 전경이 아니면 `ForegroundServiceStartNotAllowedException`을 던진다. `LocationTaskConsumer.didRegister()`는 `startLocationUpdates()` 뒤 `maybeStartForegroundService()`를 호출하며, 후자는 `AppForegroundedSingleton.isForegrounded`가 false면 FGS 시작 없이 return한다.
2. 같은 native `startLocationUpdates()`는 `requestLocationUpdates()`의 `SecurityException`을 로그만 남기고 return한다. 반면 `hasStartedLocationUpdatesAsync`는 TaskManager consumer 등록 여부만 반환한다. 따라서 `registered=true`는 FGS·GPS·TaskManager JS callback·HTTP·서버 accepted의 증거가 아니다.
3. `expo-task-manager 14.0.9` `TaskService`는 headless app을 로드한 뒤 task manager에 대기 event를 넘기며, consumer/task를 찾지 못하면 task intent를 취소할 수 있다. 앱 `package.json` main은 `expo-router/entry`; Expo Router `_ctx.android.js`는 app route context를 require한다. 후보의 `app/_layout.tsx`는 모듈 import 단계에서 `LocationTrackingProvider` → `location-tracking`을 import한다.
4. 실제 root-module import만 수행하고 `RootLayout()` 렌더를 호출하지 않는 독립 harness에서 `TaskManager.defineTask("FUTURE_ENERGY_LOCATION_TASK")`가 정확히 한 번 호출되었다 (`LOCATION_HEADLESS_ENTRY_INTEGRATION_PASS`). 이는 현재 source entry의 회귀 방지 증거이지 Android 기기에서 callback이 실제 도착한다는 증거는 아니다.
5. Production Vercel 배포 `dpl_FSLz4gm7BJYcJBfcgray4y6uahf3`은 read-only 조회에서 `READY`, Git commit `4f49b140c3b4f86685933dc1cc53fa5083d66cd6`으로 확인되었다. 그 commit 및 현재 remote `main`의 `public/web/track.html` blob은 모두 `d60964b0445e019331ef281543f78b77d00d1818`이다. 따라서 delayed 상태가 generic waiting으로 덮이는 문제는 **현재 Production source identity와 일치하는 소스 버그**다. 실제 고객 세션의 최초 실패 지점은 여전히 미확정이다.

### 이번 후보 보완

- 위치 lifecycle은 native FGS 시작을 보조 control notification보다 먼저 수행한다. 출발 버튼 처리 중 보조 알림 I/O가 FGS의 전경 시작 window를 넓히지 않도록 한 최소 순서 변경이며, notification이 callback/HTTP/저장을 보장한다고 주장하지 않는다.
- TaskManager callback은 entry 시각을 확보한다. session 채택 전 native error·빈/오래된 측정·adoption timeout·no credential은 token/좌표/고객정보 없이 module-scoped unbound event (`TASK_NATIVE_ERROR`, `NO_FRESH_MEASUREMENT`, `ADOPTION_TIMEOUT`, `NO_CREDENTIAL`, `NO_ADOPTABLE_SESSION`)로만 남긴다. 이 event는 A/B 어느 세션에도 임의 귀속하거나 기사 화면 오류로 publish하지 않는다.
- headless adoption 후 exact session이 확인되면 callback entry time, latest measurement time, native registration check, coordinate-invalid error를 기존 immutable session journal에 기록한다. request start, response, accepted server `updatedAt`, terminal/error 분류, non-sensitive app version/build label은 기존 session diagnostics에 유지된다.
- unbound marker에는 callback 전체 10초 deadline 중 최대 750ms tail budget만 배정한다. 준비 I/O가 멎으면 marker가 callback 전체 예산을 소모하지 않으며, timed-out 작업은 fence를 다시 확인해 late UI/state publication 권한을 얻지 못한다.

### 고객 지도 표시 수정 범위

- `DELAYED`/`LEGACY_RECEIPT_DELAYED`는 server가 좌표를 `null`로 제공하는 정책을 유지한다. 지도 초기화에도 같은 delay-specific empty message를 전달해 generic “기사 위치 수신 대기”로 덮이지 않게 했다.
- `CURRENT` map flow, `DELAYED`, `UNAVAILABLE` first-signal wait, Kakao SDK failure, polling/network failure를 실행 harness로 분리했다 (`TRACK_LOCATION_DISPLAY_INTEGRATION_PASS`). stale coordinates are never rendered as current.

### 지속 상태 UI 선택

| 후보 | 권한/플랫폼 조건 | 판단 |
| --- | --- | --- |
| 기존 Android location FGS ongoing notification | 기존 location FGS/알림 구성, status-bar notification | **채택 후보.** 최소 추가 권한이며 앱 열기·기존 중지 action의 비민감 상태 surface로 사용한다. 마지막 accepted 저장 경과는 저장 증거가 있을 때만 표시하고, 고객명·주소·좌표는 표시하지 않는다. |
| Overlay/bubble | Draw over other apps는 Android Special app access이며 Settings에서 별도 승인 필요 | **미채택.** 추가 특별 권한과 policy/UX 부담이 있어 현재 P1 근본 원인 해결 전 도입하지 않는다. |
| PiP | Activity 등록·PiP 전환 필요; Android 문서는 video playback/video call/navigation 중심 | **미채택.** location callback/FGS/잠금 생존을 보장하지 않으며, 작은 UI 입력성도 제한적이다. |

- 공식 근거: [Android FGS overview](https://developer.android.com/develop/background-work/services/fgs), [special permissions](https://developer.android.com/training/permissions/requesting-special), [PiP guide](https://developer.android.com/develop/ui/views/picture-in-picture), [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/), [Expo TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/).

### 이번 단계의 명확한 한계

- Android 실기기에서 다른 앱 전환·일반 화면 잠금 **중**, 앱을 다시 열기 전 callback·HTTP response·서버 accepted 저장 시각이 계속 증가하는 증거는 아직 없다.
- Android force-stop, OEM battery restriction, 권한 철회는 일반 앱 전환/화면 잠금과 다르며 이번 source harness로 해결을 주장할 수 없다.
- APK54는 변경·재빌드·교체하지 않았다. source review 전 새 APK·main merge·Production 배포·운영 위치 호출은 하지 않는다.
