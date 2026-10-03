# iOS Internal 검수 Credential 진단

| 확인 항목 | 읽기 전용 결과 |
|---|---|
| Apple Developer Team | `83MU3C8JZN` |
| 기사앱 Bundle ID | `com.futureenergy.heatingcare` |
| 기존 provisioning profile | App Store 유형 1건 존재, 만료일 2027-07-09 |
| 기존 iOS distribution 경로 | App Store/TestFlight용 profile은 존재하나 이번 지시로 TestFlight 제출은 보류 |
| 등록된 검수 기기 | 0대 |
| Ad Hoc profile | 없음 |
| internal IPA EAS 결과 | 적합한 internal distribution credential을 찾지 못해 build 착수 전 중단 |

> iOS internal IPA를 만들려면 검수용 실기기 UDID 등록과 해당 기존 Bundle ID를 포함한 Ad Hoc provisioning profile이 필요하다. 기존 인증서·개인키·App Store profile·push key는 이 진단에서 변경하지 않았다.
