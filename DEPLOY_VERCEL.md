# 퓨처에너지테크 난방케어 — Vercel 배포 가이드

이 문서는 현재 소스코드를 **기존 Vercel 프로젝트**(정식 도메인 `https://futureenergytech.co.kr` 연결)에 배포해, 고객 위치 추적(`/track`), 위치 API(`/api/location`), 네이버 지도, SOLAPI 문자 발송이 정식 도메인에서 정상 동작하도록 하는 절차를 설명합니다.

---

## 1. 프로젝트 구성 요약

| 구분 | 경로 | 설명 |
|------|------|------|
| 서버리스 진입점 | `api/index.ts` | 모든 요청을 받는 Vercel 함수. 내부에서 Express 앱(`createApp`)을 실행 |
| Express 앱 | `server/_core/app.ts` | 라우트 등록(트래킹/위치 API/문자/tRPC). 로컬·Vercel 공용 |
| 로컬 실행 | `server/_core/index.ts` | 로컬에서 `createApp()` 후 직접 listen |
| 라우팅 설정 | `vercel.json` | 모든 경로를 `api/index.ts`로 rewrite, `public/**` 포함 |
| 고객 화면 | `public/web/*.html` | 홈페이지, track 페이지, 관리자/기사/고객 화면 |
| 트래킹 링크 | `server/routers.ts`, `server/web-routes.ts` | `SITE_URL` 기준 `https://futureenergytech.co.kr/track/...` 생성 |
| 문자 발송 | `server/notification.ts` | SOLAPI 연동(환경변수만 필요, 키는 코드에 없음) |

핵심 동작 경로는 다음과 같습니다.

- `GET /` → 홈페이지(`public/web/index.html`)
- `GET /track/:code` → 위치 확인 페이지(네이버 지도 Client ID 자동 주입)
- `GET /api/location/session/:code` → 위치 세션 정보(JSON)
- `POST /api/location/update` → 기사 위치 업데이트(30초 간격)
- `POST /api/location/stop` → 도착/취소 처리
- `POST /api/location/start-by-admin` → 관리자 위치 공유 시작 + 문자 발송

---

## 2. 사전 준비물

배포 전에 다음 값을 준비하세요. 비밀값은 **코드/깃에 절대 넣지 말고** Vercel 환경변수에만 입력합니다.

| 항목 | 필수 | 비고 |
|------|------|------|
| MySQL 접속 문자열(`DATABASE_URL`) | 필수 | 위치 세션/접수 데이터 저장. 외부 MySQL(PlanetScale 등) 또는 기존 DB |
| SOLAPI API Key/Secret/발신번호 | 필수 | 문자 발송 |
| 네이버 지도 Client ID | 필수 | `8rfi2gmb9q` (Web 서비스 URL에 정식 도메인 등록됨) |
| 정식 도메인 | 필수 | `futureenergytech.co.kr` (이미 Vercel 연결됨) |

> 데이터베이스가 없으면 위치 세션이 저장되지 않아 track 페이지가 "세션 없음"으로 표시됩니다. 반드시 `DATABASE_URL`을 연결하세요.

---

## 3. 배포 방법 A — GitHub 연동 (권장)

이 방식은 GitHub에 푸시하면 Vercel이 자동 재배포합니다.

1. **GitHub 저장소를 Vercel 프로젝트에 연결**
   - Vercel 대시보드 → 해당 프로젝트(현재 `futureenergytech.co.kr` 연결된 프로젝트) → **Settings → Git** 으로 이동합니다.
   - 제공된 GitHub 저장소를 연결합니다. 이미 다른 저장소가 연결돼 있다면, 새 저장소로 교체하거나 이 저장소를 Production Branch로 지정합니다.
2. **환경변수 등록** (아래 4번 참조)
3. **배포 트리거**
   - 저장소 기본 브랜치(`main`)에 푸시하거나, Vercel 대시보드에서 **Redeploy** 를 누릅니다.
4. **빌드 설정 확인**
   - Framework Preset: **Other**
   - Build Command: 비워두거나 기본값 (vercel.json의 `builds`가 우선 적용됩니다)
   - Output: vercel.json이 서버리스 함수로 처리하므로 별도 Output 디렉터리 설정 불필요

---

## 4. Vercel 환경변수 등록

Vercel → 프로젝트 → **Settings → Environment Variables** 에서 아래를 등록합니다.
적용 환경은 **Production, Preview, Development** 를 모두 체크하는 것을 권장합니다.

| Key | Value (예시) | 필수 |
|-----|--------------|------|
| `SITE_URL` | `https://futureenergytech.co.kr` | 필수 |
| `NAVER_MAP_CLIENT_ID` | `8rfi2gmb9q` | 필수 |
| `DATABASE_URL` | `mysql://user:pass@host:3306/db` | 필수 |
| `SOLAPI_API_KEY` | (발급값) | 필수 |
| `SOLAPI_API_SECRET` | (발급값) | 필수 |
| `SOLAPI_SENDER` | `0312345678` | 필수 |
| `SOLAPI_ALIMTALK_ENABLED` | `false` | 선택 |
| `SOLAPI_KAKAO_PFID` | (발급값) | 선택 |
| `JWT_SECRET` | (임의 강한 문자열) | 로그인 사용 시 |
| `OAUTH_SERVER_URL` | (인증 서버) | 로그인 사용 시 |
| `VITE_APP_ID` | (앱 ID) | 로그인 사용 시 |
| `OWNER_OPEN_ID` | (관리자 식별자) | 로그인 사용 시 |
| `SENSOR_WEBHOOK_SECRET` | (임의 문자열) | 센서 사용 시 |

전체 목록은 저장소 루트의 `ENV_VARIABLES.txt` 파일을 참고하세요.

---

## 5. 도메인 / www 리다이렉트 설정 (중요)

요구사항: **www 없이** `https://futureenergytech.co.kr` 기준으로 통일, 강제 www 리다이렉트 금지.

1. Vercel → 프로젝트 → **Settings → Domains**
2. `futureenergytech.co.kr` 를 **Primary(기본)** 도메인으로 지정합니다.
3. 만약 `www.futureenergytech.co.kr` 가 등록돼 있고 **www → 루트로의 리다이렉트가 아니라, 루트 → www로 리다이렉트** 되도록 설정돼 있다면, 그 리다이렉트 방향을 제거하거나 반대로(www → 루트) 바꿉니다.
   - 현재 문제: 루트(`futureenergytech.co.kr`)가 308로 `www`로 강제 이동되어 지도 인증 도메인이 어긋남.
   - 목표: 루트 도메인이 리다이렉트 없이 직접 서비스되도록 설정.
4. 네이버 클라우드 Maps의 Web 서비스 URL에는 `https://futureenergytech.co.kr` 만 등록돼 있어야 합니다(www 미등록 상태 유지).

---

## 6. 배포 후 검증 체크리스트

배포가 끝나면 아래를 순서대로 확인하세요.

1. `https://futureenergytech.co.kr/` → 홈페이지가 리다이렉트 없이 표시되는가
2. `https://futureenergytech.co.kr/api/health` → `{"ok":true,...}` JSON 응답
3. 관리자/기사 기능으로 위치 공유를 시작해 실제 트래킹 링크를 발급
4. 발급된 `https://futureenergytech.co.kr/track/{코드}` 접속 →
   - 네이버 지도 표시
   - 기사 위치 마커 표시
   - 목적지 마커 표시
   - ETA(예상 도착) 표시
   - "위치 공유 중" / "도착" 상태 표시
5. 고객 문자에 포함된 링크가 `https://futureenergytech.co.kr/track/...` 형식인지 확인 (manus.space 미노출)

---

## 7. 로컬에서 먼저 확인하기 (선택)

```bash
# 1) 의존성 설치
pnpm install

# 2) .env 파일 생성 후 ENV_VARIABLES.txt의 값을 채움 (이 파일은 git에 올라가지 않음)

# 3) 서버 실행 (로컬 3000 포트)
pnpm dev:server

# 4) 확인
curl http://localhost:3000/api/health
curl http://localhost:3000/track/TESTCODE | grep NAVER_MAP_CLIENT_ID
```

---

## 8. 알아두어야 할 제약 (정직한 안내)

- **데이터베이스 / 로그인 의존성**: 위치 추적·문자·지도(고객용 핵심 7대 기능)는 `DATABASE_URL`만 연결하면 Vercel에서 동작합니다. 다만 **직원/관리자 로그인(OAuth)** 은 별도 인증 서버(`OAUTH_SERVER_URL`)에 의존하므로, Vercel 단독 환경에서는 추가 검토가 필요할 수 있습니다.
- **서버리스 특성**: Vercel 함수는 요청 시 실행되는 구조라, 상시 실행 백그라운드 작업(예: 주기적 폴링)은 적합하지 않습니다. 기사 위치 업데이트는 기사 앱/브라우저가 30초마다 POST하는 방식이라 서버리스에서도 정상 동작합니다.
- **정적 파일**: `public/**` 가 `vercel.json`의 `includeFiles`로 함수에 포함되어 track 페이지 등이 정상 서빙됩니다.

---

문의나 추가 설정이 필요하면, 배포 결과(빌드 로그 또는 접속 화면)를 공유해 주세요.
