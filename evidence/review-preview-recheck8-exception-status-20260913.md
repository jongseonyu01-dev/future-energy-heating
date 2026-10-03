# Review Preview 예외 교체 상태

| 항목 | 값 |
|---|---|
| 새 합성 review preview | `futureenergytech-4tlv7asl8-futureenergytech.vercel.app` |
| deployment ID | `dpl_EVC92F5WhCNc6SJnbhdPLgDi8S42` |
| target | Vercel preview, READY |
| 이전 예외 URL | `futureenergytech-qqsc7llrp-futureenergytech.vercel.app` |
| 프로젝트 보호 | Vercel 화면에서 **Standard Protection** 유지 |
| 현재 예외 목록 | `futureenergytech-4tlv7asl8-futureenergytech.vercel.app` 한 건만 등록 |

> 기존 URL을 재보호하기 위한 Vercel UI의 행 선택/삭제 조작을 진행 중이다. 새 URL을 예외로 추가하거나 APK build를 새 URL로 연결하기 전에는 이전 URL 재보호와 단일 예외 범위를 HTTP 상태로 확인한다. 프로젝트 전체 SSO, 운영 도메인 및 일반 preview 보호 설정은 변경하지 않는다.

## 예외 resource 식별

로그인된 Vercel 설정 화면의 read-only 조회 API는 이전 URL을 다음 resource 한 건으로 반환했다.

| 필드 | 값 |
|---|---|
| 조회 endpoint | `/api/v10/projects/prj_NSw84tQ4ICfvFnuoECxfgRJur55P/deployment-protection-exceptions` |
| 기존 exception ID | `dpl_Exg9e6NHnujsnTFADrBdYLPjmJeu` |
| 기존 alias | `futureenergytech-qqsc7llrp-futureenergytech.vercel.app` |

이 식별자는 기존 단일 URL의 재보호 조작에만 사용하며, 프로젝트 전체 deployment protection 또는 bypass secret에는 사용하지 않는다.

## 설정 화면 구현 확인

로그인된 Vercel 설정 화면의 bundle은 예외 행의 **Remove** action이 기존 alias에 대해 `override.scope = alias-protection-override`, `override.action = restore` mutation을 수행하고, 성공 메시지를 `Protection restored for <alias>`로 표시함을 확인했다. 이 계약을 사용해 기존 exception ID 한 건만 restore하며, project-wide protection 또는 automation bypass secret은 변경하지 않는다.

## 1차 교체 결과 — 기존 alias 재보호

2026-09-13 KST에 Vercel Deployment Protection Exceptions의 기존 행 `futureenergytech-qqsc7llrp-futureenergytech.vercel.app`만 선택해 **Restore Protection**을 실행했다. Vercel이 요구한 도메인 일치와 `reprotect my domain` 확인 문구를 입력한 뒤 목록이 빈 상태가 된 것을 설정 화면에서 확인했다. Standard Protection 표시, 운영 도메인, 다른 preview, automation bypass secret은 이 조작에서 변경하지 않았다.

비인증 요청으로도 기존 alias의 `/api/trpc/prices.listActive`는 HTTP `302`와 Vercel SSO redirect를 반환했다. 결과는 `evidence/logs/review-old-alias-reprotected-v37.log`에 보관했다.

## 2차 교체 결과 — 새 alias 단일 예외

기존 목록이 비어 있는 상태에서 새 합성 preview `futureenergytech-a1wmfbu7k-futureenergytech.vercel.app` 한 건만 등록했다. 이후 tRPC `PRECONDITION_FAILED`의 JSON-RPC 숫자 코드를 공식 `-32012`로 정합화한 소스만 포함해 `dpl_EVC92F5WhCNc6SJnbhdPLgDi8S42` preview를 새로 배포했다. 이전 `a1wmfbu7k` alias도 재보호한 후 현재 `futureenergytech-4tlv7asl8-futureenergytech.vercel.app` 한 건만 예외로 등록했다. 설정 화면의 상단 Vercel Authentication은 계속 **Standard Protection**으로 표시되며, 운영 도메인·다른 preview·automation bypass secret은 변경하지 않았다.

## 최종 HTTP 검증

새 alias에서 `scripts/verify-review-preview.mjs`를 실행해 다음을 확인했다. 미인증 가격·보고·보고조회는 모두 HTTP `401`과 `UNAUTHORIZED` tRPC metadata를 반환했다. 두 합성 기사 로그인, 각자의 합성 배정 접수, 위치 동의 전 출발 HTTP `412/PRECONDITION_FAILED/-32012`, 인증 동의 저장 후 본인 접수 출발, 위치 update/stop, `repair.getById`, 빈 `workReport.getByRequest`, 본인 견적 저장 및 SMS 대체 상태는 정상 응답을 반환했다. 타 기사 점검표·동의·보고 제출은 모두 HTTP `403/FORBIDDEN`으로 차단됐다. 결과는 `evidence/logs/review-preview-v37-http.log`에 보관했다.

비예외 preview인 `futureenergytech-qqsc7llrp-futureenergytech.vercel.app` 및 `futureenergytech-a1wmfbu7k-futureenergytech.vercel.app`는 비인증 요청에 HTTP `302` Vercel SSO redirect를 반환했다. 결과는 `evidence/logs/review-nonexception-aliases-protected-v37.log`에 보관했다.
