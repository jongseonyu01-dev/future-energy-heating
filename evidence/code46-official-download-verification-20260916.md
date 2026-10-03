# code46 공식 고정 다운로드 전환 및 검증 — 2026-09-16

## 전환 범위

사용자가 실기기에서 code46의 매출 화면 표시를 확인한 뒤, 새 빌드 없이 사전 검증된 동일 APK를 GitHub immutable release `android-v1.1.46-46`에 등록했다. 공식 resolver `https://xn--h50b270bp0ceuddugnobx2m.kr/api/mobile-app/latest?fresh=1`은 code46 metadata를 반환하며, 공식 고정 주소 `https://xn--h50b270bp0ceuddugnobx2m.kr/download/driver/latest`는 해당 release의 `future-energy-heating.apk`로 302 이동한다.

기존 code45 release `android-v1.1.45-45`와 code44 release는 삭제하거나 변경하지 않았다.

## 공식 주소 재다운로드 검증

공식 고정 주소에서 서버가 제공한 파일을 다시 내려받아 검증했다.

| 항목 | 확인값 |
| --- | --- |
| 패키지 | `com.futureenergy.heatingcare` |
| 버전 | `1.1.46` / versionCode `46` |
| 파일 크기 | `94,777,838` bytes |
| SHA-256 | `a9f2c7c64696f03e3614cc9b95df026a96e8e43e40bb64ae580b0e0de2f125e4` |
| 16KB 정렬 | Android Build Tools 36 `zipalign -c -P 16 -v 4`: successful |
| 전자서명 | APK Signature Scheme v2/v3: true |
| signer certificate SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |

## 검증 범위 구분

실기기에서는 기사앱의 매출 화면 표시만 사용자 확인을 받았다. 실제 운영 완료보고를 저장하고 본사 수금관리에 자동 반영된 동일 기록·금액·결제수단은 아직 검증하지 않았다. 다음 실제 업무 완료보고 1건이 생성된 뒤에만 읽기 전용으로 대조한다.

회원가입·위치 전송·이동경로·견적·사진·누수·유량 센서 관련 코드는 이번 다운로드 전환에서 변경하지 않았다.

## 누락 원인과 재발 방지

조사 결과, 정상 code32 계보의 `app/(tabs)/tech-works.tsx`에는 기사 당일·월간 매출 카드와 월별 완료보고 조회가 있었고, `app/work-report.tsx`에는 결제수단·실제 수금액 입력 및 저장 payload가 있었다. code45 작업본 계보에서는 이 두 화면 연결이 누락됐으나, 운영 매출·수금 원본 데이터와 production API는 남아 있었다.

재발 방지로 다음 검사를 추가했다.

1. 기사 결제 저장 payload와 기존 work-report 수금 ledger 연동 contract 확인
2. 카드·현금·계좌이체, 한국시간 월말·월초, 재진입 값 복원, 동일 report 재시도 upsert의 분리 fixture 회귀
3. 동일 review deployment에서 기사 저장 fixture와 본사 조회 fixture의 requestId·결제수단·금액·월 합계 대조
4. release 전 Hermes bytecode의 운영 API 주소 및 review URL·review mode 부재 확인
5. 공식 고정 주소 재다운로드 APK의 version·SHA-256·기존 signer·16KB 정렬 확인

사용자 실기기에서 code46의 매출 화면 표시는 확인됐다. 다만 실제 운영 완료보고의 저장과 본사 수금관리 반영 대조는 다음 실제 업무 1건이 생성된 뒤 읽기 전용으로 별도 확인한다.
