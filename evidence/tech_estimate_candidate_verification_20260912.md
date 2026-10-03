# 기사앱 견적 작성 홈페이지 정합성 후보 — 검증 기록

> 범위: 기사앱 `/tech-estimate` 및 이 화면에 필요한 본인 기사 견적 보고·조회 경로만 변경했다. 홈페이지 정적 견적 화면, 공용 단가 DB 행, 실제 고객 견적과 고객 발송은 변경·실행하지 않았다.

## 기준과 변경 경계

| 구분 | 값 또는 결과 |
|---|---|
| 기사앱 후보 branch | `tech-estimate-parity-candidate-20260912` |
| 후보 시작 commit | `9efb64ce872e8a14ca672b6c4b8f2f6d8c6a0063` |
| 홈페이지 기준 | 공식 운영 도메인에서 2026-09-12 read-only로 확인한 `tech-estimate.html` 동작 계약 |
| 홈페이지 source 변경 | 없음 (`public/web/**` diff 0 files) |
| 공용 단가 DB | 읽기만 사용. 행 추가·삭제·가격 덮어쓰기 없음 |
| 고객 견적/발송 | 후보 개발·검증에서 미실행 |

## 가격·품목 비교

| 구분 | 운영 홈페이지 기준 | 기사앱 후보 | 검증 |
|---|---|---|---|
| 분배기 | 2~10구를 선택하고 이전 분배기·자동항목을 교체 | `PORTS` 2~10, 이전 manifold/auto/자동 배관청소를 최신 선택으로 교체 | 엔진 회귀 |
| 분배기 스트레이너 | 시공 전용 36,000원 고정 | 자동 추가, `dist_discount` snapshot 유지 | 엔진 회귀 |
| 메인밸브 20A / 25A | 분배기 시공 전용 단가: 표준 91,000/108,000원, 단체 73,000/91,000원 | 분배기 구수 선택 뒤 전용 버튼에서 별도 추가 | 엔진 회귀 |
| 독립 부분수리 유량밸브 | 15A/20A/25A: 표준 74,000/82,000/114,000원, 단체 58,000/65,000/94,000원 | 현재 홈페이지 계약의 별도 선택 품목으로 추가 | 엔진 회귀 |
| 공급측 라인보수 | 단독 120,000원, 라인보수 동시 70,000원 | 기존 라인보수 20A/25A 존재에 따라 단일 항목으로 반영 | 엔진 회귀 |
| 배관청소 | 평수×1,000원+표준 140,000원 또는 단체 80,000원 | 동일 공식, 10평 미만 거부 | 엔진 회귀 |
| 제어기·제어기 교체 | 구형 `제어기 교체`는 부분수리 선택 목록에서 제외, `제어기`는 별도 제품 | 합치거나 가격 치환하지 않음 | 엔진 회귀 |
| 와이파이형/V타입 | 별도 선택 상태 | 동시 선택·개별 해제 | 엔진 회귀 |
| 단가 누락 | 가격 없는 품목 생성 금지 | 0원·구형 fallback 없이 `QuotePriceError`로 중단 | 엔진 회귀 |

## 실행 결과

| 구분 | 명령 또는 방법 | 결과 | 확인 범위 |
|---|---|---|---|
| 가격·선택 엔진 | `pnpm vitest run tests/tech-estimate-engine.test.ts` | 9 PASS | 2~10구, 구수 변경, 자동품목, 제어기, 가격 구분, 배관청소, 초안 snapshot, fail-closed |
| 기사 권한 source 계약 | `pnpm vitest run tests/tech-estimate-report-security.test.ts` | 2 PASS | 로그인한 기사·소속을 서버에서 계산, 입력 technicianId/branchId 미신뢰, 본인 보고만 조회 |
| 서버 build | `pnpm build` | PASS | app 전용 견적 보고·조회 route가 server bundle에 포함 |
| Android/iOS bundle | `pnpm exec expo export --platform all --output-dir /tmp/tech-estimate-native-export` | PASS | `/tech-estimate` route가 공통 Expo bundle에 포함 |
| 전체 TypeScript | `pnpm check` | baseline과 동일 계열의 기존 오류가 남음 | 후보 파일의 새 TypeScript 오류 없음. 프로젝트 전체 통과로 표현하지 않음 |

## 실제 기기 확인 경계

현재 Linux 후보 환경에는 iOS Simulator, Android emulator, Android `adb` 및 EAS CLI가 없다. 따라서 다음은 **미실시**이며 완료로 표시하지 않는다.

| 검증 항목 | iOS Simulator | 실제 iPhone | 실제 Android |
|---|---|---|---|
| 상단 상태표시줄·제목 안전영역 | 미실시 | 미실시 | 미실시 |
| 하단 홈 인디케이터·스크롤·키보드 회피 | 미실시 | 미실시 | 미실시 |
| 수량 입력·증감·삭제 및 임시저장 재열기 | 미실시 | 미실시 | 미실시 |
| 본인 기사 로그인·견적 보고 저장·이력 재조회 | 미실시 | 미실시 | 미실시 |

코드에는 `ScreenContainer`, `KeyboardAvoidingView`, iOS `padding` keyboard behavior 및 bottom safe area를 적용했다. 이는 실제 iPhone 동작 검증을 대신하지 않는다. Codex 검수 후 앱 반영이 승인되면, 기존 futureenergytech 계정·프로젝트·서명키를 사용해 iOS/Android installable build를 준비하고 실제 기기에서 위 항목을 별도 확인해야 한다.
