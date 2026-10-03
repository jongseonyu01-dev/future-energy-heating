# v1.1.40 / code 40 Android Review APK — 수량 UI 보완 증빙

## 변경 목적과 범위

code 39의 `ImagePickerModule` 등록 보완은 유지한 채 `app/tech-estimate.tsx`의 견적 항목 수량 제어만 최소 변경했다. 수량 입력은 **64pt × 48pt**(최소 60pt × 48pt), 숫자는 **18pt / weight 800**으로 조정했다. Android에서 글자가 위아래로 치우치지 않도록 `paddingVertical: 0`, `includeFontPadding: false`, `textAlign: "center"`, `textAlignVertical: "center"`를 적용했다. ± 버튼은 **48pt × 48pt**, 기호는 **22pt / weight 900**으로 확대했다. `maxFontSizeMultiplier={1.3}` 및 line-height 여유를 적용해 130% 확대 검증 대상 `1`, `2`, `3`, `7`, `10`이 컨트롤을 넘지 않도록 했다.

견적 엔진의 수량 변경, actor/request scoped 초안 저장·재열기, code 39의 사진 선택 지연 로드와 오류 안내는 변경하지 않았다. 운영 홈페이지 견적, 공용 단가 DB, 운영 고객 데이터, 실제 SMS와 운영 게시도 변경하지 않았다.

## Build 식별 및 native 등록

| 항목 | 확인값 |
|---|---|
| EAS Android review build | `dd8acff2-b1d5-44c3-8b16-22d14b042b0c` |
| APK version / versionCode | `1.1.40` / `40` |
| package | `com.futureenergy.heatingcare` |
| source checkpoint | `ea3f22e6` |
| APK SHA-256 | `9f52cea343034655a808238fd36717f1da4db350e55cc1678d6db3f03ccd34c5` |
| v2 signing certificate SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |
| ImagePicker native auto-registration | generated `ExpoModulesPackageList.java` line 38: `expo.modules.imagepicker.ImagePickerModule.class` |
| APK DEX module descriptor | `classes3.dex`: `Lexpo/modules/imagepicker/ImagePickerModule;` |
| review API | 기존 단일 합성 review preview profile 유지; bypass secret 미주입 |

## 검증 결과

| 검증 | 결과 | 한계 |
|---|---|---|
| 수량 UI source 계약 | PASS | React Native style/source 검사 |
| 수량 1·2·3·7·10, 130% 기하 검증 | PASS | 실제 시스템 폰트 렌더는 아님 |
| 수량 엔진·actor scoped 초안 | PASS — Vitest 25 | 실제 기기 입력·재열기 미실시 |
| ImagePicker 화면 계약 | PASS — 8 | 실제 카메라/앨범 실행 미실시 |
| Android Expo export | PASS | native APK 실행 검증 아님 |
| `ImagePickerModule` 자동 등록·DEX | PASS | native bundle inclusion 확인 |
| Android 실기기 검증 화면 | **미실시** | code 40 업데이트 설치 후 캡처 필요 |

> 이 문서의 PASS는 source·build artifact 검증 결과이며, 숫자가 실제 Android 기기에서 선명하게 보이는지와 전체 목록·점검표·사진 첨부의 종료 해결 여부는 아직 완료로 표시하지 않는다.

## References

[1]: https://reactnative.dev/docs/text-style-props "React Native Text Style Props — Android includeFontPadding 및 textAlignVertical"
