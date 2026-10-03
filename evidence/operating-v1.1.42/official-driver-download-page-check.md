# 공식 기사앱 다운로드 페이지 확인 — 2026-09-14

공식 주소 `https://퓨처에너지테크.kr/app/driver-download`를 로그인 없이 읽기 전용으로 확인했다.

| 확인 항목 | 실제 결과 |
|---|---|
| 표시 버전 | `v1.1.42` |
| 표시 파일 크기 | `89.7 MB` |
| 표시 배포일 | `2026. 9. 14.` |
| Android 안내 | “기존 기사앱을 삭제하지 않고, 아래 APK를 설치하여 업데이트하세요.” |
| 다운로드 anchor | `/download/driver/latest?fresh=1789395201337` |
| 고정 redirect | `/download/driver/latest`가 code 42 immutable GitHub asset으로 302 redirect됨 |

이 화면 확인은 홈페이지의 견적·단가·고객/SMS 기능을 호출하거나 변경하지 않았다.

## 공식 메인 메뉴 확인

공식 메인 `https://퓨처에너지테크.kr/`에서 다음 링크를 읽기 전용으로 확인했다.

| 위치 | 표시 문구 | href |
|---|---|---|
| PC 상단 내비게이션 | `기사용 앱 다운로드` | `/app/driver-download` |
| 모바일 메뉴 | `📱 기사용 앱 다운로드` | `/app/driver-download` |
| 기사 전용 설치 영역 | `📥 기사앱 설치 화면 열기` | `/app/driver-download` |
| 기사 전용 설치 영역 | `🤖 Android 최신버전 바로 받기` | `/download/driver/latest` |

공식 메인의 Android 최신 버전 표시는 `v1.1.42`였다.
