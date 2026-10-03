# code46 운영 APK 전달 전 재검증 — 2026-09-16

## API 연결

최종 APK의 Hermes bytecode를 해석했다. 공식 운영 API 주소 `https://www.xn--h50b270bp0ceuddugnobx2m.kr`가 포함됐으며, `futureenergytech-…vercel.app` review preview 주소와 `TECH_ESTIMATE_REVIEW_MODE`·`TECH_REVENUE_REVIEW_MODE` 문자열은 포함되지 않았다.

`eas.json`의 `production-apk` profile은 `environment: production`만 사용하며 review profile의 격리 API와 review mode 환경변수를 상속하지 않는다. 따라서 전달 대상 code46은 재보호된 preview fixture가 아닌 기존 운영 API를 대상으로 한다.

## APK 무결성

| 항목 | 확인값 |
| --- | --- |
| 패키지 | `com.futureenergy.heatingcare` |
| 버전 | `1.1.46` / versionCode `46` |
| SHA-256 | `a9f2c7c64696f03e3614cc9b95df026a96e8e43e40bb64ae580b0e0de2f125e4` |
| 정렬 | Android Build Tools 36 `zipalign -c -P 16 -v 4`: successful |
| 전자서명 | APK Signature Scheme v2/v3: true |
| 인증서 SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |
| code45 인증서 비교 | 동일 |

공식 `/download/driver/latest`는 사용자 설치·화면 확인 전까지 기존 code45를 유지한다. 실제 Android 설치와 화면 검증은 아직 미확인이다.
