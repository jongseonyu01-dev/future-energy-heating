# 운영 code 42 APK 업로드 진행 기록

## 승인 범위

사용자는 `com.futureenergy.heatingcare` v1.1.42 / versionCode 42 APK의 운영 `/downloads/releases/` 업로드와 `/download/driver/latest` metadata 등록을 명시적으로 승인했다. 홈페이지 견적·공용 단가·고객/SMS 데이터는 변경 대상이 아니다.

## 파일 검증

| 항목 | 값 |
|---|---|
| APK SHA-256 | `5cb1a2cf1274f450d923977a46ec0c7bbd9ba264b176e00f05731e331670b086` |
| 파일 크기 | `94,025,225` bytes |
| package | `com.futureenergy.heatingcare` |
| version | `1.1.42` / code `42` |
| signing certificate SHA-256 | `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |

## 전송 상태

- 본사 관리자 브라우저 세션의 release API 권한은 `200`으로 확인했다.
- 브라우저는 임시 CORS bridge에서 APK를 읽고 SHA-256 일치 후 운영 upload endpoint에 전송을 시작했다.
- 2026-09-14 13:51 GMT 시점 page DOM 상태는 `uploading`이며, release metadata 등록 완료 여부는 아직 확인되지 않았다.
- 이 문서는 token·signed URL·고객 데이터는 기록하지 않는다.
