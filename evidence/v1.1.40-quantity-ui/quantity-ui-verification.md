# v1.1.40 기사 견적 수량 입력 UI 검증

> 이 문서는 source·Android export 기반의 **레이아웃 검증 기록**입니다. Android 실기기 화면 캡처나 실제 입력 결과가 아니며, 해당 검증은 새 APK 설치 후 별도로 수행해야 합니다.

## 변경 범위

`app/tech-estimate.tsx`의 견적 항목 수량 제어부만 변경했다. `changeLineQuantity()`의 견적 엔진 호출, `saveDraftForCurrentTechEstimateScope()`의 actor/request scoped 초안 저장, code 39의 ImagePicker 동적 로드 구현은 변경하지 않았다. 홈페이지·공용 단가 DB·운영 고객·SMS 경로는 수정하지 않았다.

| 제어 요소 | code 39 | v1.1.40 | 확인 목적 |
|---|---:|---:|---|
| 수량 입력 높이 | 30pt | **48pt** | Android 입력 터치·세로 여유 |
| 수량 입력 너비 | 38pt | **64pt** (최소 60pt) | `1`, `2`, `3`, `7`, `10` 가독성 |
| 수량 숫자 | 13pt | **18pt / 800** | 숫자 대비·가독성 |
| ± 버튼 | 30×30pt | **48×48pt** | 터치 영역·기호 가독성 |
| ± 기호 | 17pt | **22pt / 900** | 증감 조작 식별 |
| Android 정렬 | 기본 padding | `paddingVertical: 0`, `includeFontPadding: false`, `textAlignVertical: "center"` | 세로 중앙 정렬 |
| 접근성 확대 | 제한 없음 | `maxFontSizeMultiplier={1.3}` + lineHeight 여유 | 130% 글꼴 확대에서 line-height 잘림 방지 |

React Native 공식 Text Style 문서는 Android에서 `includeFontPadding: false`와 `textAlignVertical: "center"` 조합이 세로 중앙에서의 폰트 여백·정렬 문제를 줄일 수 있다고 설명한다. [1]

## 실행 결과

| 검증 | 결과 |
|---|---|
| 수량 UI source 계약 | PASS — 48pt 버튼, 64pt/최소 60pt 입력, 18pt bold, Android 중앙 정렬 속성 확인 |
| 수량 1·2·3·7·10 130% 기하 검증 | PASS — 보수적 한 글자 폭 가정에서 64pt 입력의 사용 가능 폭(56pt) 이내 |
| 수량 엔진·actor scoped 초안 | PASS — Vitest 25건 중 engine 15, actor scope 10 |
| code 39 ImagePicker 화면 계약 | PASS — 8건 |
| Android JS export | PASS — Expo SDK 54 Android export 생성 |
| Android 실기기 수량 입력·사진 첨부 | **미실시** |

## 실기기 검수 화면 요청

새 code 40 APK를 code 39 위에 업데이트한 뒤, `REVIEW-810001`의 견적 화면에서 한 화면에 수량 `1`, `2`, `3`, `7`, `10` 중 가능한 값과 ± 버튼이 보이도록 캡처한다. 이어서 수량 하나를 변경해 소계·합계가 바뀐 화면, 초안 저장 후 다시 연 화면, 점검표 사진 첨부(카메라/앨범 열기 후 취소 가능) 결과를 별도로 확인한다. 종료·오류·잘림은 통과로 기록하지 않는다.

## References

[1]: https://reactnative.dev/docs/text-style-props "React Native Text Style Props — includeFontPadding 및 textAlignVertical"
