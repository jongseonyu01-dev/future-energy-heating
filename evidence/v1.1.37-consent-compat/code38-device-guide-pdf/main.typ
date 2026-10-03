// Native professional report entry.
// Prepared projects receive report-theme.typ beside this file.

#import "report-theme.typ": report-accent, report-theme

#show: report-theme.with(
  title: "Android code 38 실기기 검수 안내",
  author: "퓨처에너지테크 검수용",
  rhythm: "report",
  running-header: true,
)

#set text(font: ("Noto Sans CJK KR", "Noto Sans CJK JP"))
#set page(margin: (top: 1.5cm, bottom: 1.35cm, x: 1.65cm))
#set par(first-line-indent: 0em, spacing: 0.44em)

#align(center)[
  #text(size: 20pt, weight: "bold", fill: report-accent)[Android code 38 실기기 검수 안내]
  #v(0.35em)
  #text(size: 10pt, fill: luma(85))[삭제 없는 업데이트 설치 · 합성 접수 810001 필수 확인 · 오류 시점 logcat]
]

= 1. 설치와 통과 기준

기존 `com.futureenergy.heatingcare` 앱은 *삭제하지 않습니다.* `futureenergytech-review-v1.1.38-code38.apk`를 기존 설치본 위에 업데이트합니다. 설치 후 앱 정보에서 `1.1.38 / code 38`을 확인하고, 합성 검수 계정 `review-tech` / `review-only`로 로그인합니다.

#table(
  columns: (17%, 30%, 53%),
  inset: 5pt,
  stroke: 0.4pt + luma(190),
  fill: (x, y) => if y == 0 { luma(238) },
  [단계], [조작], [통과 기준과 실패 증거],
  [1], [홈 → *전체 작업 목록*], [*합성 접수 `810001`* / 표시 접수번호 `REVIEW-810001` 카드가 실제 보이면 통과. 빈 목록·오류 화면·강제 종료는 모두 실패로 기록.],
  [2], [작업 일정 → *미작업·이월*], [`810001` 합성 접수가 표시되면 통과.],
  [3], [접수 선택 → *출발*], [동의 저장 성공 뒤 인증된 재조회가 완료된 후 출발/위치 권한 단계로 이동. 저장·재조회 실패 또는 동의 없음이면 출발하면 안 됨.],
  [4], [같은 접수 → *점검표*], [아파트·증상·점검표가 종료 없이 표시되고 `undefined`가 보이지 않음.],
  [5], [*견적 작성*], [합성 접수 기반 견적 화면이 열림. 고객 발송·견적 제출은 하지 않음.],
  [6], [임시저장 → 앱 종료·재실행 → *초안 재열기*], [같은 접수의 품목·수량·단가·메모·합계가 유지됨.],
)

> #strong[판정:] 전체 작업 목록에 `810001` 또는 `REVIEW-810001`이 보이지 않으면 통과가 아닙니다. 앱이 종료되지 않아도 빈 목록 또는 오류 화면은 실패 증거입니다.

화면 녹화를 먼저 시작하고 위 여섯 단계를 한 개의 연속 영상으로 실행합니다. 각 결과 화면은 약 3초 이상 남깁니다. 오류·종료가 나면 즉시 녹화를 멈추지 말고 해당 화면을 3초 남긴 뒤 다음 페이지의 logcat을 저장합니다.

#pagebreak()

= 2. 같은 시점의 logcat 수집

휴대폰을 USB debugging 허용 상태로 검수 PC에 연결한 뒤, 먼저 아래 명령으로 `device` 상태를 확인합니다. `unauthorized` 또는 빈 목록이면 휴대폰에서 RSA 허용을 완료한 뒤 다시 확인합니다.[1]

```text
adb devices -l
adb logcat -c
```

== Windows Command Prompt

아래는 한 명령이며, `^`는 Windows Command Prompt의 줄연속 문자입니다. 세 줄을 그대로 복사·실행하면 `FET_v1.1.38_code38_logcat.txt`에 완전한 로그가 저장됩니다.

```bat
adb logcat -v threadtime ^
  AndroidRuntime:E ReactNativeJS:V Expo:V *:S ^
  > FET_v1.1.38_code38_logcat.txt
```

== macOS / Linux Terminal

아래는 한 명령이며, `\`는 shell의 줄연속 문자입니다. 세 줄을 그대로 복사·실행합니다.

```bash
adb logcat -v threadtime \
  AndroidRuntime:E ReactNativeJS:V Expo:V '*:S' \
  > FET_v1.1.38_code38_logcat.txt
```

여섯 단계를 끝내거나 오류가 난 뒤 terminal에서 `Ctrl+C`를 눌러 로그를 저장합니다. 제출할 자료는 원본 화면 녹화 MP4, `FET_v1.1.38_code38_logcat.txt`, 앱 정보 화면 1장입니다. ADB를 실행할 PC가 없으면 MP4와 앱 정보 화면만 제출하고 logcat은 #strong[미실시]로 기록합니다.

이 APK는 단일 합성 review API를 사용합니다. 운영 홈페이지 견적·공용 단가·운영 고객·실제 고객 문자는 검수 범위가 아니며, 운영 게시와 TestFlight 제출은 보류 상태입니다.

== 참고

[1] #link("https://developer.android.com/tools/adb")[Android Debug Bridge (adb) — Android Developers]
