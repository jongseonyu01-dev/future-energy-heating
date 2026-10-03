# 기사앱 견적 후보 Internal Build 상태 — 2026-09-12

기준 checkpoint는 `9941dbf8`이며, 운영 게시·공식 홈페이지 배포·공용 단가 DB 변경은 수행하지 않았다.

| 플랫폼 | Build ID | Profile | 상태 | 자격증명 경계 |
|---|---|---|---|---|
| Android | `6c484635-585b-4dc2-9e11-f4cd8ae59270` | `preview` / internal APK | 완료 | 기존 Expo 계정의 remote default keystore 재사용. 새 키 생성 없음. |
| iOS | `e5d234ba-3d50-4807-9d3b-5765e59772cd` | `testflight` / store build | 생성 요청 완료 | 기존 EAS iOS distribution certificate·active provisioning profile·App Store Connect API key 재사용. 새 인증서·개인키·푸시 키·프로파일 삭제/교체 없음. |

## iOS internal distribution 진단

`preview` internal distribution은 non-interactive 실행에서 적합한 internal-distribution credential을 찾지 못해 시작하지 못했다. 이후 기존 EAS credential을 Apple Developer Portal에서 조회한 결과, 다음 기존 리소스는 active 상태로 확인되었다.

| 리소스 | 결과 |
|---|---|
| Expo project / Bundle ID | 기존 `future-energy-heating` project와 `com.futureenergy.heatingcare`가 일치 |
| Apple 팀 | EAS 저장 기존 팀과 provisioning profile의 팀이 일치 |
| Distribution certificate | active, 2027-07-09 UTC까지 유효 |
| Provisioning profile | active, 2027-07-09 UTC까지 유효 |
| App Store Connect API key | 기존 TestFlight 용도 key가 활성 상태 |

따라서 internal preview의 부족 항목은 기존 certificate/private key 자체가 아니라, 등록 iPhone UDID가 포함된 ad hoc internal distribution profile 또는 해당 EAS profile 연결이다. 반대로 TestFlight store profile은 기존 certificate·profile·API key로 build 요청을 완료했다. TestFlight 설치·테스터 초대·실제 기기 시험은 아직 수행하지 않았다.

## 검수 경계

Android APK와 iOS TestFlight build는 checkpoint `9941dbf8` 소스를 대상으로 한 검수용 build request다. 앱스토어 공개 출시, TestFlight 테스터 등록, 고객 견적 수정·발송, 홈페이지 배포는 이 기록 범위에서 실행하지 않았다.
