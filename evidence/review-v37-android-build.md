# Android Review Build v1.1.37 / code 37

| 항목 | 검증 결과 |
|---|---|
| EAS build ID | `294a6cc6-ffff-4d90-a2bf-35fca478e89a` |
| 상태 | `FINISHED` |
| build profile | `review` (`INTERNAL`, APK) |
| source checkpoint | `6daf599f` |
| 앱 package | `com.futureenergy.heatingcare` |
| versionName / versionCode | `1.1.37` / `37` |
| 주입 review API | `https://futureenergytech-4tlv7asl8-futureenergytech.vercel.app` |
| APK SHA-256 | `d39a36a71180114021439e4a723c74e3ddfad89cc6fe95b0b01d580fbbcc28a4` |
| APK-only ZIP SHA-256 | `2dfb63f57b4576910fed0bf53a134ece1025ec1e7927663d5773325bbe697a5e` |
| Android signing | v2 signature present; certificate SHA-256 `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` (기존 review APK과 동일) |
| archive integrity | raw APK 및 APK-only ZIP 모두 `unzip -t` 통과 |

`assets/index.android.bundle`에서 새 review API URL을 실제로 추출했다. `eas.json`의 review/review-store profile에는 보호 우회 secret 또는 기존 preview URL이 포함되지 않는다.

> 이 결과는 artifact·bundle·서명 검증 결과다. 실기기에서의 전체 목록, 이월 작업, 출발, 점검표, 견적 작성, 초안 재열기와 Android 오류 로그/영상은 아직 미실시이며 이 문서가 그 성공을 주장하지 않는다.
