# PDF logcat 정정 범위 확인

2026-09-14 KST에 확인한 기존 제출 PDF `FET_TechEstimate_CodexRecheck5_Result.pdf`는 총 4페이지이며, 화면상 2페이지(파일 4페이지)는 과거 v1.1.33 build 연결·인계 사항만 포함한다. 현재 code 38 실기기 검수 logcat 명령은 이 PDF에 존재하지 않는다.

따라서 이번 정정 대상은 code 38 검수 패키지의 `android-v1.1.38-device-test-procedure.md` 및 이를 포함해 다시 생성할 검수 안내 PDF다. 새 안내에는 Windows와 macOS/Linux의 명령을 각각 별도 code block으로 넣어 줄바꿈·페이지 경계로 잘리지 않게 한다.
