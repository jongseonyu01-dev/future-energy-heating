# v1.1.41 기사 자동견적 구성·단독보수 보완 검증

> 기준 source checkpoint는 `268bd7b0`(code 40 artifact evidence)이며, 이 문서는 code 41 후보의 소스·합성 검수 API 검증 결과다. **운영 게시, 운영 홈페이지 견적, 공용 단가 DB 쓰기, 운영 고객 데이터, 실제 SMS 발송은 수행하지 않았다.**

## 변경 목적과 범위

| 요구 | 구현 범위 | 보존한 동작 |
|---|---|---|
| 분배기·각방 구성 선택 | 기존 견적 버튼과 `toggleDirectItem` 선택 흐름을 재사용해 제어기·조절기 V타입·와이파이형 제어기·단자함을 독립 선택 | 기존 와이파이형/V타입 독립 선택, 다른 품목 선택 방식 |
| 단독보수 선택 | 단자함, 라인보수 20A, 라인보수 25A를 기존 빠른 선택 버튼 군에 추가 | 공급측만 단독보수의 120,000원 고정 승인 분기 |
| 가격 | 활성 가격 목록에서 정확한 품목명만 찾고 표준가/단체가 정수 원화 검증 후 추가 | 가격 미등록·0원·비정수이면 추가 차단하는 fail-closed 정책 |

## 승인 단가 read-only 대조 결과

공용 `price_items`는 읽기 전용으로만 대조했다. code 41 review API는 아래 승인 단가 snapshot을 합성 fixture로만 제공하며, 운영 DB에 연결하거나 값을 기록하지 않는다.

| 품목 | 표준가 | 단체가 | review fixture id |
|---|---:|---:|---:|
| 단자함 | 38,000원 | 30,000원 | 60009 |
| 라인보수 20A | 166,000원 | 143,000원 | 60010 |
| 라인보수 25A | 203,000원 | 194,000원 | 60011 |
| 공급측만 단독보수 | 120,000원 | 120,000원 | 앱 전용 고정 승인 분기 |

## 검증 결과

| 구분 | 결과 | 증거 |
|---|---|---|
| 합성 preview 실제 HTTP | 통과 | `review-preview-http.log`: 인증 전 401, 본인 접수 810001, 동의 readback, 점검표 200, 타 기사 403, 합성 SMS 대체, 세 승인 단가 snapshot 확인 |
| 자동견적·초안 | 통과 | `tech-estimate-engine.test.ts`, `tech-estimate-actor-scope.test.ts` Vitest 실행 로그 |
| 구성 선택 화면 계약 | 통과 | `tech-estimate-composition-items-contract.verify.mjs` |
| code 40 수량 UI·ImagePicker 회귀 | 통과 | 수량 UI/geometry, ImagePicker, review workflow, screen scope 계약 로그 |
| 서버 bundle | 통과 | `pnpm build` |
| Expo 공개 설정 | 통과 | Android `com.futureenergy.heatingcare`, versionCode 41, iOS build 41, `expo-image-picker` plugin 확인 |

## Android review APK artifact

| 항목 | 확인 결과 |
|---|---|
| EAS build | `57fa4b32-42a8-4d1f-80e3-438f402faaa3` (`FINISHED`) |
| source checkpoint | `d1f59b3c` |
| package / version | `com.futureenergy.heatingcare` / `1.1.41` / versionCode `41` |
| APK SHA-256 | `665db46644c7f6326cc06c5a353344d5a18168af559f39f1f174d3ba5b8894ad` |
| v2 signing certificate SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |
| native registration | APK DEX에서 `ImagePickerModule`, `ExpoModulesPackageList` 문자열 확인 |
| review boundary | 새 단일 preview `futureenergytech-mcdhzapb2-futureenergytech.vercel.app`만 APK asset에서 확인; 이전 review URL과 bypass marker는 0건 |

원본 APK와 APK-only ZIP의 SHA-256은 `SHA256SUMS.txt`에 기록했고, 각각 압축 무결성 검사를 통과했다.

전체 `tsc --noEmit`은 기존 `server/routers.ts` 및 과거 테스트의 88개 오류가 남아 있어 이 후보의 통과 근거로 사용하지 않았다.

## 미실시

code 41 Android APK의 실기기 설치, 버튼 탭, 수량·합계·초안 재열기, 카메라/앨범 사진 첨부, 목록·점검표 종료 재검증은 아직 수행하지 않았다. 따라서 Android 실기기 정상 완료나 code 38 종료 해결을 주장하지 않는다.
