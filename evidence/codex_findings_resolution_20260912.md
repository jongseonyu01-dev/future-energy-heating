# 기사앱 견적 Codex 지적 보완 결과

> **기준 checkpoint:** `d17debf2`  
> **후보 branch:** `tech-estimate-parity-candidate-20260912`  
> **운영 게시·홈페이지 배포·공용 단가 DB 변경:** 미실행

## 1. 변경 증거 재생성 원칙

초기 검수 ZIP의 0바이트 patch와 불완전 변경 목록은 제출 오류였다. 이번 후보는 `d17debf2`부터 현재 작업트리까지의 실제 Git diff를 기준으로 다시 묶는다. `public/web/**` 정적 홈페이지 파일과 `drizzle/*.sql` migration은 변경하지 않는다. `tests/tech-estimate-homepage-boundary.verify.mjs d17debf2`가 이 두 조건을 재현한다.

공통 server 변경은 `estimates.techRequest`의 기사 보고 입력과 `listMyTechRequests`의 본인 이력 조회에 한정된다. 활성 단가 CRUD, 홈페이지 자동견적 화면, 공개 견적 renderer, 홈페이지 저장·출력·발송 procedure는 수정하지 않는다. Drizzle mapping에는 운영 DB에 이미 존재함을 read-only schema 조회로 확인한 `sourceType`·`techRequesterId` 등 기사 보고 열만 선언하며 migration은 생성·적용하지 않는다.

## 2. 홈페이지-기사앱 가격·선택 계약

| 영역 | 홈페이지 현재 계약 | 기사앱 후보 | 구형/유사명 처리 |
|---|---|---|---|
| 분배기 | 2~10구, 구수 변경 시 본체·자동품목을 단일 최신 구수로 교체 | 동일 | 이전 분배기 중복과 stale 선택 state 차단 |
| 분배기 스트레이너 | 시공 전용 고정 36,000원 | 동일 `distOnly` 가격 | 일반 스트레이너 단가와 합치지 않음 |
| 각방 유량밸브 15A | 분배기 시공 전용 고정 29,000원/구 | 동일, 표준가 모드여도 29,000원 | 독립 부분수리 15A 단가와 구분 |
| 독립 유량밸브 | 15A 58,000원·20A 65,000원·25A 94,000원(단체가) | 동일 현행 계약 항목 | 분배기 시공 전용 항목과 합치지 않음 |
| 메인밸브 | 분배기 시공 전용 20A 73,000원·25A 91,000원(단체가) | 동일 | 일반/독립 시공가와 구분 |
| 배관청소 | 평형별: 표준 `평×1,000+140,000`, 단체 `평×1,000+80,000` | 동일 | 구형 정액 배관청소 제외 |
| 제어기 | 활성 `제어기`와 와이파이형·V타입을 별도 품목 | 동일 | 구형 `제어기 교체` 48,000원은 부분수리 선택에서 제외; 활성 `제어기` 가격을 임의 치환하지 않음 |
| 온도조절기/구동기 | 디지털·아날로그·파라핀·모터 선택 시 현재 구수만큼 자동 수량 | 동일 | 이름 유사 품목을 통합하지 않음 |

단가 조회에 필요한 활성 품목 또는 선택 가격이 없으면 `QuotePriceError`로 선택을 유지하고 견적·초안을 만들지 않는다. 0원과 구형 fallback은 사용하지 않는다.

## 3. Codex 재현 지적과 보완

| Codex 지적 | 보완 | 재현 범위 |
|---|---|---|
| P01 분배기 전용 유량밸브 표준가 분기 | `overridePrice: 29000`, `distOnly: true`로 고정 | engine test |
| P02 단가 실패 후 구수 표시만 변경 | `runQuoteAction()` 성공 뒤에만 `setSelectedPort()` | engine/UI harness |
| P03 분배기 삭제 뒤 선택 잔존 | `clearManifoldSelection()`과 `setSelectedPort(null)` 동시 처리 | engine/UI harness |
| P04 기사·접수 전환 초안 혼입 | `technicianId:rawRequestId` scoped key, 복원 requestId 일치 확인 | UI harness |
| P05 Infinity 수량 | 1 이상 정수 외 `setLineQuantity()`·`validateDraft()` 차단 | engine test |
| P06/P07 0원·JSON·합계 불일치 저장 | router Zod + line subtotal + total 검증이 `createEstimate()` 앞에서 거부 | route harness, 실패 write/SMS 0회 |
| P08 requestId null | app은 숫자 requestId 없으면 보고 불가, server는 positive requestId·배정·고객 일치 확인 | route harness |

첨부 Codex 원본 `review.mjs`는 기존 requestId optional contract 및 `db.getRepairRequestById` mock 부재를 전제로 한다. 강화된 후보에는 `tests/tech-estimate-server-failclosed.verify.mjs`를 추가해 동일 실패 입력에 **requestId와 repair request mock을 포함한 현재 contract**로 재현한다. 원본 harness의 이 구형 mock 차이는 PASS로 은폐하지 않으며, 원본 replay log와 새 harness log를 함께 제공한다.

## 4. 플랫폼 검수 경계

`pnpm build` 및 `pnpm exec expo export --platform all`은 성공했다. Android/iOS bundle 포함은 확인했지만, APK/IPA는 아직 만들지 않았고 iOS Simulator·실제 iPhone·실제 Android 기기 시험도 미실시다. 따라서 키보드·safe area·home indicator·native 설치·초안 재열기·보고 이력 실제 기기 검증은 미완료다.

## 5. 검수용 build·설치 준비

`eas.json`의 기존 profile은 다음과 같다.

| 플랫폼 | 검수 profile | 산출물/설치 경로 | 현재 상태 |
|---|---|---|---|
| Android | `preview` | internal APK; 기존 Android 기기에 다운로드·설치 | CLI 미설치, build 미실행 |
| iPhone | `preview` | internal iOS build; 기존 Apple 팀의 등록 기기 install link 또는 TestFlight 경로 | CLI 미설치, build 미실행 |

기존 계정으로 검수 build를 만들 때만 다음을 실행한다. 이 명령은 homepage deployment가 아니라 현재 Expo/EAS mobile project의 internal build를 만든다.

```text
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

실제 실행 전 기존 Expo 계정 로그인·등록 기기·build quota를 확인해야 한다. 앱스토어/Play Store 공개 제출 및 관리 화면의 게시 버튼은 이 검수 build 명령에 포함되지 않는다.
