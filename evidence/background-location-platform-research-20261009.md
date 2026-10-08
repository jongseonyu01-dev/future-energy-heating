# Android/Expo 백그라운드 위치 조사 근거 — 2026-10-09

## 외부 공식 문서

1. [Expo Location SDK 문서](https://docs.expo.dev/versions/latest/sdk/location/)
   - `startLocationUpdatesAsync`는 백그라운드에서도 위치 업데이트를 받는 TaskManager 등록 API이며, 태스크는 전역 범위에서 `TaskManager.defineTask`로 정의해야 한다.
   - Android에서 앱을 강제 종료하면 위치 백그라운드 작업이 자동 재시작되지 않는다. 최근 앱 목록에서 제거했을 때의 동작도 제조사에 따라 달라질 수 있다.
   - Android `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_LOCATION`은 앱이 열려 있다가 백그라운드가 된 상태의 위치 접근에 쓰이며, `ACCESS_BACKGROUND_LOCATION`은 별도 권한이다.
   - `hasStartedLocationUpdatesAsync`는 **등록 여부**를 반환하며 최근 callback, 실제 FGS 프로세스 생존, HTTP 응답/서버 저장을 보장하는 API로 문서화되어 있지 않다.
   - URL: https://docs.expo.dev/versions/latest/sdk/location/

2. [Expo TaskManager SDK 문서](https://docs.expo.dev/versions/latest/sdk/task-manager/)
   - 전역 범위 task 정의가 필요하다. 백그라운드 실행은 JS 앱을 기동해 task를 실행한 뒤 UI 없이 종료될 수 있으므로 React Provider/화면 상태를 실행 근거로 쓸 수 없다.
   - 등록 task는 세션 간 persistent storage에 보존될 수 있다.
   - URL: https://docs.expo.dev/versions/latest/sdk/task-manager/

3. [Android Developers — Foreground service types: location](https://developer.android.com/develop/background-work/services/fgs/service-types#location)
   - Android 14+에서 location FGS type과 `FOREGROUND_SERVICE_LOCATION` 선언이 필요하고, 위치 서비스가 켜져 있으며 coarse/fine 권한이 필요하다.
   - 위치 권한은 while-in-use 제한 대상이므로 앱이 이미 백그라운드일 때 location FGS를 새로 만들려면 `ACCESS_BACKGROUND_LOCATION`이 필요하다. 이는 **출발 시 전경에서 이미 FGS를 시작한 뒤 앱 전환한 경우와 구분**해야 한다.
   - URL: https://developer.android.com/develop/background-work/services/fgs/service-types#location

## 설치된 후보의 실제 Expo Android 소스 대조

- 검사 버전: `expo 54.0.29`, `expo-location 19.0.8`, `expo-task-manager 14.0.9`, `react-native 0.81.5`.
- `expo-location` `LocationModule.kt`:
  - `startLocationUpdatesAsync`는 `foregroundService` 옵션이 있으면 background permission 없이 foreground location/FGS 권한으로 task를 등록한다.
  - 앱이 전경이 아니면 `ForegroundServiceStartNotAllowedException`을 낸다.
  - `hasStartedLocationUpdatesAsync`는 TaskManager consumer 등록 여부만 확인한다.
- `LocationTaskConsumer.kt`:
  - location PendingIntent broadcast → Job → TaskManager JS task 실행 경로를 사용한다.
  - FGS `LocationTaskService`는 location updates와 별개이며, service 자체는 `START_REDELIVER_INTENT`를 반환하고 `killServiceOnDestroy:false`이면 recent-task 제거 시 자체 종료 요청을 하지 않는다.
  - `LocationTaskConsumer`는 background 상태에서 deferred locations의 Android 기본값(`deferredUpdatesDistance` 0, `deferredUpdatesInterval` 0)에 따라 dispatch한다. JS callback/HTTP가 막힌 상황을 native FGS 알림만으로 알 수 없다.

## 구현/검수 원칙

- 별도 sticky 중지 알림과 Expo native FGS 알림은 서로 독립적이므로 하나가 남아도 다른 하나나 callback/HTTP가 살아 있다는 증거가 아니다.
- 화면 debug state는 module memory이므로 앱/JS runtime 재생성 뒤의 현재 상태 근거가 될 수 없다.
- 복귀 시 `restoreForUser()`가 persisted intent만 보고 return하면 native task가 이미 외부 중단된 경우 재시작을 보장하지 못한다.
- 진단은 session-bound persisted record에 callback 시작/HTTP 시작/응답/accepted 저장 시각과 오류 분류를 기록하고, 화면 복귀 때 registered 여부·최근 진단·현재 소유자를 대조해야 한다.
- `fetch()` 반환 이후 `response.json()`에도 별도 유한 시간 경계가 필요하다. 단일 queue가 JSON 본문 대기로 영구 점유되어 최신 callback을 막지 않게 해야 한다.
- 위 공식/소스 조사는 실제 Android 기기에서의 실행 성공 증거가 아니다. 새 APK 전 실기기에서 다른 앱 전환·잠금 중 accepted 저장 시각의 증가를 확인해야 한다.

## TaskManager 작업 예산 대조 — 코드 보완 근거

- 잠금된 `expo-task-manager` `TaskService.java`에는 `MAX_TASK_EXECUTION_TIME_MS = 15000`와 async job의 `finishJobAfterTimeout(..., 15000)`, timeout 시 `jobFinished(params, false)`가 있다.
- 후보는 이 native job 경계보다 낮게 **fetch 8초**와 **응답 본문 2초**를 따로 제한하고, headless callback 안의 지연 재시도 루프는 제거한다. 이로써 `fetch`가 반환된 뒤 무제한 `response.json()`이 최신 측정 queue를 잡는 빈틈을 줄인다.
- 이 시간값은 TaskManager가 JS를 정확히 15초에 강제 중단한다는 주장이나 이번 실기기 중단의 확정 원인이 아니다. native callback·HTTP·서버 `accepted:true` 저장은 세션별로 각각 기록·대조해야 한다.
