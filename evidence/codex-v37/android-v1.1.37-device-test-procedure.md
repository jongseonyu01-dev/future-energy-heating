# Android v1.1.37 / code 37 실기기 검수 절차

## 1. 제어 가능한 컴퓨터의 구분

| 항목 | 현재 상태 | 의미 |
|---|---|---|
| 이 Manus sandbox | `adb` 설치 완료, `adb devices -l` 비어 있음 | 연결된 휴대폰이 없어 설치·실행·logcat·영상 수집을 수행할 수 없음 |
| Android emulator/AVD | emulator/SDK/AVD/KVM/CPU virtualization 없음 | 동일 APK의 emulator 실행은 이 환경에서 **불가능** |
| 사장님 PC | 미확인 | USB 케이블로 실제 휴대폰을 연결하고 `adb`를 실행할 수 있는 유일한 현장 제어 컴퓨터 |

> USB debugging 승인 대화상자는 **휴대폰을 실제로 연결한 PC**에서만 나타납니다. 이 채팅이나 sandbox가 사장님 PC·휴대폰의 USB 장치를 원격으로 자동 인식하거나 승인할 수는 없습니다.

Android는 USB ADB 사용 전 개발자 옵션의 USB debugging을 켜고, Android 4.2.2 이상에서는 휴대폰 잠금을 푼 상태에서 해당 PC의 RSA debugging key를 명시적으로 수락해야 한다고 안내합니다.[1] [2]

## 2. APK 업데이트 설치

1. 기존 앱을 **삭제하지 말고** `futureenergytech-review-v1.1.37-code37.apk`를 휴대폰의 다운로드 폴더에 저장합니다. 같은 package와 v2 certificate이며 versionCode `37`이 기존 `36`보다 높으므로 Android가 업데이트 설치로 처리해야 합니다.
2. 파일 앱에서 APK를 열고, 요청될 경우 해당 파일 앱/브라우저의 “이 출처 허용”만 일시적으로 허용합니다. 설치 후 다시 끌 수 있습니다.
3. 앱 정보에서 버전이 `1.1.37`인지 확인합니다. 검수 로그인은 합성 계정 `review-tech` / `review-only`만 사용합니다.
4. 이 APK는 `https://futureenergytech-4tlv7asl8-futureenergytech.vercel.app` 합성 review API만 사용합니다. 운영 고객 견적, 운영 고객 정보, 실제 SMS는 시험하지 않습니다.

설치가 “앱이 설치되지 않음”으로 실패하면 기존 앱을 삭제하지 말고, 설치 실패 화면과 Android 버전만 먼저 촬영합니다. package/signature/versionCode 충돌 여부를 그 증거로 확인해야 합니다.

## 3. 사장님 PC에서 ADB 연결 확인

### A. 휴대폰에서 한 번만 수행

1. **설정 → 휴대전화 정보 → 소프트웨어 정보 → 빌드 번호**를 7회 탭해 개발자 옵션을 켭니다. Samsung Galaxy 등 제조사에 따라 경로 명칭은 다를 수 있습니다.[2]
2. **설정 → 개발자 옵션 → USB 디버깅**을 켭니다.
3. 데이터 전송 가능한 USB 케이블로 **휴대폰과 사장님 PC를 직접 연결**합니다. 충전 전용 케이블은 사용하지 않습니다.
4. 휴대폰의 “USB 디버깅을 허용하시겠습니까?” RSA key 대화상자에서 이 PC를 확인하고 **허용**합니다. PIN/패턴이 있으면 먼저 잠금을 풉니다.[1]

### B. 사장님 PC에서 확인

Android SDK Platform Tools가 설치된 폴더에서 다음을 실행합니다.

```text
adb devices -l
```

정상은 장치 serial 뒤에 `device`가 나타나는 경우입니다. 목록이 비어 있거나 `unauthorized`면 **휴대폰의 RSA 허용 대화상자를 다시 확인**하고 케이블/USB 모드를 바꿉니다. Android 공식 문서도 `adb devices -l`로 연결된 장치를 확인하도록 안내합니다.[1]

Windows에서 `adb`를 찾지 못하면 Android SDK Platform Tools를 설치한 뒤 `platform-tools` 폴더에서 명령을 실행합니다. macOS/Linux도 같은 Platform Tools의 `adb`를 사용합니다.[1]

## 4. 화면 녹화와 세 경로 실행

휴대폰의 빠른 설정에 **화면 녹화**가 있으면 이를 사용합니다. 없다면 제조사 기본 녹화 기능을 사용합니다. Android 개발자 옵션의 **Show taps**를 켜면 녹화에서 터치 지점을 남길 수 있습니다.[2]

한 개의 연속 영상으로 다음 순서를 촬영합니다. 각 화면은 최소 3초 이상 보이게 합니다.

| 순서 | 화면/동작 | 합격 관찰 기준 | 실패 시 멈추고 남길 증거 |
|---|---|---|---|
| 1 | 앱 실행 → 합성 기사 로그인 → 홈에서 **전체 작업 목록** | 앱이 종료되지 않고 목록/빈 상태/오류 화면 중 하나가 표시됨. 아파트·증상 누락 시에도 `undefined`가 그대로 노출되지 않음. | 튕김 직전/직후 화면과 시간 |
| 2 | 작업 일정 → **미작업·이월** → 합성 접수 선택 → **출발** | 위치 동의 모달이 열리고, 동의 저장 실패 시 출발 성공처럼 진행하지 않고 오류가 표시됨. 동의 후에는 위치 권한 요청/출발 상태가 표시됨. | “Unable to transform response from server”, 오류 alert, 종료 화면 |
| 3 | 동일 합성 접수 → **점검표** | 고객/아파트/증상 화면이 표시되고 점검표가 종료되지 않음. | 튕김 화면 또는 `undefined` 노출 화면 |

이번 재현에서는 견적 제출·고객 발송·운영 접수 변경을 수행하지 않습니다. 세 경로가 끝나면 녹화를 중지하고 원본 MP4를 보관합니다.

## 5. logcat 수집

녹화를 시작하기 전에 사장님 PC의 terminal/명령 프롬프트에서 아래를 실행합니다. 녹화 종료 후 `Ctrl+C`로 종료합니다.

### Windows Command Prompt

```bat
adb logcat -c
adb logcat -v threadtime AndroidRuntime:E ReactNativeJS:V Expo:V *:S > FET_v1.1.37_code37_logcat.txt
```

### macOS / Linux

```bash
adb logcat -c
adb logcat -v threadtime AndroidRuntime:E ReactNativeJS:V Expo:V '*:S' > FET_v1.1.37_code37_logcat.txt
```

종료 뒤 다음 세 파일만 전달하면 됩니다.

| 파일 | 목적 |
|---|---|
| 원본 화면 녹화 MP4 | 목록·출발·점검표 실제 동작/종료 여부 |
| `FET_v1.1.37_code37_logcat.txt` | AndroidRuntime/ReactNativeJS stack과 발생 시각 |
| 앱 정보 화면 또는 APK 설치 화면 1장 | 실제 설치 version `1.1.37` / code `37` 식별 |

ADB를 쓸 PC가 전혀 없다면 화면 녹화와 앱 정보 화면만 보내 주세요. 그 경우 **영상 확인은 가능하지만 실제 crash stack/logcat 확인은 미실시**로 남습니다.

## References

[1] [Android Debug Bridge (adb) — Android Developers](https://developer.android.com/tools/adb)

[2] [Configure on-device developer options — Android Developers](https://developer.android.com/studio/debug/dev-options)
