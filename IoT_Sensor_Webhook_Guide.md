# IoT 누수센서 연동 가이드 (퓨처에너지 난방케어)

본 문서는 향후 실제 IoT 누수센서 제품/업체의 API 또는 웹훅을 본 앱에 연결할 때 참고하는 기술 가이드입니다. 현재는 실제 센서 없이 **데모 방식**으로 동작하며, 관리자 화면의 "누수 감지 테스트" 버튼으로 누수 상황을 시뮬레이션할 수 있습니다.

---

## 1. 데이터 구조

누수센서 정보는 `leak_sensors` 테이블에, 센서가 보내온 통신 이벤트는 `sensor_events` 테이블에 저장됩니다.

### leak_sensors (센서 마스터)

| 컬럼 | 설명 |
|------|------|
| `sensorUid` | 센서 고유 ID (업체 발급, 연동 키) |
| `sensorName` | 센서 이름 (예: 분배기 하단 센서) |
| `installLocation` | 설치 위치 (예: 분배기 하단) |
| `customerName` / `phoneNumber` | 고객 이름 / 휴대폰 번호 |
| `apartmentName` / `dong` / `ho` | 아파트명 / 동 / 호수 |
| `status` | 현재 상태 (정상 / 누수감지 / 배터리부족 / 통신끊김 / 점검필요) |
| `batteryLevel` | 배터리 잔량 (0~100) |
| `lastCommAt` | 마지막 통신 시간 |
| `leakDetectedAt` | 누수 감지 시간 |
| `technicianId` / `adminMemo` / `isResolved` | 배정 기사 / 처리 메모 / 처리 완료 여부 |

### sensor_events (통신 이력)

| 컬럼 | 설명 |
|------|------|
| `sensorUid` | 센서 고유 ID |
| `leakDetected` | 누수 여부 (true/false) |
| `batteryLevel` | 배터리 잔량 |
| `reportedAt` | 센서 보고 시간 |
| `source` | 데이터 출처 (WEBHOOK / DEMO_TEST / API) |
| `rawPayload` | 수신한 원본 JSON (디버깅/추적용) |

---

## 2. 웹훅 엔드포인트

외부 센서 업체가 상태 변화를 전송할 수 있도록 REST 엔드포인트를 제공합니다.

```
POST /api/sensor-webhook
Content-Type: application/json
```

### 요청 본문 (JSON)

| 필드 | 필수 | 설명 | 허용 별칭 |
|------|------|------|-----------|
| `sensorUid` | 필수 | 센서 고유 ID | `sensor_uid`, `sensorId` |
| `leakDetected` | 필수 | 누수 여부 (true/false) | `leak_detected`, `leak` |
| `batteryLevel` | 선택 | 배터리 잔량 0~100 | `battery_level`, `battery` |
| `lastCommAt` | 선택 | 마지막 통신 시간 (ISO8601) | `last_comm_at`, `lastCommunication` |

> 센서 업체마다 필드명이 다를 수 있어 위와 같이 약식 별칭도 함께 허용합니다. 미설정 시 `lastCommAt`은 수신 시각으로 자동 기록됩니다.

### 요청 예시

```bash
curl -X POST https://<배포도메인>/api/sensor-webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <발급한 시크릿>" \
  -d '{
    "sensorUid": "SENSOR-DEMO-001",
    "leakDetected": true,
    "batteryLevel": 87,
    "lastCommAt": "2026-06-05T09:00:00Z"
  }'
```

### 응답

```json
{ "ok": true, "sensorUid": "SENSOR-DEMO-001", "status": "누수감지", "sms": { ... } }
```

| HTTP 코드 | 의미 |
|-----------|------|
| 200 | 정상 처리 (상태 갱신 + 이벤트 기록, 누수 시 SMS 발송) |
| 400 | `sensorUid` 누락 |
| 401 | 시크릿 불일치 (인증 실패) |
| 404 | 미등록 센서 (이벤트는 추적용으로 기록됨) |
| 500 | 서버 처리 오류 |

---

## 3. 상태 자동 판정 로직

웹훅이 데이터를 받으면 다음 우선순위로 상태를 결정합니다.

1. `leakDetected = true` → **누수감지** (+ 고객/관리자에게 SMS 자동 발송)
2. `batteryLevel <= 20` → **배터리부족**
3. 그 외 → **정상**

> "통신끊김"과 "점검필요"는 일정 시간 통신이 없거나 관리자가 수동 지정하는 상태로, 실제 센서 연동 시 별도 스케줄러(예: 마지막 통신 후 N시간 경과)로 확장할 수 있습니다.

---

## 4. 보안 (웹훅 시크릿)

환경변수 `SENSOR_WEBHOOK_SECRET`을 설정하면, 웹훅 요청 시 `X-Webhook-Secret` 헤더 값이 일치해야만 처리됩니다. 미설정 시(데모/개발 단계)에는 인증을 건너뜁니다. **실제 운영 전에는 반드시 시크릿을 설정**하시기 바랍니다. (앱 설정 → Secrets 패널에서 등록)

---

## 5. SMS 자동 발송 (Solapi)

누수가 감지되면 고객과 관리자에게 아래 형식의 문자가 자동 발송됩니다.

```
[퓨처에너지 난방케어]
누수 감지 알림입니다.
{아파트명} {동}동 {호수}호의 {설치 위치}에서 누수가 감지되었습니다.
즉시 확인하거나 고객센터로 연락해 주세요.
```

발송에는 아래 환경변수가 필요합니다.

| 환경변수 | 설명 |
|----------|------|
| `SOLAPI_API_KEY` | Solapi API Key |
| `SOLAPI_API_SECRET` | Solapi API Secret |
| `SOLAPI_SENDER` | 사전 등록된 발신번호 |
| `ADMIN_ALERT_PHONE` | (선택) 관리자 수신번호. 미설정 시 관리자 발송은 생략 |

> 주의: Solapi는 발송 서버 IP를 허용 목록으로 관리합니다. 실제 운영 서버의 고정 IP를 Solapi 콘솔에 등록해야 발송이 정상 동작합니다. 자격증명이 없거나 유효하지 않으면 발송은 자동으로 건너뛰며, 앱과 상태 갱신은 정상 동작합니다.

---

## 6. 실제 센서 연동 시 체크리스트

- [ ] 센서 업체로부터 발급받은 `sensorUid`를 `leak_sensors` 테이블에 등록 (관리자 기능 확장 가능)
- [ ] 업체 웹훅/콜백 설정에 본 앱의 `POST /api/sensor-webhook` URL 등록
- [ ] `SENSOR_WEBHOOK_SECRET` 설정 및 업체 헤더에 동일 값 전달
- [ ] `SOLAPI_*` 자격증명 등록 및 운영 서버 IP를 Solapi에 허용 등록
- [ ] 업체 페이로드 필드명이 본 문서의 별칭과 다를 경우 `server/webhook.ts`에서 매핑 추가
