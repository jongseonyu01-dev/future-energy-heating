# 합성 검수 Preview 예외 교체 상태

| 항목 | 상태 |
|---|---|
| 기존 예외 도메인 | `futureenergytech-bnsrgrrvs-futureenergytech.vercel.app` |
| 신규 review preview | `futureenergytech-qqsc7llrp-futureenergytech.vercel.app` |
| Vercel Protection | **Standard Protection** 유지 |
| 2026-09-13 02:08 KST 확인 | 기존 예외 도메인 한 건을 `reprotect my domain` 확인 절차로 재보호 완료 |
| 기존 URL 조치 | `Protection restored for futureenergytech-bnsrgrrvs-futureenergytech.vercel.app` 성공 표시 및 예외 목록 제거 확인 |
| 신규 URL 조치 | `futureenergytech-qqsc7llrp-futureenergytech.vercel.app` 한 건을 `unprotect my domain` 확인 절차로 예외 등록 완료 |
| 안전 조치 | 프로젝트 전체 SSO는 Standard Protection으로 유지했으며, 운영 도메인·bypass secret·운영 DB·문자 설정은 변경하지 않음 |

> 예외 목록에는 신규 review preview URL 한 건만 남았으며, 이전 review preview URL은 재보호됐다.

## 행 선택 확인

모달을 취소한 뒤 표의 행 checkbox를 좌표로 선택하려 했으나 화면 상태가 바뀌지 않았다. 따라서 다음 조작은 표 DOM의 checkbox·행 action을 식별한 뒤, 기존 도메인 한 건에만 적용한다.

이후 행 action 메뉴의 `Remove`를 사용하여 기존 예외에 대한 `Restore Protection` 확인 창을 열고, 도메인과 확인 문구를 입력해 한 건만 재보호했다. 새 예외는 `Add Domain` 절차에서 새 도메인과 `unprotect my domain` 확인 문구를 입력하여 한 건만 등록했다.
