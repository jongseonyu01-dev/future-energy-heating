# code 38 ImagePicker native registration 보완

## 실기기 실패 원인

code 38의 실제 `code38-crash.txt` 분석에서 `Cannot find native module 'ExponentImagePicker'`와 `FATAL EXCEPTION: mqt_v_native`가 반복됐다. 기존 APK에는 `expo.modules.imagepicker.ImagePickerModule` 클래스 및 JavaScript `ExponentImagePicker` 참조가 있었지만, Expo Android 자동 등록 목록에는 모듈이 없었다. 따라서 통신 API가 아니라 점검표 route의 최상위 ImagePicker import가 native module lookup을 발생시킨 종료가 실제 원인이다.

| 항목 | code 38 기준 | code 39 후보 |
|---|---|---|
| `expo-image-picker` | 16.0.6 | 17.0.11 |
| `expo-location` | 18.0.10 | 19.0.8 |
| `expo-task-manager` | 13.0.0 | 14.0.9 |
| Android resolve `modules` | `[]` | `expo.modules.imagepicker.ImagePickerModule` |
| 생성 `ExpoModulesPackageList` | ImagePicker 없음 | `ImagePickerModule.class` 포함 |

## 변경 범위

`package.json`과 `pnpm-lock.yaml`은 Expo SDK 54 호환 native modules로 정렬했다. `app.config.ts`의 기존 `expo-image-picker` plugin은 보존했으며, version `1.1.39` / Android `versionCode` 39 / iOS `buildNumber` 39로 올렸다. `app/work-report.tsx`는 최상위 ImagePicker import를 사진 action 시점의 dynamic import로 전환했다. 네이티브 module이 다시 누락되는 경우에도 점검표 route 전체를 종료시키지 않고, 사진 기능 오류만 안내한다. 카메라·앨범 실행 오류도 각각 처리한다.

## 기기 없는 검증 결과

| 검증 | 결과 |
|---|---|
| `expo-modules-autolinking resolve --platform android` | ImagePickerModule 포함 |
| `generate-package-list --platform android` | `ImagePickerModule.class` 포함 |
| ImagePicker 화면 계약 | 8 PASS |
| 기존 review workflow 화면 계약 | 7 PASS |
| isolated review API | 6 PASS |
| server bundle | PASS |
| `expo install --check` | 전체 프로젝트의 기존 비대상 의존성 경고로 exit 1, 대상 3개 경고는 없음 |

Android 실기기에서 전체 목록·점검표 진입과 카메라·앨범·취소는 아직 미검증이다. code 39 native APK를 기존 package·remote signing key로 만든 뒤 검증해야 하며, 운영 게시·홈페이지 견적·공용 단가·운영 고객 데이터·실제 SMS·TestFlight 제출은 보류한다.
