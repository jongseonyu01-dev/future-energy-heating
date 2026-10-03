# code 38 종료 로그 수집 도구 — Windows

이 도구는 **APK를 설치·삭제·수정하거나 기존 Android 로그를 지우지 않고**, Android의 JavaScript·네이티브 종료 기록만 읽어 바탕화면의 `code38-crash.txt` 한 파일에 저장합니다.

## 준비 — 한 번만

1. [공식 Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools)에서 **Windows용 ZIP**을 받습니다.
2. ZIP을 풀어 나온 `platform-tools` 폴더를 `run_code38_collector.cmd`와 **같은 폴더**에 둡니다.
3. 휴대폰에서 **개발자 옵션 → USB 디버깅**을 켜고, 잠금을 푼 상태에서 데이터 전송 가능한 USB 케이블로 Windows PC에 연결합니다.

Android 공식 문서에 따르면 USB ADB 사용에는 USB 디버깅이 필요하며, Android 4.2.2 이상에서는 해당 PC의 RSA 키를 휴대폰에서 승인해야 합니다.[1]

## 실행 — 종료 1회만 재현

1. `run_code38_collector.cmd`를 더블클릭합니다.
2. 도구가 기기 연결과 RSA 승인을 먼저 확인합니다. 연결되지 않았거나 `unauthorized`면 표시된 조치만 수행하고 다시 실행합니다.
3. **수집이 시작되었습니다**가 보인 뒤에만 code 38 앱에서 `전체 작업 목록` 또는 `점검표` 종료를 한 번 재현합니다.
4. PC 창으로 돌아와 Enter를 누릅니다.
5. 바탕화면에 생성된 **`code38-crash.txt` 한 파일은 성공·실패 상태와 관계없이** 이 채팅에 첨부합니다. 연결 끊김, 수집 프로세스 조기 종료, 빈 로그, `adb get-state` 예외·비정상 종료·빈 응답은 **수집 실패**로 표시되며 파일 안에 이미 확보된 로그와 실패 이유가 남습니다.

## 범위

이 도구는 `AndroidRuntime`, `ReactNativeJS`, `ReactNative`, `Expo`, `ExpoModulesCore`, `libc`, `DEBUG`, `ActivityManager` 로그를 함께 수집합니다. 스크립트와 출력 파일은 UTF-8로 읽고 씁니다. 운영 고객 데이터·SMS·홈페이지·공용 단가를 변경하지 않으며, APK 재빌드도 수행하지 않습니다.

## References

[1] [Android Debug Bridge (adb) — Android Developers](https://developer.android.com/tools/adb)
