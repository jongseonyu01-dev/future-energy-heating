# 기사 회원가입·본사 승인 복구 설계

## 기준 체계

공식 홈페이지 production repository의 현재 `auth.registerTechnician`·`auth.listAccounts`·`auth.setActive`를 가입 및 승인 권한의 단일 기준으로 사용한다. 새 기사 신청은 인증된 010 휴대전화 번호를 로그인 아이디로 사용하며, 생성되는 app_roles 및 technicians 행은 모두 비활성 상태여야 한다. 서버가 `technician_pending:{userId}` 표식을 저장해 본사 계정 승인 관리의 승인 대기 목록으로 분류한다.

본사만 또는 기존 지사 범위 권한을 가진 관리자만 `auth.setActive`로 승인할 수 있고, 활성화 시 연계 기사 행도 활성화되며 pending 표식은 제거된다. 기사앱은 관리자 승인 기능이나 별도 승인 목록을 구현하지 않는다.

## 기사앱 화면 흐름

초기 로그인 화면의 링크는 `기사 회원가입`으로 제한한다. 가입 화면은 이름, 010 휴대전화 번호, 인증번호, 비밀번호, 비밀번호 확인을 순서대로 받는다. 서버가 보낸 인증번호 확인 성공 시 응답의 일회성 `signupGrant`를 메모리에만 보관한다. grant는 화면·로그·저장소에 표시 또는 보관하지 않는다.

가입 신청에는 `signupChannel: "technician_app_v1"`, 휴대전화 번호, 이름, 비밀번호 및 메모리의 grant만 전송한다. 아이디를 별도로 받거나 자동 승인하지 않는다. 성공 안내는 `가입 신청이 접수되었습니다. 본사 승인 후 휴대전화 번호와 비밀번호로 로그인할 수 있습니다.`로 한정한다.

## API 경계

운영 APK는 공식 API base URL의 `auth.sendVerifyCode`, `auth.checkVerifyCode`, `auth.registerTechnician`만 호출한다. 모바일 workspace의 개발용 server router는 운영 Vercel router가 아니므로 승인 판단의 기준으로 사용하지 않는다. 앱 구현에는 단순 JSON tRPC envelope helper를 두어 official endpoint의 현재 contract와 직접 일치시킨다. 비밀번호, 인증번호, grant, Bearer token은 source·로그·증빙에 기록하지 않는다.

## 검증 계획과 한계

정적·모의 통신 검증은 버튼 노출, 전화번호 검증, grant 미발급 차단, 정확한 tRPC procedure/payload, 자동 승인 호출 부재를 확인한다. production에서 인증 없는 `auth.listAccounts` 접근은 차단돼야 하며, 인증 없는 불완전 가입 요청은 validation error가 반환돼야 한다.

가입 신청부터 본사 승인 후 실제 로그인까지의 production end-to-end 시험은 실제 수신 가능한 검수 휴대전화 번호와 본사 승인 관리자 세션이 필요하다. 이 정보 또는 승인 없이는 SMS 전송, 운영 DB 신규 계정 생성, 승인 조작을 실행하지 않으며 미검증으로 보고한다.

## 2026-09-15 production 부작용 없는 경계 확인

공식 비-www API base URL에 인증 쿠키·Bearer header 없이 조회·형식 오류 요청만 보냈다. `auth.listAccounts`는 HTTP 401 및 tRPC `-32001`(로그인이 필요합니다)을 반환했고, `auth.setActive`는 HTTP 401 및 `-32001 UNAUTHORIZED`를 반환했다. 따라서 비로그인 사용자가 승인 대기 목록 조회나 계정 승인을 수행할 수 없음을 확인했다.

`auth.registerTechnician`에는 빈 입력만 전송해 HTTP 400 / tRPC `-32600` validation error를 확인했다. 오류의 required input은 `password`, `name`, `phoneNumber`, 정확히 `technician_app_v1`인 `signupChannel`, `signupGrant`였고, 이 호출에는 전화번호·비밀번호·인증번호·grant를 포함하지 않아 SMS 발송·계정 생성·승인 상태 변경은 발생하지 않았다.

## 2026-09-15 본사 승인 관리 화면 read-only 확인

기존 본사 관리자 세션으로 공식 `/web/admin/dashboard.html`의 `계정 승인 관리`를 읽기 전용으로 열었다. 화면은 `기사 앱 가입 신청과 지사 홈페이지 가입 신청입니다. 기사 신청은 승인 전 삭제할 수 있습니다.` 안내와 함께 역할·이름·아이디·휴대폰·지사/담당지역·가입신청일·상태·처리 열을 가진 `계정 승인 대기 목록`을 제공했다.

현재 화면에서 보여진 승인 대기 건수는 0건이었다. 이 확인에서는 계정 생성, SMS 발송, 승인, 비활성화 또는 삭제를 실행하지 않았다. 기존 화면 source는 대기 기사 계정을 `approvalStatus === "pending"`으로 필터하고, 승인 버튼이 인증 header를 포함해 `auth.setActive({ userId, isActive: true })`를 호출함을 확인했다.
