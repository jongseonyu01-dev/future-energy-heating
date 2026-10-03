# 인증 보완 합성 견적 검수 Preview 배포 기록

| 항목 | 값 |
|---|---|
| Vercel deployment ID | `dpl_ERNgB6yLeth2ssaX5GmLNFF4ogLq` |
| Target | `preview` (`target: null`, production 미지정) |
| 상태 | `READY` |
| 배포 URL | `futureenergytech-wlvr2pr81-futureenergytech.vercel.app` |
| 배포 source | `review-server`의 합성 단가·합성 기사·메모리 보고·SMS 대체 구현만 포함 |
| 운영 DB·SMS | source import·환경변수·외부 호출 없음 |

## 검증 접근 상태

새 preview의 일반 URL은 Vercel Deployment Protection에 의해 보호된 상태이며, 아직 이 URL에는 예외를 추가하지 않았다. 임시 share 세션의 루트는 API route만 제공하는 최소 serverless deployment이므로 `404`를 반환한다. 이어진 console의 상대·절대 fetch 시도는 execution-origin/CORS 제약으로 실패했으며, 이를 API 공개 성공이나 인증 검증 성공으로 판정하지 않았다. 다음 단계에서 새 URL 한 건만 예외 등록한 뒤 browser navigation 및 실제 HTTP 요청으로 인증·권한을 검증한다.

## 단일 예외와 실제 HTTP 재현

| 확인 항목 | 결과 |
|---|---|
| 새 예외 URL | `futureenergytech-wlvr2pr81-futureenergytech.vercel.app` 한 건만 등록 |
| 기존 예외 URL | `futureenergytech-pxgq6ywrg-futureenergytech.vercel.app`는 재보호 완료 |
| 프로젝트 보호 방식 | Vercel 화면에서 **Standard Protection** 유지 |
| APK/IPA 보호 우회값 | 사용·주입·기록하지 않음 |
| 미로그인 가격·접수·보고 조회 | 각각 HTTP `401` |
| 합성 기사 로그인 | 두 합성 기사 모두 HTTP `200` 및 `technician` role |
| 인증 후 단가 snapshot | HTTP `200`; 부분수리 유량밸브 할인 단가 `58,000`원 확인 |
| 본인 합성 접수 보고 | HTTP `200`, `smsSubstituted: true` |
| 다른 기사로 본인 접수 제출 | HTTP `400` 차단 |
| 보고 조회 권한 | 본인 보고 `1`건, 다른 합성 기사 보고 `0`건 |

> 실제 요청은 새 preview의 API route에만 전송했다. 요청 데이터·보고는 process memory에만 저장되며, 운영 DB·운영 고객·문자 provider에는 접속하지 않는다.
