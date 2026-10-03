# code 44 고정 다운로드 end-to-end 검증

2026-09-15 KST에 운영 본사 관리자 세션으로 code 44 release metadata를 등록했다. 고정 주소 `https://퓨처에너지테크.kr/download/driver/latest`는 302로 immutable asset `android-v1.1.44-44/future-energy-heating.apk`로 연결되며, 최종 GitHub redirect까지 따라 실제 APK를 다시 내려받아 검사했다.

| 검사 항목 | 최종 파일 결과 |
|---|---|
| package | `com.futureenergy.heatingcare` |
| versionName / versionCode | `1.1.44` / `44` |
| SHA-256 | `480f821c6086c7756a4f4e759487b0f138d18fdae17c73269459f9e740e4a083` — release 원본 일치 |
| file size | `94777838` bytes |
| 16KB alignment | Build Tools 36.0.0 `zipalign -c -P 16 -v 4`: `Verification successful` |
| signature | `apksigner verify --verbose --print-certs`: v2/v3 `true` |
| signer certificate SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` — 기존 인증서 일치 |

code 43과 그 이전 release는 삭제·수정하지 않았다. code 44 실제 Android 업데이트 설치, 위치 좌표의 서버 저장, 고객 추적 링크 반영, 앱 마지막 전송 시각 갱신은 아직 기기 검증 전이므로 미확인이다.
