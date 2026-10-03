# iOS 검수 Build·TestFlight 제출 전 준비 상태

## 범위와 보류 상태

이 기록은 운영 홈페이지 견적·공용 단가 DB·기존 Android 다운로드를 변경하지 않은 검수 후보의 상태다. iPhone 검수 기기가 없어 UDID 등록·Ad Hoc profile 생성·실기기 설치는 수행하지 않았다. 두 iOS IPA는 **EAS build artifact**이며, App Store Connect 업로드와 TestFlight 제출·외부/내부 테스터 배포는 수행하지 않았다.

| 구분 | 결과 | 버전 / 빌드 번호 | 기준 source | API 연결 | 설치 가능 여부 |
|---|---|---:|---|---|---|
| Android review APK | FINISHED | 1.1.23 / versionCode 23 | checkpoint `e8ebcf13` | 인증 보완 review preview | APK 직접 설치 가능, 실기기 시험 미실시 |
| iOS review-store IPA | FINISHED | 1.1.23 / buildNumber 23 | checkpoint `e8ebcf13` | 인증 보완 review preview | TestFlight 미제출이므로 iPhone 설치 불가 |
| 기존 TestFlight용 iOS IPA | FINISHED | 1.1.8 / buildNumber 8 | checkpoint `9941dbf8` | 당시 운영 기본 API | TestFlight 미제출, 설치·실기기 시험 미실시 |

## 새 iOS 검수 build

| 항목 | 값 |
|---|---|
| EAS build ID | `ada9f68b-b0d0-4bba-a2ee-43d8617436f1` |
| EAS profile / distribution | `review-store` / `STORE` |
| 기존 Expo project | `@futureenergytech/future-energy-heating` (`d2a96663-3c56-4836-ab5a-1ce95421962c`) |
| Bundle ID | `com.futureenergy.heatingcare` |
| Apple team | `83MU3C8JZN` |
| 기존 signing 자산 | active App Store provisioning profile와 기존 distribution certificate 재사용 |
| review API | `https://futureenergytech-wlvr2pr81-futureenergytech.vercel.app` |
| 환경 주입 | `EXPO_PUBLIC_TECH_ESTIMATE_REVIEW_MODE=1`, `EXPO_PUBLIC_API_BASE_URL=<review API>` |
| IPA artifact | https://expo.dev/artifacts/eas/JH2FJo-NbwAWON6UZPwIsPFGOB8oHsgn_II2tBkR6po.ipa |
| IPA SHA-256 | `71fd9017b8a8c9d7a10eed214ed6003ee374844fd7c68579f648f5152f3e49c8` |
| App Store Connect / TestFlight 제출 | **미실행·보류** |

## Android 검수 APK

| 항목 | 값 |
|---|---|
| EAS build ID | `2ef29c96-193e-4413-a584-77cdf0ad60db` |
| EAS profile / distribution | `review` / `INTERNAL` |
| Package | `com.futureenergy.heatingcare` |
| APK artifact | https://expo.dev/artifacts/eas/tZ-skLSy-BjyP5goxBIQwK-VToyS0rR1-D_QIT8o4js.apk |
| APK SHA-256 | `175040c32a139ea601daba63369c66bfb79a62bedcbdb9932f04e98282195a75` |
| 실기기 설치·로그인·초안 시험 | **미실시** |

## 기존 TestFlight용 build의 최종 상태

| 항목 | 값 |
|---|---|
| EAS build ID | `e5d234ba-3d50-4807-9d3b-5765e59772cd` |
| 상태 / 배포 형식 | FINISHED / STORE |
| profile | `testflight` |
| version / buildNumber | 1.1.8 / 8 |
| source checkpoint | `9941dbf8` |
| API 연결 | 당시 `constants/oauth.ts`의 운영 기본 API `https://www.xn--h50b270bp0ceuddugnobx2m.kr` |
| TestFlight 제출 상태 | **미실행·보류** |

## 격리·권한 확인

새 review-store build는 profile에서 인증 보완 preview API를 명시적으로 주입한다. profile에는 Vercel 보호 우회 비밀값·토큰·비밀번호가 없다. 해당 API는 합성 단가·합성 기사·합성 접수·메모리 검토내역·문자대체 상태만 사용하며, 검증에서 미로그인 요청 차단, 본인 합성 접수 처리, 타 기사 자료 접근 차단을 확인했다. 운영 DB와 문자 provider에는 연결하지 않는다.

## 설치 링크 구분

| 종류 | 링크 / 상태 |
|---|---|
| Android 설치 링크 | 위 Android APK artifact URL — 설치 전 기존 운영 앱과 package/versionCode 호환 여부를 실제 기기에서 확인 필요 |
| iOS EAS artifact | 위 iOS IPA artifact URL — **TestFlight 설치 링크가 아니며**, 미제출 상태에서는 일반 iPhone에 설치할 수 없음 |
| iOS TestFlight 설치 링크 | **없음** — App Store Connect upload 및 TestFlight 제출이 보류되어 생성하지 않음 |

## 홈페이지 다운로드 페이지 확인

`public/web/download.html`의 iPhone 카드에 다음 문구만 반영했다.

> 아이폰 앱은 현재 준비 중입니다. 설치가 가능해지면 이 페이지에서 안내해 드리겠습니다.

동일 페이지의 Android APK 버튼·다운로드 함수는 변경하지 않았고, 홈페이지 견적·단가 파일은 이번 checkpoint 대비 변경하지 않았다. 실제 preview 화면은 `ios-preparing-download-page-20260912.png`에 보관했다.

Prettier의 HTML format 경고는 기준 checkpoint `e8ebcf13`의 동일 원본에서도 재현됐다. 따라서 이번에는 요청 범위를 벗어나는 전체 HTML 재포맷을 수행하지 않았다.
