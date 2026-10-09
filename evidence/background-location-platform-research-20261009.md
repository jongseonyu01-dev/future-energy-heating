
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
