# 기사 회원가입 복구 code45 공식 다운로드 검증 — 2026-09-15

## 반영 대상

| 항목 | 확인값 |
| --- | --- |
| 공식 고정 주소 | `https://퓨처에너지테크.kr/download/driver/latest` |
| APK package | `com.futureenergy.heatingcare` |
| 버전 | `1.1.45` / versionCode `45` |
| SHA-256 | `a2fe5d49771be690c4121cabe2cefbcb33f353e96ca951c6ec680fb3d9e41d1c` |
| 기존 서명 인증서 SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |
| release source | GitHub Release `android-v1.1.45-45` |

## 고정 다운로드 검증

공식 production `/api/mobile-app/latest?fresh=1`은 GitHub release source로 version `1.1.45`, versionCode `45`, 위 SHA-256 및 `future-energy-heating.apk` URL을 반환했다. `/download/driver/latest`는 HTTP 302로 동일 APK asset에 연결됐다. 고정 주소에서 재다운로드한 파일의 SHA-256은 release metadata와 일치했다.

최종 재다운로드 파일은 `aapt dump badging`에서 package `com.futureenergy.heatingcare`, versionName `1.1.45`, versionCode `45`, compile SDK `36`으로 확인됐다. 공식 Android Build Tools 36 `zipalign -c -P 16 -v 4`는 **Verification successful**을 반환했고, 같은 Build Tools 36 `apksigner verify --verbose --print-certs`는 v2·v3 signer 검증과 기존 certificate digest 일치를 확인했다.

## 보존 및 미확인 범위

기존 `android-v1.1.44-44` code44 release는 삭제·변경하지 않아 복구본으로 보존됐다. 위치 전송·이동경로·견적·수량·초안·사진·누수/유량 센서 기능의 소스·운영 API는 이번 반영에서 변경하지 않았다.

연결된 Android 실기기와 Android emulator가 없어, **code45 APK의 실제 설치·회원가입 화면·승인 대기 화면·앱 로그인 화면은 이 환경에서 미검증**이다. 가입·본사 승인·로그인·비활성화는 production API 수준에서 실제 검증했고, APK의 package·version·서명·16KB 정렬과 공식 재다운로드 파일은 확인했다.
