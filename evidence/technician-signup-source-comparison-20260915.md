# 기사 회원가입·본사 승인 흐름 소스 비교

조사 일시: 2026-09-15 KST

## 확인된 누락 시점

기사 가입 신청 UI가 있는 마지막 확인 기준은 mobile source commit `b88deb7`이다. 해당 소스는 초기 로그인 화면에 `회원가입` 링크를 두고, 회원가입 화면의 `기사` 탭에서 이름·휴대전화·인증번호·아이디·비밀번호를 받은 뒤 `auth.registerTechnician`을 호출했다. 가입 완료 안내는 본사 승인 후 로그인 가능이라고 표시했다.

commit `e795e54598a87c56e270bac30b8c34fac6a556cc`(2026-06-22 23:54:44 UTC, `feat: 공개 회원가입 비활성화, 난방 상태 기술 수치 role 기반 숨김`)에서 `app/login.tsx`의 회원가입 링크가 삭제되고, 회원가입 입력 화면은 `공개 회원가입이 비활성화되어 있습니다`라는 관리자 문의 안내로 대체되었다. 이 commit의 server/routers.ts 변경은 없었다.

## 현재 mobile source 상태

현재 `app/login.tsx`에는 휴대폰 인증 mutation과 고객 `registerCustomer` mutation만 연결돼 있다. 초기 로그인 화면에는 회원가입 또는 기사 회원가입 진입 버튼이 없고, signup view에는 입력 폼이 없다. 하지만 `server/routers.ts`에는 `auth.registerTechnician` API가 남아 있다. 이 API는 현재 휴대폰 인증 완료를 요구하지만, 계정과 기사 레코드를 모두 `isActive: true`로 만들어 자동 승인 상태가 된다.

따라서 **화면 누락은 e795e54에서 발생했고, 자동 승인 정책은 그보다 앞선 9e2d557 계열에서 도입된 채 현재 source에 남아 있다.**

## 운영 홈페이지 source 상태

공식 홈페이지 production repository `futureenergytech`의 `server/routers.ts`에는 더 엄격한 기존 체계가 존재한다. `auth.registerTechnician`은 `signupChannel: "technician_app_v1"` 및 휴대폰 인증에서 발급한 일회성 `signupGrant`를 요구하고, app_roles 및 technicians 레코드를 모두 `isActive: false`로 생성한다. `server/db.ts`는 `technician_pending:{userId}` 표식을 저장하고, 본사 계정 활성화 시에만 해당 표식을 제거한다.

동 repository의 `auth.listAccounts`와 `auth.setActive`는 인증된 본사 관리자 또는 범위가 제한된 지사 관리자만 사용할 수 있으며, 본사 홈페이지 계정 승인 관리 화면은 비활성 기사 계정을 승인 대기 목록으로 표현하고 활성화 호출을 수행하도록 설계되어 있다.

## 복구 원칙

기사앱은 위 운영 서버 체계에 맞춰 기사 전용 가입 화면과 API 입력을 복구한다. 신규 기사 계정은 자동 활성화하지 않으며, 기존 본사 홈페이지 승인 목록·`setActive` 권한 검사·기사 records를 재사용한다. 실제 SMS, 운영 DB 데이터, APK release metadata 변경은 구현·검증 결과를 확인한 뒤에만 실행한다.
