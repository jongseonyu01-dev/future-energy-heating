# Android v1.1.38 / code 38 실기기 검수 절차

## 설치 원칙

기존 `com.futureenergy.heatingcare` 앱을 **삭제하지 않습니다.** `futureenergytech-review-v1.1.38-code38.apk`를 내려받아 기존 앱 위에 설치합니다. package와 v2 signer가 기존 설치본과 같고 code `38`이 code `37`보다 높으므로 Android는 업데이트 설치로 처리해야 합니다.

| 설치 후 확인 | 기준 |
|---|---|
| 앱 정보 버전 | `1.1.38` / code `38` |
| APK SHA-256 | `20be98a8cf3211d691424ff13f1a224e0a56d1f116eba2e8ee6e5ac596750eb5` |
| 로그인 | 합성 검수 계정 `review-tech` / `review-only`만 사용 |
| 연결 대상 | `futureenergytech-2dhinw2q6-futureenergytech.vercel.app` 합성 review API |

설치가 실패하면 앱을 삭제하지 말고 설치 오류 화면, 기존 앱 정보 화면, Android 버전을 촬영합니다.

## 녹화와 실행 순서

휴대폰 기본 화면 녹화를 시작한 뒤, 한 개의 연속 영상으로 아래 순서를 수행합니다. 각 단계의 결과 화면을 약 3초 이상 남깁니다.

| 순서 | 조작 | 정상 관찰 기준 | 실패 시 남길 장면 |
|---|---|---|---|
| 1 | 로그인 → 홈 → **전체 작업 목록** | 앱이 종료되지 않고, **합성 접수 `810001`(표시 접수번호 `REVIEW-810001`)이 목록 카드에 실제 표시**되며 `undefined`가 노출되지 않음 | **빈 목록·오류 화면도 실패**로 기록. 종료 직전과 홈 복귀/오류 화면을 남김 |
| 2 | 작업 일정 → **미작업·이월** | 합성 이월 접수 1건이 표시됨 | 빈 목록 또는 오류 화면 |
| 3 | 이월 접수 → **출발** | 동의 안내 후 저장 성공·인증된 재조회가 끝난 뒤 출발 상태/위치 권한 단계로 진행 | 동의 저장 실패, `Unable to transform response from server`, 종료 화면 |
| 4 | 같은 접수 → **점검표** | 아파트·증상·점검표 화면이 종료 없이 표시됨 | 종료 또는 `undefined` 화면 |
| 5 | **견적 작성** | 합성 접수 기반 견적 화면이 열림 | 종료·오류 화면 |
| 6 | 임시저장 후 앱 종료·재실행 → 같은 접수 → **초안 재열기** | 품목·수량·단가·메모·합계가 유지됨 | 빈 초안·다른 접수 초안·오류 화면 |

견적 제출, 고객 발송, 운영 접수 수정은 하지 않습니다.

## 같은 시점의 logcat

녹화를 시작하기 직전에, 휴대폰이 USB debugging 허용 상태로 연결된 **검수 PC**에서 아래 명령을 실행합니다. Android는 `adb devices -l`에서 기기가 `device`로 보일 때만 logcat을 수집할 수 있습니다.[1]

```text
adb devices -l
adb logcat -c
```

Windows Command Prompt:

```bat
adb logcat -v threadtime AndroidRuntime:E ReactNativeJS:V Expo:V *:S > FET_v1.1.38_code38_logcat.txt
```

macOS/Linux:

```bash
adb logcat -v threadtime AndroidRuntime:E ReactNativeJS:V Expo:V '*:S' > FET_v1.1.38_code38_logcat.txt
```

오류나 종료가 생기면 즉시 녹화를 끝내지 말고 해당 화면을 3초 남긴 뒤 logcat을 `Ctrl+C`로 저장합니다. 제출할 파일은 원본 MP4, `FET_v1.1.38_code38_logcat.txt`, 앱 정보 화면 1장입니다. ADB를 쓸 PC가 없으면 MP4와 앱 정보 화면만 제출하고 crash stack/logcat은 **미실시**로 구분합니다.

> **판정 원칙:** 전체 작업 목록에서 `810001`/`REVIEW-810001`이 보이지 않으면, 앱이 종료되지 않았더라도 이번 검수는 통과가 아닙니다. 빈 목록과 오류 화면은 모두 실패 증거로 남깁니다.

## 검수 경계

이 APK는 단일 합성 review API를 사용하며 운영 DB·운영 고객·실제 SMS·운영 홈페이지 견적·공용 단가와 분리돼 있습니다. 운영 게시와 TestFlight 제출은 보류 상태입니다.

## References

[1] [Android Debug Bridge (adb) — Android Developers](https://developer.android.com/tools/adb)

[2] [Configure on-device developer options — Android Developers](https://developer.android.com/studio/debug/dev-options)
