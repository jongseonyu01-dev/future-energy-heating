# 공식 Android 배포본 versionCode 재확인

2026-09-13 KST에 공식 고정 다운로드 경로를 읽기 전용으로 확인했다.

| 항목 | 결과 |
|---|---|
| 공식 고정 경로 | `https://퓨처에너지테크.kr/download/driver/latest` |
| HTTP 상태 | `302 Found` |
| artifact 경로 | `https://github.com/jongseonyu01-dev/future-energy-heating/releases/download/android-v1.1.21-32/future-energy-heating.apk` |
| release 식별 | `android-v1.1.21-32` |
| 공식 최대 versionCode | `32` |

> Codex 재검수 후보 APK는 현재 공식 배포본보다 높은 동일 서명 `versionCode`가 필요하므로, 다음 후보의 Android `versionCode`와 iOS build number를 최소 `33` 이상으로 올려야 한다. 이 확인은 읽기 전용이며 운영 APK 파일·다운로드 링크를 변경하지 않았다.
