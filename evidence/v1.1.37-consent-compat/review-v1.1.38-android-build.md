# v1.1.38 / code 38 Android review build

| 항목 | 검증 결과 |
|---|---|
| Source checkpoint | `97df89c7` |
| EAS Android build ID | `f0ed9fa7-8e8c-40a1-a391-acf64d2bc5c0` |
| EAS profile | `review` / internal APK |
| 완료 상태 | `FINISHED` |
| package | `com.futureenergy.heatingcare` |
| versionName / versionCode | `1.1.38` / `38` |
| 기존 서명 인증서 | v2 certificate SHA-256 `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` 일치 |
| APK SHA-256 | `20be98a8cf3211d691424ff13f1a224e0a56d1f116eba2e8ee6e5ac596750eb5` |
| APK-only ZIP SHA-256 | `1ed40c1fcad858c865d6fb86fdf4aaf0e7adad5c5fcf3691b4e72454686f20ee` |
| review API 주입 | APK `assets/index.android.bundle`에서 `https://futureenergytech-2dhinw2q6-futureenergytech.vercel.app` 확인 |

이 artifact는 기존 Android package와 EAS 원격 keystore를 재사용해 v1.1.37/code 37 설치본 위에 업데이트할 수 있도록 code 38을 사용한다. review profile에는 보호 우회 secret/header를 넣지 않았다.

운영 홈페이지 견적·공용 단가·운영 고객 data·실제 SMS·운영 게시·TestFlight 제출은 변경/실행하지 않았다. Android 실기기 강제 종료 해결, 목록·이월·출발·점검표·견적·초안 재열기 영상과 logcat은 아직 미실시다.
