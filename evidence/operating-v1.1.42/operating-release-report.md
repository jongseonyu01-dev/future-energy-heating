# 운영 기사앱 Android v1.1.42 배포 검증 결과

**확인 시각:** 2026-09-14 (KST)  
**대상:** 기사앱 Android 운영 APK 및 홈페이지 다운로드 연결  
**제외 범위:** 홈페이지 견적·공용 단가·운영 고객 데이터·SMS·iOS/TestFlight

## 배포 대상

| 항목 | 결과 |
|---|---|
| package | `com.futureenergy.heatingcare` |
| version / versionCode | `1.1.42` / `42` |
| APK SHA-256 | `5cb1a2cf1274f450d923977a46ec0c7bbd9ba264b176e00f05731e331670b086` |
| APK 크기 | `94,025,225` bytes (`89.7 MB` 표기) |
| v2 signing certificate SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |
| EAS source checkpoint / source SHA | `7c0ee02d` / `7c0ee02de77e5d2150ce730ab75f634c96744710` |
| API profile | EAS `production`; review mode·review preview·bypass 변수 미주입 |

## release 및 metadata

서버의 94 MB multipart upload는 write timeout으로 끝나 release metadata를 갱신하지 못했다. 이를 해결하기 위해 기존 공식 resolver가 지원하는 immutable GitHub release 경로에 동일한 APK를 등록했다. release body는 resolver가 요구하는 schema, app ID, version, SHA-256, source SHA, 크기를 포함한다.

| 항목 | 결과 |
|---|---|
| GitHub tag | `android-v1.1.42-42` |
| immutable APK asset | `https://github.com/jongseonyu01-dev/future-energy-heating/releases/download/android-v1.1.42-42/future-energy-heating.apk` |
| 공식 latest API | `/api/mobile-app/latest?fresh=1` → `source: github-release`, code `42` |
| 공식 고정 다운로드 | `/download/driver/latest` → GitHub immutable asset으로 HTTP `302` |
| 이전 release | code 32·31·30·29·28·27·26이 release 목록에서 보존됨 |

## 홈페이지 연결

운영 홈페이지 repository `main`에는 기사용 다운로드 연결과 Android 업데이트 안내만 반영했다.

| 항목 | 결과 |
|---|---|
| source commit | `a8e3b359a99485cab7134cfed609fed4331dd07b` |
| deployment retry commit | `6759a877e03918ea3dccac114db862543999cb42` |
| production deployment | `dpl_A7uazzMAPAFuYpJc9bvBwQv4Leec` (`READY`) |
| PC 상단 메뉴 | `기사용 앱 다운로드` → `/app/driver-download` |
| 모바일 메뉴 | `📱 기사용 앱 다운로드` → `/app/driver-download` |
| 다운로드 안내 | v1.1.42, 89.7 MB, 2026. 9. 14., “기존 기사앱을 삭제하지 않고 … 업데이트하세요.” 표시 |

## end-to-end 대조

고정 주소를 실제로 따라 받은 APK를 검사했다. package, versionName, versionCode, v2 certificate 및 SHA-256이 모두 배포 대상으로 일치했다. 홈페이지 메인과 설치 페이지도 공식 도메인에서 읽기 전용으로 확인했다.

> Android 실기기에서 code 42의 화면 동작을 시험한 결과는 이 배포 검증에 포함하지 않는다. APK 파일과 홈페이지 다운로드 연결의 무결성만 확인했다.

## 변경하지 않은 범위

홈페이지 견적 작성·계산·단가, 공용 가격 DB, 고객 데이터, SMS 발송 및 iOS/TestFlight에는 요청·저장·배포 변경을 수행하지 않았다.
