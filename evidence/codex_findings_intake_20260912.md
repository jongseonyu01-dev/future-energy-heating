# Codex 견적 후보 지적 접수 기록 — 2026-09-12

## 기준

- Codex 검수 ZIP: `FET_Tech_Estimate_Codex_Findings_20260912.zip`
- ZIP SHA-256: `0c72a51b8a305ecd8151d8154f5128198d14f57341f390ac96007520108d5c5d`
- Codex가 재확인한 기존 검수 ZIP: `f6c6dd00bdcc172486b3e7d74d91f992e3d681e29d26a31e0e683e76d0190565`
- 기준 checkpoint: `d17debf2`
- 운영 게시·홈페이지 `public/web/**`·공용 단가 DB·실제 고객 견적·발송은 이번 보완 범위에서 변경하지 않는다.

## Codex 재현 결과

Codex의 격리 재현은 실제 앱/DB/SMS/홈페이지를 실행하지 않았다. React/native UI, storage, 인증, DB, SMS 경계를 mock한 상태에서 견적 엔진·화면·server procedure를 실행했다. 제공된 11개 기존 시험은 통과했으나 추가 재현 12건 중 8건이 요구 동작과 달랐다.

| ID | 재현된 보완 대상 |
|---|---|
| P01 | 분배기 동시 시공 전용 유량밸브는 전역 표준/단체 모드와 무관하게 전용 할인 단가를 사용해야 한다. |
| P02 | 가격 부족 등 구수 변경 실패 시 기존 분배기 품목과 선택 상태를 함께 유지해야 한다. |
| P03 | 분배기 본체 삭제 시 전용 선택 상태를 비우되 독립 시공 품목은 삭제하지 않아야 한다. |
| P04 | 기사 또는 접수가 바뀌면 이전 draft/form/비동기 응답이 남지 않아야 한다. |
| P05 | 수량은 저장 전 유한한 양의 정수로 검증해야 한다. |
| P06 | 0원 및 잘못된 항목 JSON은 DB 저장 전 거부해야 한다. |
| P07 | 제출 총액과 항목 snapshot 합계 불일치는 DB 저장 전 거부해야 한다. |
| P08 | 접수에서 시작한 보고는 requestId를 보존하고 서버가 본인 배정·접수 고객을 검증해야 한다. |

## 추가 구현·검증 요구

- 홈페이지의 각방 자동견적 선택(각방 전체/거실 1개/없음/직접 지정), 디지털·아날로그 온도조절기, 파라핀·모터 구동기 및 구수별 자동 수량을 홈페이지 읽기 전용 기준으로 반영한다.
- 서버 본인 이력 조회는 실제 Drizzle schema와 실행 SQL로 검증한다. 타입 단언만으로 존재하지 않는 열을 참조하지 않는다.
- 실패 입력은 DB write와 SMS 요청이 0회여야 한다.
- Android/iPhone 검수 build와 설치 경로는 internal preview, TestFlight store 경로, Expo export를 구분한다. 실제 기기 검증은 미실시 상태로 유지한다.
- 실제 기준 commit→후보 patch, 전체 변경 파일 목록, commit/tree/hash 및 홈페이지/공통 서버 영향 근거를 새로 제출한다.

## 구현 전 현재 후보 확인

- `createLine()`은 `distOnly` flag를 붙이지만 override가 없으면 전역 가격 mode로 단가를 고른다. 따라서 분배기 시공 전용 유량밸브에는 전용 할인 단가 override가 필요하다.
- 화면 `choosePort()`는 현재 견적 action의 성공 여부와 무관하게 선택 구수를 바꾼다. action 성공과 `selectedPort` 변경을 하나의 성공 경로로 묶어야 한다.
- 화면의 품목 삭제는 현재 `lines`만 수정한다. 분배기 본체가 마지막으로 사라질 때 `selectedPort` 및 전용 자동품목 상태를 함께 정리해야 한다.
- 현재 화면은 각방 전체 유량밸브 toggle과 세 제어기 button만 제공한다. 각방 선택 유형·온도조절기·구동기 자동 수량을 추가해야 한다.
- 현재 draft effect는 key 변경 때 loading/form/draft를 먼저 reset하지 않고, 저장 전 quantity와 전체 line snapshot을 명시적으로 재검증하지 않는다.

## 구현 전 server 확인

- 현재 `estimates.techRequest`는 `autoEstimateItems`를 JSON 검증 없이 받고 `amount`를 그대로 저장하며, `requestId` input이 없고 저장값도 `null`이다. SMS 알림은 저장 뒤에 실행된다.
- 따라서 JSON·line snapshot·총액·requestId/배정 검증은 `createEstimate` 호출 전 완료해야 하며, validation failure에서는 SMS 분기에도 도달하지 않아야 한다.
- 현재 `listEstimates`는 Drizzle schema에 선언되지 않은 열을 `as any`로 참조한다. 실제 schema에 없는 열이면 유효한 SQL column이 생성되지 않을 수 있으므로, 본인 보고 이력은 schema에 존재하는 열 또는 별도 명시적 SQL mapping으로 재구성·실행 검증해야 한다.

## Schema·플랫폼 구현 경계

- 실제 `repair_requests` mapping에는 `id`, `customerName`, `phoneNumber`, `technicianId`, `technicianName`이 존재한다. 접수 기반 견적 보고는 이 값을 사용해 로그인 기사 배정과 고객 이름·번호 일치를 server에서 검증할 수 있다.
- 실제 `estimates` mapping에는 `requestId`가 존재하지만 `sourceType`과 `techRequesterId`는 선언되어 있지 않다. schema migration을 추가하지 않는 이번 후보에서는 해당 미선언 열을 본인 조회 기준으로 사용하지 않는다.
- 모바일 화면은 `ScreenContainer`와 `KeyboardAvoidingView`를 유지하고, 실제 iOS Simulator/실기기 및 Android 실기기 검증은 export·compile과 구분해 미실시로 기록한다.

## 홈페이지·실제 DB 대조 근거

- 홈페이지 기준 구수는 2~10이며, 각방 전체 선택은 유량밸브 15A를 구수만큼 분배기 동시 시공 전용가로 자동 추가한다. 거실 1개와 없음은 유량밸브를 자동 추가하지 않는다.
- 홈페이지 기준에는 파라핀/모터 구동기, 디지털 온도조절기 수량, 제어기 선택이 있다. 기본/와이파이 제어기는 디지털 온도조절기 3개 자동 추가 조건을 가진다. 와이파이형과 V타입의 독립 선택 요구는 별도로 유지한다.
- read-only `information_schema` 확인에서 실제 `estimates` DB에는 `sourceType`, `autoEstimateItems`, `techRequesterId`, `techRequesterName`, `techRequestStatus`, `techRequestNote`, `senderRole` 열이 존재한다. 현재 Drizzle mapping에 이 열이 빠져 있으므로 이번 후보는 DB schema를 바꾸지 않고 TypeScript mapping만 실제 열에 맞춘다.
- 실제 `estimates` DB에는 `requestId`, `customerName`, `customerPhone`, `branchId`, `sentBy`, `status`가 있고, `repair_requests`에는 기사 배정과 고객 확인에 필요한 `id`, `technicianId`, `customerName`, `phoneNumber`, `branchId`가 존재한다.

## 운영 홈페이지 단가표 재확인 (read-only, 2026-09-12)

- 공식 홈페이지의 공개 `prices.listActive` 단가표를 다시 조회했다. `유량밸브 15A`는 표준가·단체가 모두 **29,000원**이며 각방 온도조절기 선택 시 구수만큼 자동 추가되는 분배기 시공 계약으로 설명된다.
- 자동수량 대상은 디지털 온도조절기(표준 106,000원/단체 91,000원), 아날로그 조절기(39,000원/30,000원), 구동기 파라핀(39,000원/30,000원), 구동기 모터타입(74,000원/50,000원)이다.
- 제어기는 제어기(141,000원), 와이파이형 제어기(220,000원), 조절기 V타입(110,000원)으로 확인됐다. 앱은 와이파이형과 V타입의 독립 선택 계약을 유지한다.
- 구형 부분수리 `제어기 교체`(55,000원/48,000원)는 제품 `제어기`와 합치지 않으며, 부분수리 선택 목록에서 제외한다.

## 운영 본사 자동견적 화면 확인 (read-only, 2026-09-12)

- 본사 관리자 로그인 후 `견적서 생성하기` 화면까지 이동해 저장·전송 없이 빈 자동견적 상태를 확인했다.
- 화면은 표준시공가/단체할인가, 분배기 교체/부분 수리/배관 청소/직접 선택, 품목별 수량·가격 구분, 임시저장, 고객 전송 기능을 분리해서 제공한다.
- 해당 운영 화면의 상태 표시는 `Build: 2026-07-10-004`, `Commit: b10ac2b`, `Domain: futureenergytech.co.kr` 이다. 이 정보는 운영 페이지 식별 정보이며, 이번 기사앱 후보의 게시 또는 운영 코드 변경 근거로 사용하지 않는다.

## 운영 자동견적 source 계약 재확인 (read-only, 2026-09-12)

- 로그인된 운영 화면의 inline source는 `유량밸브 15A`, `스트레이너 25A`, 분배기교체 메인밸브를 분배기 시공 할인 대상과 별도 독립시공 대상(`valve15A_ind`, `valve20A_ind`, `valve25A_ind`)으로 구분한다.
- 운영 source는 독립 유량밸브 15A의 표준/단체가를 74,000원/58,000원으로, 분배기 시공 유량밸브 15A를 별도 단가 객체로 취급한다. 앱 후보는 두 계약을 합치거나 공용 DB 값을 덮어쓰지 않는다.
- 운영 source의 가격 모델에는 디지털·아날로그 온도조절기, 기본·와이파이·V타입 제어기, 파라핀·모터 구동기가 별도 키로 존재한다.

## 운영 조절기·구동기 전환 계약 재확인 (read-only, 2026-09-12)

- 운영 source의 적용 경로는 디지털 온도조절기, 파라핀 구동기, 모터 구동기를 각각 독립 자동품목으로 추가하고, 선택된 제어기 유형에 따라 기본 제어기·와이파이형 제어기·조절기 V타입 중 해당 제품을 별도 품목으로 추가한다.
- 운영 source는 부분수리에서 분배기 전용 항목과 구형 임시 항목을 제외하고, 유량밸브 독립시공을 `유량밸브 15A / 부분수리` 등의 별도 명칭과 74,000원/58,000원 가격으로 제공한다.
- 따라서 앱 후보는 분배기 동시 시공 29,000원과 독립 부분수리 74,000원/58,000원을 명칭·source·priceMode·단가 snapshot까지 구분해 보존해야 한다.

## 운영 제어기 종류 전환 contract (read-only, 2026-09-12)

- 운영 `selectController(type)`는 기본 제어기와 `없음`은 기존의 단일 선택으로 처리한다.
- 와이파이형 또는 V타입 선택 시에는 기본 제어기와 같은 특수 유형만 제거하며, **다른 특수 유형은 유지**한다. 따라서 와이파이형과 V타입은 동시에 존재할 수 있고 각각 다시 선택하면 해당 유형만 해제된다.
- 운영의 별도 사용자 지정 조절기 적용은 디지털 온도조절기·파라핀 구동기·모터 구동기 수량을 명시값으로 재생성하고, 선택 제어기 유형을 한 개 추가한다. 앱 후보의 자동선택 UI는 이 수량 전환 계약과 다르게 두 조절기 유형을 누적하지 않도록 보완해야 한다.

## 격리 검수 서버 확인 (2026-09-12)

- 기존 Vercel 계정의 기존 `futureenergytech` 프로젝트에 **preview target만** 사용한 합성 견적 검수 endpoint를 배포했다. deployment ID는 `dpl_4KsUGTBrq11KPcCtkh4Fc11hDoUK`이며 `READY` 상태다. production alias는 부여되지 않았다.
- preview endpoint는 read-only 확인에서 운영 DB가 아닌 고정된 21개 가격 snapshot만 반환했다. snapshot에는 2~10구 분배기, 분배기 시공 유량밸브 15A 29,000원, 독립 부분수리 유량밸브 15A 74,000원/58,000원, 조절기·구동기 품목이 포함된다.
- 합성 접수 ID `90000001`과 합성 고객 정보만 수락하며, 보고는 `REVIEW-xxxx` 형태의 메모리 내 검수 기록으로만 반환하고 `smsSubstituted=true`를 명시한다. 운영 DB·실제 고객 접수·SMS/알림 provider 호출 코드가 없다.
- preview는 Vercel 보호 설정으로 임시 share access가 필요했다. 이 접근 값과 URL query는 evidence·소스·보고서에 기록하지 않는다.
- 보호된 preview 세션에서 합성 견적 요청 1건을 실제 실행했다. HTTP 200, `REVIEW-0001`, `smsSubstituted=true`를 확인했다.
- 같은 preview의 본인 검토 내역 재조회에서 합성 request ID, 합성 고객 전화번호 mapping, `techRequestStatus=pending`, `smsSubstituted=true`, 합성 총액이 함께 반환됐다. 운영 고객·운영 견적·운영 SMS는 조회·생성·발송하지 않았다.
