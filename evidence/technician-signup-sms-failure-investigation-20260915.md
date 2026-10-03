# 기사 회원가입 SMS 요청 실패 조사 — 2026-09-15

## 조사 범위

검수 번호를 포함한 개인정보, 인증번호, SMS API key·secret은 이 문서에 기록하지 않는다. 최근 기사 가입용 인증문자 요청 2회에 대해 **추가 발송 없이** HTTP 응답·Vercel production runtime 로그·SMS 제공자 콘솔 접근 상태만 대조한다.

## 현재 확보된 사실

| 구분 | 확인 결과 |
| --- | --- |
| 요청 시각 | 12:59:55 UTC, 13:03:23 UTC의 `POST /api/trpc/auth.sendVerifyCode` 2건 |
| HTTP 상태 | 두 요청 모두 HTTP 200 |
| 앱/테스트 응답 판단 | tRPC result의 `success`는 두 요청 모두 `false` |
| Vercel runtime 기록 | 두 요청 모두 `Missing session cookie` warning만 기록; 이는 public 인증코드 요청의 비로그인 호출에 관한 기록이며 SMS 업체 결과는 포함하지 않음 |
| 서버 예외 | 현재 범위에서 5xx·uncaught runtime error 기록은 확인하지 못함 |
| Solapi 콘솔 | 연결된 브라우저에서 `https://console.solapi.com/dashboard`를 열었으나 콘텐츠·로그인 UI가 렌더링되지 않아 발송 이력 접근 여부를 확인하지 못함 |

## 해석 제한

HTTP 200은 tRPC 호출 자체가 수신되었음을 뜻할 뿐 SMS 요청 수락·최종 수신을 뜻하지 않는다. `auth.sendVerifyCode`는 다음 경우에도 HTTP 200과 함께 `success:false`를 반환하도록 구현되어 있다: 번호 형식 오류, 이미 등록된 기사 계정, 인증 요청 횟수 제한, SMS 설정 부재 또는 SMS 제공자 실패. 따라서 **현재 증거만으로 번호 중복·SMS 업체 접수 성공·SMS 업체 실패 중 어느 하나를 확정하지 않는다.**

추가 인증문자 요청, 기존 계정/전화번호 변경·삭제, 본사 승인, 고객 업무·출발·고객 문자 발송은 이 조사 단계에서 수행하지 않았다.

## 2026-09-15 원인 확정

본사 관리자 세션으로 `auth.listAccounts`를 조회하고, 검수 번호 원문을 브라우저·증빙에 반환하지 않는 SHA-256 대조만 수행했다. 대조 결과 해당 번호와 같은 **활성·승인 완료 technician 계정이 정확히 1건** 존재했다. 계정 이름·아이디·전화번호 원문은 조회 결과에 포함시키지 않았다.

production `auth.sendVerifyCode`는 기사 가입(`purpose: "signup"`)에서 SMS provider 호출 전에 `getTechnicianSignupPhoneState`를 확인한다. 이미 등록된 활성 기사 계정은 `blocked`가 되어 `success:false`와 “이미 등록된 기사 계정” 오류를 즉시 반환하고, `createPhoneVerificationWithinLimit`, `sendSms`, Aligo/Solapi 호출로 진행하지 않는다. 따라서 두 요청의 **HTTP 200은 정상적인 business-level 차단 응답**이며, SMS 업체에는 발송 요청이 접수되지 않았고 인증문자도 발송되지 않았다.

본사 전용 상태 조회에서는 Aligo·Solapi 환경변수가 모두 설정돼 있었으나, Aligo 잔액/인증 조회의 provider result는 `-101`이었다. 이는 이 SMS 차단 요청의 직접 원인이 아니며, 가입 요청이 Aligo/Solapi 발송 단계 전에서 종료됐으므로 업체 접수 실패로 해석하지 않는다. 관련 SMS 설정·센서 인증 경로는 변경하지 않았다.

## 2026-09-15 신규 검수 번호 인증 확인 결과

중복되지 않는 새 검수 번호로 `auth.sendVerifyCode`를 한 번 요청한 production focused test는 통과했다. 즉 HTTP 200 및 `success:true`가 확인되어 해당 요청은 SMS 발송 성공으로 처리됐다. 이 단계에서는 가입 신청·승인·고객 업무·센서 설정 변경을 하지 않았다.

인증 확인은 요청 시작 시각으로부터 약 **3분 41초 후**에 실행됐고 HTTP 200 / `success:false`를 반환했다. production 코드의 가입용 인증 만료 시간은 요청 시점부터 3분이며, 만료 시 `checkVerifyCode`는 tRPC transport 오류가 아닌 `success:false` 업무 응답으로 종료된다. 따라서 현재 실패의 확인된 원인은 **인증번호 유효시간(3분) 경과**다. 코드 원문·검수 번호 원문은 저장하지 않았다.

이 확인 호출은 인증 시도 횟수만 사용하며 신규 SMS를 발송하지 않는다. 추가 인증번호 요청, 계정 생성, 승인, 기존 계정 변경·삭제는 실행하지 않았다.

## 2026-09-15 실제 검수 가입 신청·승인 대기 확인

합성 preflight 통과 후 승인된 추가 SMS 요청 1회는 production `auth.sendVerifyCode`에서 성공했다. 다음 인증 확인은 production `auth.checkVerifyCode`가 발급한 **base64url signupGrant**를 원문 그대로 0600 제한 임시 파일에만 기록하는 보정된 검수 코드로 수행했고 성공했다. grant 원문은 이 문서·로그·소스에 기록하지 않는다.

동일 grant를 기사 앱과 같은 `auth.registerTechnician` 요청으로 한 번 제출한 결과 `success:true`, `pendingApproval:true`가 확인됐다. 본사 관리자 세션의 기존 `auth.listAccounts`를 단방향 해시로 대조한 결과, 해당 검수 번호의 technician 계정은 정확히 1건이며 **`isActive:false`, `approvalStatus:pending`** 이었다. 즉 승인 전 기사 업무 접근이 허용되지 않는 기존 본사 승인 대기 체계에 연결됐다.

이 시점까지 고객 업무 배정·출발·고객 문자 발송·센서/누수/유량 인증 변경·기존 계정 변경/삭제는 실행하지 않았다. 다음 단계는 사용자 승인 범위의 기존 본사 승인 API를 통한 해당 검수 계정 활성화와 로그인 확인이다.

## 2026-09-15 실제 본사 승인·기사 로그인·비활성화 확인

사용자 재확인 후 본사 관리자 세션에서 기존 `auth.adminUpdateById` procedure로 검수 계정 1건만 `isActive:true`로 변경했다. HTTP 200과 `success:true`가 확인됐으며 tRPC 오류는 없었다. 별도 계정 체계·자동 승인·공통 인증 변경은 사용하지 않았다.

활성화 직후 제한 임시 파일의 검수 비밀번호로 production `auth.login`을 `source:"app"`으로 호출한 실제 검증은 HTTP 200 / `success:true` / `appRole:"technician"` / 토큰 발급을 확인했다. 이는 API 수준의 기사앱 로그인 검증이며 **실제 Android 화면에서의 로그인·업무 화면 이동은 아직 검증하지 않았다.** 고객 업무 배정·출발·고객 문자 발송은 하지 않았다.

검증 직후 같은 기존 본사 procedure로 해당 계정 1건만 `isActive:false`로 되돌렸다. HTTP 200과 `success:true`를 확인한 뒤 동일한 기사앱 source 로그인 요청을 재실행했을 때 `success:false` 및 인증 토큰 미발급을 확인했다. 활성 기사 조회가 비활성 계정을 결과에서 제외하므로 현재 운영 응답 메시지는 일반 로그인 오류일 수 있으나, 접근은 차단됐다. 기존 계정·번호·센서/누수/유량 기능은 변경하지 않았다.

signupGrant·검수 비밀번호·검수 번호·인증번호는 다음 정리 단계에서 0600 임시 파일과 환경 입력값에서 폐기한다.
