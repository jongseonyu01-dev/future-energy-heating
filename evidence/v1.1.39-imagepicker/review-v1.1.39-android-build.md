# v1.1.39 / code 39 Android ImagePicker review build

| 항목 | 결과 |
|---|---|
| source checkpoint | `85bd98be` |
| EAS Android build ID | `a575e0d0-cbd5-4cf4-b160-2728026063ba` |
| EAS profile / status | `review` / `FINISHED` |
| package | `com.futureenergy.heatingcare` |
| versionName / versionCode | `1.1.39` / `39` |
| Android v2 certificate SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` — code 38과 동일 |
| APK SHA-256 | `7de7489a1dc9e84e470a2ba5f9a40ad9429cda8b94ab423f5717f68bd52cfdd2` |
| auto-generated package list | `expo.modules.imagepicker.ImagePickerModule.class` 포함 |
| APK DEX | `ImagePickerModule` 문자열 39개, `ExpoModulesPackageList` 문자열 4개 확인 |
| Android JS bundle | `ExponentImagePicker` / `expo-image-picker` 참조 확인 |
| review API | `https://futureenergytech-2dhinw2q6-futureenergytech.vercel.app` 주입 확인 |

이 APK는 code 38 설치본 위에 update 가능한 versionCode 39를 사용한다. 새 Android keystore·package·EAS project를 만들지 않았고, bypass secret도 주입하지 않았다.

## 실기기 미검증

현재 sandbox에는 Android 기기가 연결되지 않아 다음은 아직 확인하지 않았다: `REVIEW-810001` 전체 목록 표시, 미작업·이월, 출발, 점검표 route, 카메라/앨범 열기와 취소, 견적 작성, 초안 재열기. 따라서 `ImagePickerModule` 등록과 artifact 검증은 완료했지만 실제 종료 해결은 미확정이다.

운영 게시·홈페이지 견적·공용 단가·운영 고객 데이터·실제 고객 문자·TestFlight 제출은 이 build에서 변경 또는 실행하지 않았다.
