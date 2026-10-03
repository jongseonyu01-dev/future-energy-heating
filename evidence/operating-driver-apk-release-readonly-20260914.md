# 운영 기사앱 APK 배포 사전 점검 — 2026-09-14 KST

> 이 문서는 운영 APK 업로드나 홈페이지 배포 전에 수행한 **read-only 확인 결과**다. 확인 단계에서 운영 홈페이지 견적·단가·고객 데이터·SMS 및 운영 release는 변경하지 않았다.

## 외부 운영 경로 확인

| 항목 | read-only 확인 결과 |
|---|---|
| 공식 메인 | `https://퓨처에너지테크.kr/`의 데스크톱 헤더와 모바일 메뉴에 `기사앱 다운로드`가 있으며 `/app/driver-download`으로 연결됨 |
| 메인 설치 영역 | 설치 화면 `/app/driver-download`과 고정 Android 링크 `/download/driver/latest`을 이미 함께 제공함 |
| 기존 다운로드 페이지 | `/web/download.html`은 `/api/mobile-app/latest`에서 version·파일 크기·배포일·notes를 읽고 다운로드 버튼을 `/download/driver/latest`으로 연결함 |
| 현재 고정 다운로드 | `https://퓨처에너지테크.kr/download/driver/latest`는 HTTP 302으로 `android-v1.1.21-32` GitHub release asset에 연결됨 |
| 현재 운영 Android release | version `1.1.21`, code `32`, SHA-256 `51eb38ca56941980eb8aef5dd9c911215addf3d03952854844137c92f219af14`, publishedAt `2026-09-03T13:33:56.000Z` |

## 운영·검수 APK 분리

| 대상 | API base URL 결정 | 현재 상태 |
|---|---|---|
| `review` / `review-store` EAS profile | `EXPO_PUBLIC_API_BASE_URL=https://futureenergytech-mcdhzapb2-futureenergytech.vercel.app` 및 review mode 주입 | 합성 API 전용. 운영 다운로드에 사용할 수 없음 |
| `production-apk` EAS profile | production 환경에 등록된 공식 `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_API_URL` 사용 | 운영 API 연결 APK candidate를 만들 때만 사용 |

## 운영 고정 링크의 진실 원본

운영 홈페이지 server route는 `android-v<version>-<code>` GitHub release tag, release body metadata, `future-energy-heating.apk` asset의 size·SHA-256·HTTPS path를 상호 검증한다. `/download/driver/latest`는 이 검증을 통과한 GitHub release asset으로만 302 redirect한다. 따라서 새 운영 APK 반영은 다음 순서가 필요하다.

1. `production-apk` profile에서 review 환경 변수를 넣지 않은 APK를 build한다.
2. package·versionCode·기존 signing certificate·SHA-256과 APK 내 운영 URL을 검증한다.
3. 검증된 APK만 `android-v<version>-<code>` 공개 GitHub release와 required metadata로 등록한다.
4. 운영 홈페이지 배포 후 `/api/mobile-app/latest`과 `/download/driver/latest` 및 실제 다운로드 파일을 대조한다.

위 3·4단계는 외부 공개 release·운영 홈페이지 배포를 발생시키므로, 이 기록만으로 실행하지 않는다. 사장님의 최신 지시로 APK 업로드와 홈페이지 다운로드 연결 완료가 요청되었으나, 현재 source의 code 41은 review profile build였으므로 production build를 새로 만들고 검증한 뒤에만 대상 파일을 확정한다.

## code 42 production APK candidate 공개 설정

production 환경의 공식 API 공개 환경값으로 Expo public config를 해석했다. 결과는 Android package `com.futureenergy.heatingcare`, version `1.1.42`, versionCode `42`, iOS bundle ID `com.futureenergy.heatingcare`, iOS build `42`였으며 review mode는 없었다. production 환경에서 review preview URL과 protection bypass 변수는 발견되지 않았다. 이 단계는 source config 검증만 수행했으며 APK build·upload·운영 release 등록은 아직 수행하지 않았다.

## 출처

- 공식 메인: <https://퓨처에너지테크.kr/>
- 공식 설치 화면: <https://퓨처에너지테크.kr/app/driver-download>
- 공식 다운로드 페이지: <https://퓨처에너지테크.kr/web/download.html>
- 현재 release API: <https://퓨처에너지테크.kr/api/mobile-app/latest>
- 현재 고정 링크: <https://퓨처에너지테크.kr/download/driver/latest>
