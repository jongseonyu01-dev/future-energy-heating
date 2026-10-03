# 기사앱 자동견적 홈페이지 정합성 후보 — Codex 검수 안내

## 적용 기준

이 후보는 기사앱 repository의 commit `9efb64ce872e8a14ca672b6c4b8f2f6d8c6a0063`에서 시작한 branch `tech-estimate-parity-candidate-20260912`를 기준으로 한다.

변경 대상은 다음 네 파일과 검증·기록 파일뿐이다.

| 경로 | 변경 목적 |
|---|---|
| `app/tech-estimate.tsx` | 기사앱 자동견적 작성·로컬 임시저장·재열기·본인 보고 화면 |
| `lib/tech-estimate-engine.ts` | 홈페이지 가격·자동품목·fail-closed 견적 엔진 |
| `server/routers.ts` | 기사 본인 확인 뒤 견적 보고 및 본인 보고 목록 조회 |
| `server/db.ts` | 해당 본인 보고 목록의 read-only filter |

`public/web/**`는 변경하지 않았다. 홈페이지 견적의 계산·저장·출력·발송 동작, 공용 단가 DB 행, 실제 고객 견적·고객 발송에는 이 후보가 쓰지 않는 동안 변경이 없다.

## 재현 절차

기준 commit 작업트리의 repository root에서 delivery에 포함된 `tech-estimate-parity.patch`를 적용한다.

```text
git apply tech-estimate-parity.patch
pnpm vitest run tests/tech-estimate-engine.test.ts tests/tech-estimate-report-security.test.ts
pnpm build
pnpm exec expo export --platform all --output-dir /tmp/tech-estimate-native-export
```

예상 결과는 견적 엔진 9 PASS, 기사 본인 권한 source 계약 2 PASS, server build PASS, `/tech-estimate` route가 포함된 Android/iOS 공통 Expo export PASS다.

## 중요한 검증 경계

이 delivery는 고객·운영 DB에 쓰지 않는다. engine test는 비고객 synthetic price data를 사용한다. 기사 권한 test는 server source contract 검증이며, 실제 운영 로그인·DB mutation·SMS·고객 견적 전송을 실행하지 않는다.

Linux 검증 환경에는 iOS Simulator, 실제 iPhone, Android emulator 및 Android `adb`가 없다. Expo export는 Android/iOS 공통 bundle 포함을 확인한 것뿐이며, 실제 iPhone·Android UI 동작 검증을 대신하지 않는다. Codex 검수 뒤 별도 승인에서 실제 기기 안전영역·키보드·수량조작·초안 재열기·기사 권한을 확인해야 한다.

## TypeScript 기준

전체 `pnpm check`는 이 repository의 기존 schema/type drift 오류가 남아 전체 통과가 아니다. candidate scope에 새로운 TypeScript 오류가 없음을 baseline과 비교했으며, 이 delivery에는 해당 log가 포함된다.
