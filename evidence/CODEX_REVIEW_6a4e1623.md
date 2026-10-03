# 기사앱 자동견적 Codex 재검수 자료

## 범위와 기준

이 자료의 모바일 후보 기준은 checkpoint **`6a4e1623`**이며, 비교 기준은 사용자 지시 시점의 **`d52f8869`**이다. 운영 홈페이지의 견적서·공용 단가 DB·운영 고객 견적·운영 문자·TestFlight 제출은 이 후보에서 변경하거나 실행하지 않았다. 실제 홈페이지에는 별도 운영 저장소의 `public/web/download.html`에서 iPhone 안내 문구만 반영했으며, Android 고정 링크 `/download/driver/latest`는 유지했다.

| 구분 | 기준 |
|---|---|
| 모바일 후보 checkpoint | `6a4e162398686da073737c2b94ffc9630af7979c` |
| 비교 checkpoint | `d52f8869` |
| review API | `https://futureenergytech-bnsrgrrvs-futureenergytech.vercel.app` |
| preview 공개 예외 | 위 review URL 한 건만 등록; 기존 review URL은 재보호 |
| Vercel 기본 보호 | Standard Protection 유지 |
| 운영 게시·TestFlight 제출 | 실행하지 않음 |

## Codex 지적 보완 결과

| 지적 | 실제 보완 | 재현 근거 |
|---|---|---|
| 유량밸브 29,000원 상수 | `addAllRoomFlowValve`와 `selectManifold`가 활성 유량밸브의 `discPrice`만 사용하도록 변경했다. 0원·미등록·비정수 가격은 품목 추가 전에 차단한다. 스트레이너 기본 정책은 변경하지 않았다. | 엔진 회귀: active discount 적용·0원/누락 차단 PASS |
| 온도조절기 중복 | 제어기 선택과 각방 디지털·아날로그 조절기 수량을 분리했다. Wi‑Fi/V타입 선택은 각방 조절기 수량을 새로 더하지 않는다. | 디지털/아날로그 교체, 구수 변경, Wi‑Fi/V타입 조합 PASS |
| 검수 기사·접수 고정 | `90000001` 고정을 제거했다. 인증 기사별 합성 배정 접수는 `810001`·`810002`로 분리되고, 초안·고객·보고는 로그인 actor와 배정 접수로 범위가 제한된다. | 실제 preview HTTP: 본인 200, 타 기사 제출 400, 타 기사 목록 0건 |
| 실제 저장 상태 | 저장 상태를 schema 허용 `pending`으로 통일했다. SQLite 격리 DB에서 실제 server router의 저장→본인 조회를 확인했다. | actual server isolated verification 4 PASS |
| 승인 권한 | `approveTechRequest`가 익명·기사·다른 지사를 notification 이전에 차단한다. 본사와 담당 지사 승인 경로는 유지한다. | actual server isolated verification 4 PASS |
| iPhone 안내·Android 링크 | 실제 운영 다운로드 페이지의 Android `/download/driver/latest` 링크를 유지하고, iPhone 카드의 준비 문구만 변경했다. | 운영 URL과 별도 운영 저장소 diff 확인 |

## 검증 결과

| 검증 | 결과 | 로그 |
|---|---:|---|
| 견적 엔진·review fixture·preview API Vitest | 20 PASS | `logs/codex-fix-regression-20260912.log` |
| 기사 견적 서버 fail-closed | 8 PASS | `logs/codex-fix-regression-20260912.log` |
| 실제 server router SQLite 격리 저장·본인 조회·승인 권한 | 4 PASS | `logs/codex-fix-regression-20260912.log` |
| 공개 review preview HTTP | 미로그인 401, 로그인 200, 본인 저장 200, 타 기사 제출 400, 타 기사 목록 0, `smsSubstituted=true` | `logs/codex-fix-regression-20260912.log` |
| server esbuild | PASS | `logs/codex-fix-regression-20260912.log` |
| Android Expo export | PASS | `logs/codex-review-android-export-20260912.log` |

> 프로젝트의 전체 `tsc --noEmit`에는 이 후보 이전부터 있던 오류가 남아 있다. 이 제출은 새 후보가 추가한 오류 0건을 주장하지 않으며, 변경 범위의 `git diff --check`, focused 회귀, server esbuild, Android Expo export 결과로 구분한다.

## 검수 build

| 플랫폼 | build ID | profile | 버전 / build | artifact | SHA-256 |
|---|---|---|---|---|---|
| Android | `99092ddf-15d7-4cd7-bb95-35d9ed9a20d8` | `review` | 1.1.24 / 24 | `Wm-Dp0th0A3k7CRVyOB8Rh43mlm68nDu7w2h9l3vQDg.apk` | `79b4b1f28b9095ca43eb37b02b736183aa680440ab180b4e7263e950dea6c433` |
| iOS | `dc5814b7-98c5-44a1-b877-c4d20bf53a66` | `review-store` | 1.1.24 / 24 | `3hm3ozNUzldkdA4Ynp_DVgLTKtZNmVQqyR1NHl035As.ipa` | `33a8c48866f06b8eff50e49386efd6fb92e285d83bf77cd13b2e7dd3a2525671` |

두 build는 같은 Expo project, package/bundle ID `com.futureenergy.heatingcare`, checkpoint `6a4e1623`를 사용했다. review profile이 `EXPO_PUBLIC_API_BASE_URL`을 위 review API로 주입하며, 로그인·단가·접수·보고 요청은 이 주소의 `/api/trpc`로 향한다. source 내 운영 기본 URL literal은 review 환경 변수가 없을 때만 사용하는 운영 build fallback이며, review profile에서는 선택되지 않는다. 보호 우회 비밀값은 APK·IPA·source·profile에 넣지 않았다.

## 미실시·보류 사항

| 항목 | 상태 |
|---|---|
| Android 실기기 설치·로그인·초안 재열기·키보드/안전영역 | 미실시 |
| iPhone 실기기 설치 | 미실시; 검수 기기 없음 |
| TestFlight 제출·내부 테스터 배포 | 보류 |
| 운영 홈페이지 견적·공용 단가 DB 수정 | 미실시 |
| 운영 고객 견적·문자 발송 | 미실시 |
| review preview 예외 제거 | 검수 종료 후 실행 예정 |
