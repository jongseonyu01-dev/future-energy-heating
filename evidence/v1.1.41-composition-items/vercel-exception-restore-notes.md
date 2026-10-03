# Vercel 단일 review preview 예외 교체 확인 기록

확인 시각: 2026-09-14 KST

## 현재 상태

Vercel Project Settings의 Deployment Protection은 **Standard Protection**으로 유지된다. 현재 예외 목록에는 이전 합성 review preview alias `futureenergytech-2dhinw2q6-futureenergytech.vercel.app` 한 건만 있었다. 새 합성 review-server preview는 deployment `dpl_8GSh5zjxWHMUTXNMpncdxsi9KQCW`, URL `futureenergytech-mcdhzapb2-futureenergytech.vercel.app`, 상태 `READY`다.

## 설정 페이지 코드에서 확인한 단일 alias 복원 semantics

Vercel 설정 페이지가 조회하는 목록 endpoint는 아래와 같았다.

```text
GET /api/v10/projects/prj_NSw84tQ4ICfvFnuoECxfgRJur55P/deployment-protection-exceptions?teamId=team_6QJy5nNs6JizcdRWOQpIQuUN
```

현재 예외 resource id는 `dpl_GXX8UP4RLGNT73aBSoKxjDKaZmNX`로 조회됐다. 설정 page bundle의 remove handler는 alias lookup 뒤 `aliasId`와 아래 body를 사용해 alias protection override를 복원한다.

```json
{
  "override": {
    "scope": "alias-protection-override",
    "action": "revoke"
  }
}
```

이는 현재 행의 **Remove** action이 `revoke`로 단일 alias의 예외를 해제하는 구현임을 뜻한다. 프로젝트 전체 Standard Protection·Trusted Sources·Automation Bypass 설정을 변경하지 않는다. 현재 표시된 confirmation dialog의 입력은 `unprotect` 설명으로 혼동될 수 있으므로, 이 기록의 alias override semantics를 근거로 단일 alias만 restore한다.

## 금지 범위

- `VERCEL_AUTOMATION_BYPASS_SECRET` 값은 조회·사용·APK 포함하지 않는다.
- 운영 도메인, 공용 단가 DB, 운영 DB/SMS에는 접근·변경하지 않는다.
- 새 preview에만 예외를 등록하고, 이전 preview가 보호됨을 HTTP로 확인한다.
