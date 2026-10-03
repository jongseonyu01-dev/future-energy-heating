# 퓨처에너지 난방케어 - TODO

## 브랜딩
- [x] 앱 로고 생성 (난방/불꽃 테마)
- [x] 테마 색상 설정 (주황-빨강 브랜드 컬러)
- [x] app.config.ts 앱 이름 업데이트

## 백엔드 / 데이터베이스
- [x] DB 스키마 설계 (접수, 기사, 관리자)
- [x] 접수 생성 API
- [x] 접수 조회 API (접수번호/전화번호)
- [x] 관리자 접수 목록 API
- [x] 기사 배정 API
- [x] 상태 변경 API
- [x] 기사 샘플 데이터 삽입 (4명)

## 고객용 화면
- [x] 홈 화면 (4개 큰 버튼)
- [x] 난방 고장 접수 화면 (전체 폼, 7가지 증상 선택, 사진첨부, 시간선택)
- [x] 배관청소 신청 화면
- [x] 방문 예약 확인 화면 (접수번호/전화번호 조회)
- [x] 점검 결과 확인 화면

## 관리자 화면
- [x] 관리자 로그인 화면 (비밀번호 인증)
- [x] 접수 목록 화면 (상태별 필터, 건수 배지)
- [x] 접수 상세 모달
- [x] 기사 배정 기능
- [x] 처리 상태 변경 기능 (7단계)
- [x] 방문 일정 변경 기능
- [x] 점검 결과 등록 기능

## 탭 네비게이션
- [x] 홈 탭
- [x] 접수 탭 (고장접수)
- [x] 예약확인 탭
- [x] 관리자 탭

## 테스트
- [x] vitest 단위 테스트 (10개 통과)

## 추가 기능 (2차)
- [x] 기사 관리 화면 - 기사 목록 조회
- [x] 기사 관리 화면 - 기사 등록
- [x] 기사 관리 화면 - 기사 수정
- [x] 기사 관리 화면 - 기사 활성화/비활성화
- [x] 기사 관리 백엔드 API (create/update/toggle)
- [x] 관리자 비밀번호 변경 기능 (설정 화면)
- [x] SMS/카카오 알림 연동 (접수완료, 상태변경 시 발송 - Solapi)
- [x] 알림 발송 백엔드 API (notification.ts)
- [x] 관리자 화면 3개 탭 재구성 (접수관리/기사관리/설정)
- [x] 설정 화면 SMS 연동 상태 표시
- [x] 2차 기능 vitest 테스트 (11개 추가, 총 21개 통과)

## IoT 누수센서 기능 (3차)
- [x] 누수센서 DB 스키마 (leak_sensors, sensor_events 테이블)
- [x] 센서 데모 데이터 3건 (김철수=정상/이영희=배터리부족/박민수=누수감지)
- [x] 센서 목록/단건 조회 API (listAll, listByPhone, getById, getByUid)
- [x] 누수 감지 테스트 API (triggerLeakTest: 상태 변경 + 이벤트 기록 + SMS 발송)
- [x] 외부 센서 연동 웹훅 엔드포인트 (POST /api/sensor-webhook, 별칭 필드 호환, 시크릿 인증)
- [x] SMS 발송 연동 (고객+관리자, 누수 감지 메시지, dispatchLeakSms)
- [x] 고객용 '우리 집 누수센서' 화면 (홈 메뉴 추가, 전화번호 조회)
- [x] 고객 화면 누수 긴급 알림 배너 + 큰 전화 버튼
- [x] 관리자 '누수센서 관제' 화면 (상태별 통계 6종)
- [x] 관리자 누수 알림 목록 (감지 항목 상단 빨간색 강조)
- [x] 관리자 누수 감지 테스트 버튼 (웹/모바일 confirm 분기)
- [x] 기사 배정/처리 완료/처리 메모 기능
- [x] 3차 기능 vitest 테스트 (6개 추가, 총 27개 통과)
- [x] 기존 기능 유지 확인 (AS접수/배관청소/예약/관리자 모두 정상)
- [x] 동 정보 없는 주소(박민수) 표시 보완
- [x] 웹훅/SMS 연동 가이드 문서 작성 (IoT_Sensor_Webhook_Guide.md)

## 버그 수정 (4차)
- [x] 난방 고장 접수 화면 이탈/크래시 수정: expo-image-picker를 SDK54 신형 API(mediaTypes 배열)로 교체 + 사진 권한 요청 + try/catch 예외 처리
- [x] app.config.ts에 expo-image-picker 권한 플러그인(photosPermission) 추가 (네이티브 빌드 권한 누락 크래시 방지)
- [x] 수정 후 테스트 27개 통과, 웹 미리보기에서 고장접수 진입/증상선택 정상 확인
- [x] 설치된 APK 크래시 근본 원인 제거: expo-image-picker import를 report.tsx에서 완전 삭제 (네이티브 모듈 미포함 APK에서 모듈 초기화 크래시 방지)
- [x] report.tsx 전면 재작성: StyleSheet.create 기반 안전한 네이티브 코드, 사진첨부 기능 제거, 모든 기능 유지
- [x] 전체 앱 expo-image-picker 참조 0건 확인, 테스트 27개 통과

## 기능 추가 (5차)
- [x] 고장접수 화면 방문 희망 날짜 입력을 달력(Calendar) UI로 교체 (외부 라이브러리 없이 순수 RN 구현, 오늘 이전 날짜 비활성화, 선택 날짜 강조, 취소 버튼 포함)
- [x] 배관청소 신청 화면 방문 희망 날짜도 CalendarPicker UI로 교체

## 전국 지사 확장 (6차)
- [x] DB 스키마 확장: branches, app_roles, branch_region_mappings, work_reports, notices, training_materials, material_orders 테이블 추가
- [x] 서버 API 확장: 인증(로그인/계정생성), 지사 CRUD, 지역 자동배정, 기사배정, 작업보고서, 공지, 교육자료, 자재주문 API
- [x] 로그인 화면 및 AuthContext 권한 관리 (customer/technician/branch_manager/hq_admin)
- [x] 탭 레이아웃 권한별 동적 분기
- [x] 현장 기사 화면: 오늘 일정, 작업 목록, 현장 점검표(체크리스트·자재·메모·재방문·완료보고)
- [x] 지사장 화면: 대시보드, 접수관리(기사배정·일정수정·견적작성), 기사관리
- [x] 본사 관리자 반응형 대시보드: 전국 접수현황, 지사별 통계, 계정관리, 지역배정맵, 자재주문, 공지작성
- [x] 누수센서 SMS 확장: 고객+지사장+본사관리자 동시 발송
- [x] TypeScript 오류 0건, 테스트 27개 통과
- [x] 테스트 계정 3개 생성: admin(본사관리자)/ansan(안산지사장)/worker1(현장기사)
- [x] 권한별 화면 분기 검증: 3개 계정 로그인 후 각각 다른 탭/메뉴 표시 확인

## 기능 추가 (7차)
- [x] 고장접수 증상 복수 선택 체크박스 방식으로 변경 (symptoms 배열 컬럼 추가)
- [x] 기타 문의 선택 시 상세 내용 입력 필드 자동 표시
- [x] 관리자/기사/지사장 화면에서 복수 증상 표시
- [x] 접수 완료 시 고객에게 SOLAPI SMS 자동 발송 (접수유형·증상·주소 포함)
- [x] 접수 완료 시 본사 관리자에게 SOLAPI SMS 자동 발송
- [x] 배관청소 신청 완료 시에도 고객·관리자 SMS 발송
- [x] 관리자 설정 화면에 본사 관리자 휴대폰 번호 입력·수정 기능
- [x] 관리자 번호 등록 시에만 관리자 SMS 발송
- [x] 관리자 화면에 문자 발송 테스트 버튼 추가
- [x] 문자 발송 실패 시 관리자 화면에 실패 이유 표시 (SOLAPI 인증실패/IP차단/잔액부족 등)
- [x] 문자 발송 성공 여부·발송 시간 이력 화면 추가
- [x] SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER 환경변수 등록
- [x] 테스트 31개 통과, TypeScript 오류 0건

## 홈페이지 구축 (8차)
- [x] 고객용 홈페이지 메인 페이지 (반응형, 상단 메뉴, 4개 CTA 버튼)
- [x] 난방 고장 접수 웹 폼 (앱과 동일 서버 저장, SMS 자동 발송)
- [x] 배관청소 신청 웹 폼
- [x] 누수센서 서비스 소개 페이지
- [x] 지사 찾기 페이지
- [x] 자주 묻는 질문(FAQ) 페이지
- [x] 고객센터 페이지
- [x] 앱 다운로드 페이지 (안드로이드 APK + QR코드)
- [x] 본사 관리자 웹 대시보드 (전국 접수현황, 지사별 통계, 엑셀 다운로드 등)
- [x] 지사장 웹 대시보드 (자기 지사 데이터만 조회)
- [x] 반응형 디자인 (PC/태블릿/모바일)
- [x] 홈페이지 접수 완료 시 SOLAPI SMS 자동 발송
- [x] 웹 관리자 로그인 버그 수정 (dashboard.html, branch.html에서 user.role → user.appRole 수정)
- [x] admin 계정 dashboard.html 진입 검증 완료
- [x] ansan 계정 branch.html 진입 검증 완료

## SMS 테스트 기능 강화 (9차)
- [x] 서버 외부 IP 확인 (138.185.96.120)
- [x] 배포 오류 수정: web-routes.ts에서 require('express') → import express 사용
- [x] routers.ts에 sendRepairSmsTest API 추가 (고객+관리자 동시 SMS 시뮬레이션)
- [x] 앱 관리자 화면(hq-admin.tsx) SMS 탭에 고장접수 시뮬레이션 버튼 추가
- [x] 앱 SMS 탭에 SOLAPI 연동 상태 + 서버 IP 안내 표시
- [x] 웹 관리자 대시보드(dashboard.html) SMS 패널에 SOLAPI 상태카드 추가
- [x] 웹 대시보드에 관리자 번호 테스트 버튼 추가
- [x] 웹 대시보드에 고장접수 SMS 시뮬레이션 버튼 추가
- [x] 발송 성공/실패 결과 표시 (고객/관리자 각각 표시)
- [x] 발송 이력 테이블 수정 (admin.notificationLogs API 사용, 실패 사유 표시)

## 브랜딩 통일 (10차)
- [x] 명함 로고 기반 앱 아이콘 생성 (지구본+궤도 아이콘, 퓨처에너지테크)
- [x] app.config.ts 앱 이름 "퓨처에너지테크"로 업데이트
- [x] 앱 아이콘 파일 교체 (assets/images/icon.png 등)
- [x] 앱 index.tsx 헤더 회사명 "퓨처에너지테크 / Future Energy Tech" 통일
- [x] 앱 admin.tsx, hq-admin.tsx, login.tsx 회사명 업데이트
- [x] 홈페이지 전체 HTML 파일 회사명 일괄 치환 (퓨처에너지 → 퓨처에너지테크)
- [x] 홈페이지 헤더 로고 이모지 → 실제 로고 이미지로 교체
- [x] 홈페이지 푸터 연락처 실제 정보로 업데이트 (유종선, 010-5754-7310, 031-8042-7310, yerusun@naver.com, 안산시 단원구 원포공원1로 67 409호)
- [x] 긴급출동 배너 전화번호 실제 번호로 업데이트
- [x] about.html 회사소개 페이지 신규 작성 (로고, 대표소개, 연락처, 주요서비스, 특징)
- [x] reviews.html 고객후기 페이지 신규 작성 (필터, 후기 카드, 통계)
- [x] admin/login.html 로고 이미지 및 회사명 업데이트
- [x] admin/dashboard.html 사이드바 로고 이미지 및 회사명 업데이트
- [x] admin/branch.html 사이드바 로고 이미지 및 회사명 업데이트

## 실제 회사 정보 적용 (11차)
- [x] 앱 전체 임시 전화번호(1588-0000) → 031-8042-7310 교체
- [x] 앱 전체 "퓨처에너지 난방케어" → "퓨처에너지테크" 브랜드명 통일
- [x] index.tsx 긴급 연락처 섹션: 실제 전화번호 표시 + 전화 연결 기능
- [x] leak-sensor.tsx CUSTOMER_CENTER 상수 실제 번호로 교체
- [x] notification.ts SMS 메시지 템플릿 브랜드명 및 전화번호 교체
- [x] leak-sms.ts SMS 메시지 브랜드명 교체
- [x] 고객센터 탭(customer-center.tsx) 신규 추가 (대표전화/휴대전화 전화연결, 이메일, 지도, 카카오톡 준비중)
- [x] icon-symbol.tsx에 phone.circle.fill 아이콘 추가
- [x] _layout.tsx에 고객센터 탭 추가 (고객/비로그인 전용)
- [x] HTML 파일(faq, contact, download, index) 임시 전화번호 교체

## 세대별 난방 유량 관리 (16차)
- [x] DB 스키마 추가: flowRateSettings 테이블 (세대별 기준 유량 설정)
- [x] DB 스키마 추가: flowRateLogs 테이블 (유량 측정 이력)
- [x] DB 마이그레이션 실행 (pnpm db:push)
- [x] ESP32 웹훁 API 추가 (POST /api/webhook/flow-rate)
- [x] 기준 유량 이탈 감지 로직 (10분 이상 지속 시 SMS 알림)
- [x] 본사 관리자+담당 지사장 SOLAPI SMS 알림 함수
- [x] tRPC API 추가: 유량 설정 CRUD, 유량 로그 조회
- [x] 본사 관리자 앱(hq-admin.tsx) 유량 관리 탭 추가
- [x] 세대별 기준 유량/경고 범위 수정 UI
- [x] 현재 유량/압력/차압/상태 실시간 표시
- [x] 데모 테스트 버튼 (임의 유량값 전송)
- [x] 웹 관리자 대시보드(dashboard.html) 유량 관제 패널 추가
- [x] 기존 누수센서 기능 유지 확인

## 고객용 앱 난방 상태 메뉴 (17차)
- [x] 고객 앱 홈 화면에 "우리 집 난방 상태" 카드 메뉴 추가 (누수센서 아래)
- [x] HeatStatusScreen 구현 - 현재 유량, 기준 유량, 압력, 통신 상태, 마지막 측정 시간, 상태 표시
- [x] 센서 미설치 고객 안내 문구 및 설치 상담 신청 버튼
- [x] 점검 요청 버튼 (고객 → 서버 접수)
- [x] tRPC API: 고객 전화번호 기반 유량 데이터 조회
- [x] 관리자 앱 유량 관리 탭 상세 항목 보강 (점검 처리 여부, 처리 메모, 담당 지사)
- [x] DB: flowRateSettings에 inspectionStatus, inspectionMemo 컨럼 추가
- [x] 기존 누수센서/고객 접수/방문 예약/관리자/문자 알림 기능 유지 확인

## 기사 실시간 위치 공유 기능 (18차)
- [x] 백그라운드 GPS 기술 검토 및 가능 여부 분석
- [x] DB 스키마 추가: location_sessions, location_consents 테이블
- [x] 백엔드 API: 위치 세션 생성/업데이트/종료, 고객 전용 링크 생성, 만료 처리
- [x] tRPC: location.startTracking / getConsent / saveConsent / getSessionByRequest / getActiveSessions / getActiveSessionsByBranch
- [x] REST API: /api/location/update, /api/location/stop, /api/location/active, /api/location/session/:token, /track/:token
- [x] 기사용 앱 화면: 출발/도착/취소 버튼, 위치 동의 모달, 위치 전송 로직 (30초 간격)
- [x] 고객용 위치 확인 웹 페이지 (track.html): 지도, 기사 위치 마커, 예상 도착, 만료 처리
- [x] 관리자 대시보드: 이동 중 기사 현황 패널 추가
- [x] 지사장 대시보드: 소속 기사 이동 현황 패널 추가
- [x] 출발 시 고객 SMS 자동 발송 (SOLAPI, 데모 모드 지원)
- [x] 테스트 기사 계정 (worker1 / worker1234) 및 시험 방문 건 생성 (ID:60001)
- [x] 전체 흐름 API 테스트: 세션 시작→위치 업데이트→세션 조회→종료→활성 0개 확인 완료

## 앱 크래시 긴급 수정 (18-1차)
- [x] 크래시 원인 분석: expo-task-manager v56.0.17 (SDK 56용) 설치됨 → SDK 54 호환 v13.0.0으로 다운그레이드
- [x] location-tracking.ts 안전 재작성: 지연 로드 (동적 import), 앱 시작 시 자동 실행 완전 제거
- [x] tech-schedule.tsx: 앱 시작 시 포그라운드 인터벌 자동 시작 제거, 위치 권한 요청 없이 상태만 복구
- [x] app.config.ts: isAndroidForegroundServiceEnabled 제거 (스타트업 크래시 원인)
- [x] 위치 권한 거부 시 앱 종료 없이 안내 메시지만 표시
- [x] TypeScript 오류 0개, 전체 흐름 API 테스트 통과

## 위치 공유 기능 최종 수정 (19차)
- [x] 전화 접수 고객 지원: 관리자/지사장 대시보드에서 "위치 공유 시작" 버튼 추가 (앱 없이 SMS 링크 발송)
- [x] 백엔드: 관리자가 수동으로 위치 세션 시작하는 API (전화 접수 고객용) - start-by-admin / stop-by-admin
- [x] track.html를 /web 폴더에서 서빙하도록 /track/:token 라우트 정리 (preview 폴백)
- [x] track.html UI 개선: 현재 위치+예상 도착만, 과거 경로 비공개 재확인
- [x] 종료/만료 세션은 위치 좌표 비노출(HTTP 410) + 상태별 안내 표시
- [x] download.html 실제 QR코드(현재 페이지 URL) + 고객용 기능(누수/유량압력/방문이력) 반영
- [x] 홈페이지 상단 메뉴/푸터에 앱 설치 안내 링크 노출 확인 (이미 연결됨)
- [x] 전체 흐름 테스트: 시작→SMS(smsSent:true)→링크조회→도착 종료→410 만료 확인
- [x] 기존 누수센서/유량/접수/방문이력 기능 유지 확인

## 고객 접수 기능 버그 수정 (20차)
- [x] report.html 필드명 서버 스키마에 맞춤 (phoneNumber, apartmentName, detailContent, preferredDate, preferredTime)
- [x] 기타 증상 enum 위반 수정 (기타 상세는 detailContent로, symptoms에는 enum값만)
- [x] pipe-cleaning.html을 repair.create(requestType=배관청소)로 통합
- [x] 배관청소 서비스 항목을 detailContent로 전달
- [x] 난방고장 1건 실제 등록 테스트 (ID 90001 성공)
- [x] 배관청소 1건 실제 등록 테스트 (ID 90002 성공)
- [x] 관리자 화면에서 접수 노출 확인 (repair.listAll 노출 확인)
- [x] 서버 로그 최종 오류 유무 확인 (신규 오류 없음)
- [x] 테스트 데이터 정리 (90001, 90002 삭제)

## 위치코드 일회용 강화 + 커스텀 도메인 (21차)
- [x] /track/{코드} 라우트 점검 (프래그먼트 # 미사용 확인)
- [x] 위치코드를 추측 불가능한 43자 base64url(256비트) 일회용 코드로 발급
- [x] 출발 시 활성화, 도착/완료/취소 시 즉시 만료 로직 확인 (410)
- [x] 시간 초과 자동 만료 동작 확인 (expireOldLocationSessions)
- [x] 고객 화면 현재 위치+예상 도착만 노출, 과거 경로/타 고객정보 비노출 재확인
- [x] 테스트용 위치코드 1개 발급 + 실제 링크 동작 검증
- [x] baseUrl 기본값을 https://futureenergytech.co.kr 로 변경 (3곳)
- [x] 가비아 futureenergytech.co.kr 커스텀 도메인 DNS 설정값 정리
- [x] SOLAPI 알림톡 템플릿 버튼 URL 안내 (https://futureenergytech.co.kr/track/#{위치코드})

## 통합 로그인/회원 시스템 (22차)
- [ ] 현재 인증·계정 DB 구조(employees, customers 등) 점검
- [ ] 통합 users 계정 스키마 설계 (role: 본사관리자/지사장/기사/고객)
- [ ] bcrypt 비밀번호 해시 저장 (평문 금지)
- [ ] 첫 로그인 임시 비밀번호 강제 변경 (mustChangePassword)
- [ ] 로그인 API (아이디+비밀번호, 자동로그인 토큰)
- [ ] 회원가입 API (고객, 휴대폰 인증)
- [ ] 아이디 찾기 API (휴대폰 기반)
- [ ] 비밀번호 재설정 API
- [ ] 관리자 계정 발급 API (지사장/기사: 이름,휴대폰,아이디,임시비번,소속지사,권한,사용여부)
- [ ] 홈페이지 로그인 화면 (아이디/비번/로그인/아이디찾기/비번재설정/회원가입/자동로그인/비번보기)
- [ ] 홈페이지 권한별 메뉴 분리 (4종 권한)
- [ ] 앱 로그인 화면 + 권한별 화면
- [ ] 비로그인 일회용 위치링크 정상 동작 유지
- [ ] 테스트 계정 4종 생성 (관리자/지사장/기사/고객)
- [ ] 권한별 메뉴 분리 검증
- [ ] 비밀번호 재설정 테스트


## 홈페이지·앱 통합 로그인 / 권한 시스템 (21차)
- [x] 홈페이지·앱 공통 계정 DB(app_roles) 단일 관리 — 양쪽에서 가입/로그인 호환
- [x] 통합 로그인 페이지(login.html): 아이디·비밀번호·로그인·아이디찾기·비밀번호재설정·회원가입·자동로그인·비밀번호 보기/숨기기
- [x] 앱 로그인 화면(login.tsx) 보강: 비밀번호 토글, 자동 로그인, 첫 로그인 강제 변경, 아이디찾기/비번재설정/회원가입 안내
- [x] 4단계 권한 분리 (hq_admin / branch_manager / technician / customer)
- [x] 권한별 메뉴 분리: 홈페이지(dashboard/branch/tech/mypage 리다이렉트) + 앱(탭 동적 분기)
- [x] 관리자 화면 계정 발급: 이름·휴대전화·아이디·임시비번·소속지사·권한·사용여부 (createAccount API)
- [x] 첫 로그인 시 임시 비밀번호 강제 변경 (mustChangePassword 플래그 + changePassword)
- [x] 비밀번호 bcrypt 해시 저장 (평문 미저장, 레거시 해시 폴백 검증)
- [x] 고객 회원가입 휴대폰 인증 (sendVerifyCode/checkVerifyCode), 직원 계정은 관리자 직접 발급
- [x] 비로그인 고객도 일회용 위치 링크(/track/:token) 열람 가능 (인증 불요, 이동중에만 위치 노출)
- [x] userId INT 안전 범위 생성 버그 수정 (readUInt32BE → generateSafeUserId, MySQL INT 초과 방지)
- [x] 테스트 계정 4종 생성: test_admin / test_branch / test_tech / test_customer
- [x] 인증 단위 테스트 추가 (bcrypt 해싱/검증, userId 범위) — 전체 45 passed, 1 skipped
- [x] 전체 흐름 검증: 4종 로그인·권한 반환·강제 변경·비밀번호 재설정·기존 비번 거부 확인


## 실제 직원 테스트 피드백 반영 (22차)
- [ ] (1) 로그인 키보드 가림 수정 — 앱: KeyboardAvoidingView+자동 스크롤, 홈페이지: 모바일 입력칸 스크롤/뷰포트 처리
- [ ] (2) 아이디/비번 자동 대문자·자동완성·자동수정 비활성화 (앱 autoCapitalize=none 등, 홈 autocapitalize/autocorrect/spellcheck off)
- [ ] (3) 접수 워크플로우 상태 고정: 접수→지사배정→현장확인/견적→견적전달→고객승인→기사배정→일정확정→출발→도착→작업→완료→결제→후기
- [ ] (3) 견적 미승인 시 기사 출발 차단(게이팅), 승인 후 "기사 배정/일정 확정/일정 안내 발송" 버튼 노출
- [ ] (3) 관리자/지사장/기사 화면에 현재 상태 표시
- [ ] (4) 기사 앱 메인 상단 소속 정보 상시 표시(기사명/소속지사/지사장/지사연락처/오늘 배정 건수)
- [ ] (4) 본사 관리자 화면 기사별 소속 지사 표시, 지사 이동 시 즉시 반영
- [ ] (5) 기사 작업 상세에 고객 희망 날짜/시간 + 확정 날짜/시간 크게 표시(다르면 둘 다+사유)
- [ ] (5) 기사는 일정 변경 불가, 지사장/본사만 변경 가능, 변경 시 고객 자동 안내
- [ ] (6) 발송 시점 고정: 접수완료/지사배정(선택)/일정확정·변경/출발/도착/완료
- [ ] (6) 접수 건별 발송 이력(일시/종류/알림톡 성공여부/문자대체여부/수신번호/실패사유/재발송 버튼)
- [ ] (7) 기사 배정 화면 정보 보강(이름/소속/상태/오늘건수/방문예정시간/현재위치/이전작업종료예상)
- [ ] (7) 일정 충돌 시 경고창
- [ ] (8) 테스트 1: 난방 고장 전체 흐름 / 테스트 2: 배관청소 흐름 / 테스트 3: 기사 로그인·소속·키보드·대문자 확인


## 22차 작업 완료 (실제 직원 테스트 피드백 반영)
- [x] 로그인 키보드 가림/입력 방식 수정 (홈페이지 + 앱)
- [x] 앱 로그인 자동 로그인 토글 분리 (rememberMe)
- [x] 접수 워크플로우 단계 컬럼(workflow_stage) 추가 및 단계 자동 갱신
- [x] 견적 미승인 시 기사 출발(위치공유) 차단 게이팅
- [x] 견적 전달/결제완료/후기요청 단계 처리
- [x] 기사 화면 소속 지사 표시 (홈페이지 tech.html + 앱 tech-works)
- [x] 고객 희망일정/확정일정 표시
- [x] 알림톡 우선 발송 + 실패 시 문자 자동 대체, 발송 채널/대체발송 이력 기록
- [x] 발송 이력 화면에 채널(문자/알림톡) 컬럼 추가
- [x] 관리자 대시보드 기사 배정 모달(기사 선택/일정 입력/충돌 경고) 실제 동작
- [x] 지사장 화면 배정 모달 동일 수준 정비
- [x] trpc 프로시저 별칭 보정 (list→listAll, technician→technicians)
- [x] 한글 상태값/실제 필드명 매핑 보정
- [x] 전체 워크플로우 API 검증 (접수→견적→승인→배정→일정→출발→도착→완료→결제→후기)
- [x] 관리자 화면 실제 배정 동작 검증 (#120001 → 방문예정/일정확정/기사300002/06-09 14:00)
- [x] 전체 테스트 54 passed, 1 skipped

## 23차 작업 완료 (주소 선택 구조 + 네비게이션 + 위치공유 전체 점검)
- [x] 주소 선택 데이터 구성 (경기 안산 단원구 초지동 주요 아파트 + 대표 좌표)
- [x] 단계형 선택 컴포넌트(SelectField) 추가
- [x] 고객 신청 화면(report.tsx) 주소 입력을 시/도 → 시군구 → 동 → 아파트 선택 + 동/호수 직접입력으로 변경
- [x] 배관청소 신청 화면(pipe-cleaning.tsx) 동일 적용
- [x] DB repair_requests에 sido/sigungu/eupmyeondong/roadAddress/customerLat/customerLng 컬럼 추가
- [x] 서버 repair.create에서 신규 주소 필드 + 좌표 저장
- [x] formatFullAddress / formatNavAddress / getApartmentCoords 헬퍼 추가
- [x] 기사/관리자/지사/본사/점검표/예약확인 화면 주소 표시를 전체 주소로 통일
- [x] 한국 지도앱 네비게이션 유틸(navigation.ts) - 카카오/네이버/T맵 선택 + 웹 폴백
- [x] 기사앱 네비게이션 목적지를 동/호 제외 대표 주소로 연결
- [x] 기사 출발 시 좌표를 location_sessions로 복사 (목적지 마커/ETA용)
- [x] track 페이지에 네이버 지도 클라이언트 ID 주입 + 비정상값 방어 코드
- [x] track 응답 노출 필드 제한 (내부 식별자/고객전화번호 미노출)
- [x] 세션 만료 4시간 → 24시간 연장
- [x] E2E 전체 시나리오 검증 (신청 → 배정 → 출발 → 세션생성 → track조회 → 위치갱신 → 도착)

## 24차 작업 (실제 전체 시나리오 재검증 + 화면 캡처)
- [ ] 테스트 계정/E2E 스크립트 현재 상태 점검
- [ ] 고객 신청(주소 단계형 선택) API/DB 검증
- [ ] 지사/본사 기사 배정 검증
- [ ] 기사 앱 오늘 일정 표시 검증
- [ ] 네비게이션 버튼(네이버/카카오/T맵) 동작 검증
- [ ] 기사 출발 → 위치 공유 시작 검증
- [ ] 고객 위치 확인 링크/알림 발송 검증
- [ ] 고객 track 페이지 에러 없이 위치 표시 검증
- [ ] 도착 버튼 → 위치 공유 종료 검증
- [ ] 단계별 화면 캡처 확보
- [ ] 네이버 지도 클라이언트 ID 발급처/환경변수명 안내


## 24차 작업 (실제 전체 시나리오 재검증 + 발견 이슈 수정)
- [x] 고객 신청(단계형 주소: 시/도>시군구>동>아파트, 동·호수 직접입력) 실제 화면 검증
- [x] 관리자 로그인 → 신규 접수 일정 저장 → 기사(worker1) 배정 실제 검증
- [x] 기사앱 오늘 일정에 배정 오더 노출 검증
- [x] 기사앱 네비게이션 버튼 → 카카오맵(대표주소) 실행 검증
- [x] 출발 시 아파트 대표좌표를 세션 목적지(customerLat/Lng)로 전달하도록 수정
- [x] 웹 환경에서도 출발 후 카드가 '위치공유중/도착/취소'로 전환되도록 상태 갱신 수정
- [x] 고객 track 응답에서 기사 직통번호(technicianPhone) 제거 → 고객센터 안내로 대체
- [x] track 페이지 기사 전화 버튼을 회사 고객센터 버튼으로 변경
- [x] 위치 업데이트 → 고객 조회 → 도착 종료(410/ended) 흐름 검증
- [x] track 페이지 ETA(예상도착) 표시 정상 확인
- [ ] 네이버 지도 클라이언트 ID 재설정 (사용자 발급 필요) — 현재 환경변수에 도메인 URL이 잘못 입력됨


## 25차 작업 (정식 도메인 통일 + 네이버 지도 Client ID 적용)

- [x] NAVER_MAP_CLIENT_ID 환경변수에 실제 Client ID(8rfi2gmb9q) 적용
- [x] SITE_URL = https://futureenergytech.co.kr 설정
- [x] routers.ts 트래킹 링크 기본 도메인 4곳 www 제거 → 정식 도메인 통일
- [x] lib/location-tracking.ts API_BASE_URL 기본값 정식 도메인으로 통일 (manus.space 제거)
- [x] 트래킹 링크 생성 검증: https://futureenergytech.co.kr/track/{token} 확인 (vitest 5건 통과)
- [x] 정식 도메인 실측: track 페이지(HTML)는 www로 연결됨 / /api/location 은 404 / 네이버ID 미주입 = 구 배포본
- [ ] (사용자) UI Publish 버튼으로 재배포 → 새 코드/환경변수 반영
- [ ] (배포 후) 정식 도메인에서 /api/location 정상 응답 확인
- [ ] (배포 후) 정식 도메인 track 페이지에 네이버 지도/마커/ETA 표시 확인 후 캡처


## 26차 작업 (www 완전 제거 + 정식 도메인/Vercel 연결 진단)

- [x] HTML 12개 파일 메타태그(og:url, og:image, canonical)의 www.futureenergytech → futureenergytech 치환
- [x] 전체 코드 www.futureenergytech 잔존 0건 확인
- [x] SITE_URL = https://futureenergytech.co.kr (www 없음) 환경값 확인
- [x] vitest 14건 통과 (site-url, naver-map-client-id, workflow.notification)
- [x] TypeScript 0 errors
- [x] 진단: Manus 배포본(manus.space)에는 네이버ID 주입+위치API 정상. 단 정식 도메인 futureenergytech.co.kr은 server=Vercel 응답 → 별도 Vercel 프로젝트 연결로 308 www 리다이렉트 + 구버전 노출
- [ ] (사용자 결정 필요) 정식 도메인을 Manus 배포본으로 연결 OR Vercel 프로젝트 재배포


## 권한/삭제 기능 (22차)
- [x] 앱: 관리자 비밀번호 입력 로그인 화면 제거, ID/전화번호+비밀번호로 통합
- [x] 앱: 로그인 후 role별 자동 이동 (본사/지사/기사/고객)
- [x] 웹: 관리자 비밀번호 로그인 화면 제거 및 통합
- [x] DB: branches/technicians/repairRequests/customers에 isDeleted, deletedAt, deletedBy 추가
- [x] DB 마이그레이션 적용
- [x] 서버: 지사 삭제 API (이관/함께삭제 옵션, 본사만)
- [x] 서버: 기사 삭제 API (본사 전체, 지사 자기소속, 진행중 오더 체크)
- [x] 서버: 고객 삭제 API (본사 전체, 지사 자기소속, 접수 삭제/보관)
- [x] 서버: 접수/오더 삭제 API (본사 전체, 지사 자기소속)
- [x] 서버: 목록 조회 시 isDeleted=false 필터
- [x] 앱 UI: 지사/기사/고객/접수 삭제 버튼 + 확인창, 권한별 분기
- [x] 웹 UI: 본사/지사 화면 삭제 버튼 + 확인창
- [x] 웹: GitHub main 푸시
- [x] 테스트: 로그인 분기, 삭제 권한 (전체 59 passed, 1 skipped)
- [x] 체크포인트 저장

## 홈페이지·앱 삭제/회원가입 동기화 (25차)
- [x] 홈페이지 서버 삭제 API 추가 (branch/repair/technicians softDelete)
- [x] 홈페이지 회원가입 활성화 (registerCustomer/registerTechnician/registerBranch)
- [x] 홈페이지 login.html 회원가입 폼(고객/기사/지사 탭) 활성화
- [x] 본사 대시보드(dashboard.html) 접수/기사/지사 삭제 버튼 + 지사 삭제 모달(이관/함께삭제)
- [x] 지사 대시보드(branch.html) 접수 삭제 버튼 (본인 지사만)
- [x] dashboard.html buildAuthHeaders → authHeaders 통일 (기존 ReferenceError 수정)
- [x] listAccounts 응답에 technicianId 매핑 추가
- [x] 홈페이지 TypeScript 검증 통과 + GitHub main 푸시 (커밋 da62578)
- [x] 모바일 앱 전체 테스트 59 passed, 1 skipped

## 본사처리/지사배정 흐름 분리 (26차)
- [ ] DB: repair_requests에 ownerType(unassigned/headquarters/branch) 컬럼 추가
- [ ] DB 마이그레이션 적용 (pnpm db:push)
- [ ] 서버: 신규접수 기본값 ownerType=unassigned, branchId=null
- [ ] 서버: assignToHeadquarters API (ownerType=headquarters, status=본사배정)
- [ ] 서버: assignToBranch API (ownerType=branch, branchId, status=지사배정)
- [ ] 서버: listHQTechnicians API (본사 소속 기사 목록)
- [ ] 서버: 기사 일정 조회 ownerType 기반 분기 (본사기사: ownerType=headquarters, 지사기사: ownerType=branch+branchId)
- [ ] 서버: 지사 접수 목록 ownerType=branch 필터
- [ ] 앱 본사 관리자(hq-admin.tsx): 신규접수 건마다 "본사처리/지사배정" 버튼 추가
- [ ] 앱 본사 관리자: 본사처리 선택 시 본사 기사 배정 모달 (기사선택/방문일시/저장)
- [ ] 앱 본사 관리자: 지사배정 선택 시 지사 선택 드롭다운 + 배정 버튼
- [ ] 앱 기사 화면(tech-schedule.tsx): ownerType 기반 일정 조회 수정
- [ ] 홈페이지 dashboard.html: 신규접수 본사처리/지사배정 선택 UI
- [ ] 홈페이지 dashboard.html: 본사 기사 배정 모달 추가
- [ ] 홈페이지 branch.html: ownerType=branch 접수만 표시
- [ ] 테스트 A: 본사처리 전체 흐름 (신규접수→본사처리→본사기사배정→기사출발→고객문자)
- [ ] 테스트 B: 지사배정 전체 흐름 (신규접수→지사배정→지사기사배정→기사출발→고객문자)
- [ ] GitHub main 푸시 + 체크포인트 저장

## 기사 등록 소속 선택 개선 (27차)
- [x] 앱 admin.tsx: TechnicianFormModal에 소속 선택 UI 추가 (본사/지사 칩 버튼, ✓ 선택됨 표시)
- [x] 앱 admin.tsx: 기사 등록 시 selectedBranchId(null=본사) 저장
- [x] 앱 admin.tsx: 기사 배정 picker를 listAll로 변경, 본사/지사별 그룹 표시
- [x] 홈페이지 login.html: 기사 등록 폼 소속 선택을 칩 버튼 방식으로 변경
- [x] 홈페이지 login.html: '지사 미지정' 제거, '본사' 기본 선택 (branchId=null)
- [x] 홈페이지 login.html: 선택된 소속 요약 표시 박스 추가
- [x] 홈페이지 dashboard.html: 기사 배정 모달 본사/지사별 그룹 표시
- [x] 홈페이지 GitHub main 푸시 (커밋 f19d6c3)
- [x] 모바일 앱 체크포인트 저장

## 자동 로그인 제거 및 보안 강화 (28차)
- [x] 하드코딩된 계정/기본 role/자동 세션 복원 코드 탐색
- [x] 자동 로그인 코드 완전 제거 (auth-context.tsx rememberMe 기본값 false로 변경)
- [x] 앱 시작 시 저장된 토큰 유효성 서버 검증 강화 (verifyToken API 호출, 실패 시 강제 로그아웃)
- [x] 세션 버전 관리 추가 (CURRENT_SESSION_VERSION=v3, 버전 불일치 시 기존 세션 무효화)
- [x] 로그아웃 시 모든 저장소(AsyncStorage, SecureStore) 완전 초기화
- [x] Android allowBackup=false 설정 (app.config.ts)
- [x] 홈페이지 localStorage 자동 로그인 복원 코드 제거 (login.html, dashboard.html, branch.html, tech.html)
- [x] 전체 테스트 59 passed, 1 skipped 통과
- [x] 체크포인트 저장

## 견적서 발송→승인/거절→오더→기사배정→위치확인 전체 흐름 (29차)
- [ ] DB: estimates 테이블 추가 (token, status, validUntil, ownerType, branchId 등)
- [ ] DB: messageLog 테이블 추가 (messageType, sendStatus, linkUrl 등)
- [ ] DB: repairRequests에 estimateId, estimateAmount 컬럼 추가
- [ ] DB 마이그레이션 적용
- [ ] 서버: estimates CRUD API (create, getByToken, approve, reject, list)
- [ ] 서버: 고객 방문정보 입력 후 오더 생성 API
- [ ] 서버: 메시지 로그 저장 API
- [ ] 서버: track 토큰 기반 위치확인 API (기존 활용)
- [ ] 고객용 웹: /estimate/{token} 견적 확인/승인/거절 페이지
- [ ] 고객용 웹: /estimate/{token}/visit 방문정보 입력 페이지
- [ ] 홈페이지: 본사/지사 관리자 화면에 견적 발송 모달 추가
- [ ] 홈페이지: 메시지 발송 내역 패널 추가
- [ ] 앱: 본사/지사 관리자 화면에 견적 발송 UI 추가
- [ ] 앱: 기사 화면에 견적금액/요청사항 표시
- [ ] 전체 테스트 통과
- [ ] GitHub 푸시 및 체크포인트 저장

## 본사/지사 배정 흐름 구현 (30차)
- [ ] 서버: assignToHQ API (ownerType=headquarters, branchId=null)
- [ ] 서버: assignToBranch API (ownerType=branch, branchId=선택)
- [ ] 서버: 지사 목록 조회 API (branches.list)
- [ ] 홈페이지 dashboard.html: 신규접수 목록에 "본사처리/지사배정" 버튼 추가
- [ ] 홈페이지 dashboard.html: 본사처리 선택 시 본사 기사 배정 모달
- [ ] 홈페이지 dashboard.html: 지사배정 선택 시 지사 선택 드롭다운 + 배정 버튼
- [ ] 앱 hq-admin.tsx: 신규접수 목록에 "본사처리/지사배정" 버튼 추가
- [ ] 앱 hq-admin.tsx: 본사처리 선택 시 본사 기사 배정 모달
- [ ] 앱 hq-admin.tsx: 지사배정 선택 시 지사 선택 드롭다운 + 배정 버튼
- [ ] 홈페이지 branch.html: ownerType=branch 접수만 표시 확인
- [ ] 전체 테스트 통과
- [ ] GitHub 푸시 및 체크포인트 저장

## 본사/지사 배정 흐름 (작업 1번)
- [x] repairRequests 테이블 ownerType 컬럼 추가 (unassigned/headquarters/branch)
- [x] 서버 API: repair.assignToHeadquarters (ownerType=headquarters, branchId=null)
- [x] 서버 API: repair.assignToBranch (ownerType=branch, branchId=선택한 지사)
- [x] 모바일 앱 admin.tsx: RepairRequest 타입에 ownerType, branchId 필드 추가
- [x] 모바일 앱 admin.tsx: 담당 배정 섹션 UI (본사직접/지사배정 버튼, 지사 선택 목록)
- [x] 모바일 앱 admin.tsx: 접수 카드에 ownerType 배지 표시
- [x] 모바일 앱 admin.tsx: 기사 배정 섹션 ownerType 기반 필터링 (본사=본사기사만, 지사=해당지사기사만)
- [x] 홈페이지 dashboard.html: 신규접수 목록 행에 담당배정 버튼 추가
- [x] 홈페이지 dashboard.html: ownerModal (본사처리/지사배정 선택 모달) 추가
- [x] 홈페이지 dashboard.html: ownerTypeBadge 함수 추가
- [x] GitHub push (futureenergytech 레포)
- [x] 모바일 앱 checkpoint 저장

## 메뉴 정리 및 자동견적 통일 (31차)
- [x] 수기 견적 작성 메뉴 완전 제거 (본사/지사/기사/직원 모든 권한)
- [x] 본사 관리자 사이드 메뉴 정리 (요청된 메뉴 구조로 변경)
- [x] 지사 관리자 메뉴 정리 (견적 자동 생성기 중심)
- [x] 기사 화면 메뉴 정리 (현장 견적 작성 → 자동견적 연결)
- [x] 도메인 참조 통일 (manus.space 등 제거, 퓨처에너지테크.kr로 통일)
- [x] 기능 테스트 (본사/지사/기사 로그인 후 메뉴 확인)

## 수기 견적 완전 제거 및 홈페이지 버튼 정리 (32차)
- [x] 홈페이지 첫 화면 "직원 견적서 작성" 버튼 완전 제거 (index.html)
- [x] 본사 관리자 대시보드(dashboard.html) 수기 견적 작성 메뉴 제거
- [x] 지사 관리자(branch.html) 수기 견적 작성 메뉴 제거
- [x] 기사 화면(tech.html) "견적 작성하기" → "견적 자동 생성기" 버튼명 변경
- [x] 견적 자동 생성기 링크를 내부 경로(/web/admin/tech-estimate.html)로 통일
- [x] DB 기존 견적 데이터 보존 (삭제 없음)

## Play Store 출시 작업 (2단계~9단계)
- [ ] 홈페이지 로그인에서 technician 계정 서버 차단 (토큰 미발급 + 안내 문구)
- [ ] 기사용 앱에서 hq_admin/branch_manager 계정 로그인 차단
- [ ] 홈페이지 관리자 API에서 technician role 접근 차단
- [ ] 현장 사진 업로드 기능 (공사 전/중/후)
- [ ] 자동견적 생성 기능 (본사와 동일한 단가 엔진 사용)
- [ ] 견적 승인 요청 기능 (본사/지사에 승인 요청)
- [ ] 승인 후 고객 견적서 전송 버튼 활성화
- [ ] 공사 완료 처리 (자재 입력, 완료점검, 고객 확인)
- [ ] /privacy/technician 개인정보처리방침 페이지 생성
- [ ] versionCode 증가 및 EAS Build (AAB 생성)
- [ ] Play Console 등록 자료 준비 및 출시 신청
- [ ] 홈페이지에 기사용 앱 다운로드 버튼 연결 (Play Store 링크)

## 기사 앱 견적서 작성 및 본사 송출 기능 (33차)
- [x] 서버 API: estimates.techRequest (기사 현장 견적 보고 → 본사/지사 SMS 알림)
- [x] 서버 API: estimates.listMyTechRequests (기사 본인 보고 목록 조회)
- [x] 앱: app/tech-estimate.tsx 신규 생성 (단가표 항목 선택 → 견적 작성 → 본사 보고)
- [x] 앱: tech-works.tsx 헤더에 "견적 작성" 버튼 추가
- [x] 앱: work-report.tsx 헤더에 "현장견적" 버튼 추가 (고객정보 자동 전달)
- [x] 체크포인트 저장 및 GitHub 푸시

## 기사앱 자동견적 홈페이지 정합성 후보 (2026-09-12)
- [x] 홈페이지 운영 견적 방식·기사앱 기준 commit·단가 조회·기존 draft 저장 경로를 read-only 대조하고 홈페이지/공용 단가 DB 비변경 근거 기록
- [x] 품목·규격·단위·표준가·단체가·시공 조건별 홈페이지-기사앱 비교표를 작성하고 구형 임시 항목의 앱 노출 원인·제외 범위를 확정
- [x] 기사앱에 2~10구 분배기 단일 선택·자동 품목·표준/단체 가격 구분·평형별 배관청소·분배기/독립 시공 단가·와이파이형/V타입 독립 선택을 홈페이지 계약에 맞춰 구현
- [x] 단가/필수 가격 구분 조회 실패 시 0원·구형 기본값 대신 저장/보고를 차단하는 fail-closed 처리 구현
- [x] 비고객 draft의 작성·임시저장·앱 재실행·재열기에서 품목/수량/단가/가격 구분/메모/합계 보존 및 기존 draft 단가 불변을 코드·엔진 회귀로 검증
- [x] Android·iOS 공통 코드 테스트와 iOS simulator/실제 iPhone·Android 실기기 확인 범위를 분리해 Codex 검수 자료 준비
- [ ] Codex 검수 후 실제 iPhone·Android에서 안전영역·키보드·수량 입력/증감/삭제·비고객 초안 저장/재열기·본인 기사 보고를 검증
- [x] Codex 제출 보완: 비밀 제외 source·변경 파일/diff·홈페이지-앱 가격 비교·11개 시험 코드/로그를 한 검수 ZIP으로 재구성
- [x] Codex 제출 보완: 공통 server·단가·권한 변경의 홈페이지 견적 영향 경계와 public/web 비변경 근거를 재대조
- [x] Codex 제출 보완: Android/iPhone 검수용 build·설치/실행 방법과 export/실제 기기 시험 경계를 확인
- [x] Codex 제출 보완: 현재 프로젝트 게시 버튼의 project·environment·domain 갱신 범위와 홈페이지 배포 포함 여부 확인
- [x] Codex findings 보완: 기준 commit부터 후보까지의 실제 patch·변경 파일 목록을 재생성하고 홈페이지/public web·공용 단가 영향 0 근거를 검증
- [x] Codex findings 보완: 분배기 전용 유량밸브 단가 분기·구수 변경 실패·분배기 삭제 뒤 선택 상태를 품목 배열과 fail-closed로 동기화
- [x] Codex findings 보완: 디지털/아날로그 온도조절기·파라핀/모터 구동기와 구수별 자동 수량을 홈페이지 자동견적 계약에 맞게 추가
- [x] Codex findings 보완: 기사/접수 전환 시 이전 초안 분리·저장 전 수량 검증·기존 초안 단가 보존·requestId 필수·본인 배정 서버 확인 추가
- [x] Codex findings 보완: 0원·잘못된 품목 JSON·불일치 총액을 저장 전 차단하고 실패 요청의 DB write·SMS 0회 및 실제 schema 본인 조회를 시험
- [x] Codex findings 보완: Android/iPhone 후보의 common Expo export·EAS profile·설치 경로를 준비하고 실제 기기 미실시 경계를 기록
- [ ] Codex findings 후속: 기존 계정으로 Android/iPhone internal build를 생성하고 실제 기기에서 초안 재열기·키보드·안전영역·수량/삭제·본인 보고 조회를 검증
- [x] checkpoint 9941dbf8 Android 검수: 기존 Expo account·remote keystore의 preview APK build 완료·artifact 링크·API 환경 확인
- [x] checkpoint 9941dbf8 iOS 진단: 기존 Expo project·Apple team·Bundle ID·certificate/provisioning/App Store Connect API key 상태를 파괴 없이 확인
- [ ] checkpoint 9941dbf8 iOS 검수: 기존 TestFlight signing 재사용 build `e5d234ba-3d50-4807-9d3b-5765e59772cd` 완료와 TestFlight 설치·실기기 검증
- [x] Codex 재현 보완 2차: 현재 운영 홈페이지의 조절기 수량·종류 전환·분배기 전용 유량밸브 가격을 다시 대조하고 앱 후보를 정합화
- [x] Codex 재현 보완 2차: 고객 전화번호가 estimates 저장·본인 조회·검수 payload에서 실제 DB mapping으로 보존되는지 fail-closed 검증
- [x] Codex 재현 보완 2차: 기사/접수 scoped 초안의 수량·단가·소계·총액 검증과 기존 초안 단가 보존 회귀 확대
- [x] Codex 재현 보완 2차: 공유 server 변경의 홈페이지 견적 경로 영향 0 근거를 재현하고 시험 서버·합성 접수·문자 대체 검수 환경을 운영과 분리
- [ ] Codex 재현 보완 2차: 동일 재현 조건 통과 뒤 기존 계정·서명 체계 Android/iPhone 검수 build 및 실제 기기 초안/키보드/safe area/본인 보고 조회 검증
- [ ] 단일 preview 보호 예외: `futureenergytech-pxgq6ywrg-futureenergytech.vercel.app` deployment가 합성 단가·접수·문자대체 경로만 사용하고 운영 DB/SMS와 분리되는지 재확인
- [ ] 단일 preview 보호 예외: 프로젝트 전체 SSO 설정을 유지한 채 지정 deployment 한 건에만 Deployment Protection Exception을 적용하고 변경 전후 접속 결과 검증
- [x] 검수 build 정합성: Codex 지적 견적 오류 보완본의 실제 앱 버전·Android versionCode·iOS buildNumber·checkpoint·격리 API 주소를 일치시키고 기존 서명 체계로 Android/iPhone internal build 준비
- [ ] 검수 종료: 실제 기기 확인 완료 후 지정 deployment 한 건의 Protection Exception 제거와 재보호 확인
- [x] 인증 preview 교체: 기존 `futureenergytech-pxgq6ywrg-futureenergytech.vercel.app` 예외를 먼저 제거하고 비인증 접근 차단을 확인
- [x] 인증 preview 교체: 인증 보완 합성 API를 새 preview deployment로 배포하고 운영 DB·운영 고객·문자 provider 미연결을 재현
- [x] 인증 preview 교체: 새 preview URL 한 건에만 Protection Exception을 등록하고 Standard Protection·운영 도메인·다른 preview 보호가 유지되는지 대조
- [x] 인증 preview 권한: 미로그인 가격·접수·보고 차단, 합성 기사 로그인, 본인 합성 접수 저장·재조회, 타 기사 자료 비노출을 실제 HTTP 재현
- [ ] 검수 build: 로그인·견적 API 모두 새 인증 preview URL을 사용하고 bypass secret 미포함인 Android/iPhone internal build를 기존 Expo project·서명 체계로 준비
- [x] iOS internal credential 진단: 기존 Team·Bundle ID·App Store profile·등록 기기·Ad Hoc profile을 읽기 전용으로 확인
- [x] iOS internal credential 준비 중단: 검수 iPhone 부재로 UDID 등록·기존 Bundle ID용 Ad Hoc provisioning profile 생성·EAS remote credential 동기화를 수행하지 않음
- [x] iOS 검수 기기 등록 중단: 검수 iPhone 부재로 기존 futureenergytech EAS 계정의 `eas device:create` 등록 링크 또는 QR 흐름을 종료
- [ ] Codex 제출: 새 checkpoint·9941dbf8 대비 diff·preview 배포/권한 시험 로그·실제 앱 version/versionCode/buildNumber·격리 API 주소를 정리
- [ ] 검수 종료: 실제 휴대폰 검수 완료 직후 새 preview URL 한 건의 Protection Exception을 제거하고 비인증 재차단을 확인
- [x] iOS TestFlight 제출 전 준비: 인증 보완 격리 API를 주입한 App Store build의 기존 서명 자산·버전·API 연결·제출 보류 상태를 확인
- [x] 홈페이지 다운로드 안내: iPhone 영역에 준비 중 문구만 최소 반영하고 견적·단가·기존 Android 다운로드 비변경을 실제 화면으로 확인
- [x] Codex 검수 제출: d52f8869 기준 비밀값 제외 source·실제 diff·단가/중복/전화번호/수량 회귀 로그를 하나의 검수 ZIP으로 구성하고 SHA-256 검증
- [x] Codex 검수 제출: Android·iOS review build가 로그인·견적 모두 인증 보완 preview API만 호출하고 운영 API 비접속인 source·bundle·HTTP 근거 정리
- [x] Codex 검수 제출: Android 검수 계정 사용 시 초안 저장/재열기·단가·합계·본인 보고 확인 절차를 합성 데이터 전용으로 작성
- [x] Codex 검수 제출: iPhone 준비 문구가 적용된 다운로드 페이지 주소와 실제 화면을 첨부하고 홈페이지 견적·단가·Android 다운로드 비변경을 명시
- [x] Codex 재검수 3차: `addAllRoomFlowValve`·`selectManifold`의 29,000원 상수를 활성 단체가 조회로 교체하고 0원/미등록 단가 시 품목 추가를 차단하며 스트레이너 36,000원 정책 보존
- [x] Codex 재검수 3차: 각방 디지털·아날로그 조절기와 와이파이형/V타입 제어기 선택을 분리해 제어기 선택으로 조절기 수량이 중복되지 않도록 구수 전환 포함 회귀 추가
- [x] Codex 재검수 3차: 검수 모드 기사·배정 접수 고정을 제거하고 인증 기사와 배정 접수 기준으로 초안·고객·보고를 분리하며 실제 server review branch 권한 검증 추가
- [x] Codex 재검수 3차: `report_pending`과 제출 schema 상태 계약을 통일하고 격리 DB에서 저장 후 본인 조회까지 재현하되 운영 DB/schema 변경 금지
- [x] Codex 재검수 3차: `approveTechRequest`의 본사·지사 인증 및 담당 범위를 검증하고 익명·기사·다른 지사 승인을 알림 전 차단하며 정상 승인 흐름 보존
- [x] Codex 재검수 3차: 실제 기사앱 다운로드 페이지의 유효 Android 링크를 보존한 채 iPhone 준비 문구만 반영하고 preview/화면 주소 일치 확인
- [x] Codex 재검수 3차: 실패 재현의 통과 로그·실제 diff·격리 저장/권한 로그·APK/IPA build ID/version/hash 연결 및 실기기 미검증 경계 제출
- [x] Codex 재검수 4차: 공식 Android 최대 versionCode 32보다 높은 versionCode·build 번호로 기존 package·remote signing key review APK 재빌드
- [x] Codex 재검수 4차: 계정 전환 시 TanStack Query cache·초안 key·진행 중 요청이 이전 기사 데이터를 표시하지 않도록 actor-scoped cancellation·invalidation·회귀 추가
- [x] Codex 재검수 4차: estimates.list·rejectTechRequest에 본사/담당 지사 권한을 적용해 익명·기사·타 지사 조회·거절을 저장/알림 전 차단
- [x] Codex 재검수 4차: 대기 목록·배지에서 techRequestStatus가 approved/rejected인 처리 완료 보고를 제외하고 pending 건만 표시
- [x] Codex 재검수 4차: 단가가 안전 정수 원화가 아니면 명시적으로 차단하고 32,000.5 재현을 포함한 자동견적 회귀로 정책 일치 확인
- [x] Codex 재검수 4차: source·diff·회귀·격리 저장/권한 로그·새 APK/IPA build ID/version/hash을 포함한 비밀값 없는 보관/재검수 ZIP 생성 및 압축 해제 검증
- [x] Codex 재검수 5차: 새 합성 review preview URL 한 건만 Deployment Protection Exception으로 교체하고 이전 URL은 재보호·프로젝트 Standard Protection 유지 확인
- [x] Codex 재검수 5차: Android versionCode 33 APK의 package·기존 signing certificate·SHA-256 및 iOS IPA version/build/hash을 실제 artifact로 검증
- [x] Codex 재검수 5차: 계정 전환 지연 응답·목록/거절 역할 차단·정상 본사/담당 지사 처리·처리완료 대기 제외·비정수 단가 차단을 Codex 재현 도구로 재실행
- [x] Codex 재검수 5차: 6a4e1623..f2bc0c4e source/diff/log/build 정보 검수 ZIP과 장기보관 PDF를 생성하고 비밀값 제외·압축 해제 검증
- [x] Codex 재검수 6차: 실제 견적 화면의 늦은 초안 저장·삭제 완료 응답이 계정 또는 접수 전환 뒤 현재 actor/request와 일치하지 않으면 state·초안을 변경하지 않도록 보완하고 재현시험 추가
- [x] Codex 재검수 6차: 지사 견적·일정 목록과 초기 보고 배지 호출에 현행 인증 헤더를 연결하고 401을 빈 목록으로 표시하지 않도록 보완하며 `report_pending` 옛 상태를 제거
- [x] Codex 재검수 6차: 수정 후 화면 함수 기반 지연 응답·지사 인증·배지 회귀와 기존 권한/단가/격리 저장을 재실행
- [x] Codex 재검수 6차: 99e53a6f·fd0fb175·f2bc0c4e 및 최신 source/build의 관계를 build ID·version·hash 기준으로 정리해 재검수 자료에 포함
- [x] Codex 재검수 7차: 늦은 A 보고 완료가 B 화면의 보고 버튼 pending 상태를 남기지 않도록 actor/request/work generation guard를 실제 화면 제출 상태에 적용
- [x] Codex 재검수 7차: A→B→A 전환 뒤 옛 A 작업 완료가 새 품목·메모를 삭제하지 않도록 작업 세대와 현재 draft revision을 비교
- [x] Codex 재검수 7차: actor/request scope 변경 전 33번 검수본 초안을 동일 기사·접수 key로 읽고 새 scoped key로 안전하게 이전하며 기존 초안 보존
- [x] Codex 재검수 7차: 화면 함수 기반 보고 잠김·세대 충돌·초안 이전 재현과 기존 권한/단가/지사 회귀를 재실행
- [x] Codex 재검수 7차: 다운로드 403 대체용 원본 APK·IPA 파일과 source/diff/log 검수 자료를 첨부하고 실기기 미검증·운영 보류를 명시
- [x] Codex 재검수 8차: 실제 견적 화면에서 `loadCurrentOrMigrateLegacyDraft` import와 호출이 일치하는지 compile/source 계약으로 확인
- [x] Codex 재검수 8차: 늦은 보고 응답이 저장소 삭제 전 actor·접수·작업 세대·현재 draft revision 소유권을 확인해 A→B→A 신규 초안을 삭제하지 않도록 보완
- [x] Codex 재검수 8차: v33 legacy 초안은 원본 보존·한 번의 안전 복사만 허용하고 사용자가 새 scoped 초안을 삭제한 뒤 재진입해도 재복사하지 않도록 이전 상태 기록
- [x] Codex 재검수 8차: 실제 화면·비동기 storage 재현에서 import·늦은 보고 저장소 삭제·legacy 재진입 반복 방지를 검증하고 source/log 제출
- [x] Codex 직접 재검수 9차: checkpoint 7bfe7418 source와 `ba3145d3..7bfe7418` 실제 diff를 비밀값 없이 포함
- [x] Codex 직접 재검수 9차: 화면 진입·옛 A 응답 뒤 새 A 저장 초안 보존·삭제한 legacy 초안 재등장 차단을 포함한 화면/저장소 10건 코드와 실행 로그 포함
- [x] Codex 직접 재검수 9차: 자동견적·지사·fail-closed·격리 router·server bundle 로그와 ZIP SHA-256/압축 해제 검증 포함
- [x] Codex 직접 재검수 9차: Codex source 재검수 통과 후 checkpoint 61151468에서 해당 source 검수 APK build를 완료했고 Android 실기기 시험·운영 반영 판단은 다음 순서로 보류
- [x] Codex 통과 후 검수 APK: checkpoint 7bfe7418 기능 source와 version metadata checkpoint 61151468에서 기존 package·remote signing key를 유지한 versionCode 36 업데이트 APK build
- [x] Codex 통과 후 검수 APK: APK 원본의 package·versionCode·v2/v3 signer certificate·SHA-256을 실제 artifact로 검증
- [x] Codex 통과 후 검수 APK: 합성 기사 로그인·배정 접수·견적 검수 진입 절차를 비밀값 없이 안내하고 Android 실기기 시험은 사용자 설치 후 별도 진행
- [ ] v1.1.36 실기기 실패: Android 오류 로그로 전체 작업 목록·점검표 실제 종료 지점을 API 누락과 분리해 확인
- [x] v1.1.36 실기기 실패: review API에 인증된 본인 합성 접수 전용 `location.getConsent`·`location.saveConsent`·`location.startTracking`·`repair.getById`·`workReport.getByRequest`를 tRPC 규격 성공/실패 응답으로 구현
- [x] v1.1.36 실기기 실패: 동의 저장 실패 시 출발 추적을 차단하고, 합성 접수의 증상·아파트명 누락을 보완하며 화면의 null/빈 검색 방어 추가
- [ ] v1.1.36 실기기 실패: 수정 APK에서 전체 목록→이월 작업→출발→점검표→견적 작성→초안 재열기 실기기 실행과 영상·Android 오류 로그·version evidence 제출
- [x] v1.1.37 review build: 기존 futureenergytech Expo project·Android remote signing key를 유지해 새 단일 합성 preview URL 주입 APK를 생성하고 package/versionCode/서명/SHA-256을 검증
- [x] Codex v1.1.37 제출: 61151468 및 기능 기준 7bfe7418 대비 실제 diff·변경 파일과 전체 목록/점검표·출발 API·tRPC error envelope·undefined 방어 수정 근거를 제출
- [x] Codex v1.1.37 제출: 기기 없이 가능한 동일 tRPC client 통신 경로로 새 review URL의 인증·동의·점검표·권한 오류 envelope를 재현하고 계정 정보 전송 승인 범위를 명시
- [x] Codex v1.1.37 제출: 이 환경의 ADB 제어 대상·Android emulator/AVD 실행 가능 여부를 확인하고 불가능한 경우 사용자 PC의 실제 APK 업데이트·화면 녹화·logcat 수집 절차를 제공
- [x] v1.1.37 호환성 보완: 운영 `location.saveConsent`의 `{ success: true }` 응답을 유지하면서 앱이 인증된 `location.getConsent` 재조회 `hasConsented:true`를 확인한 뒤에만 출발하도록 실제 화면 콜백 보완
- [x] v1.1.37 호환성 보완: 운영 저장 응답·합성 저장 응답의 정상 출발과 저장 실패·재조회 실패·동의 없음 출발 차단을 화면 콜백 계약으로 재현
- [x] v1.1.37 호환성 보완: 검수 당일에도 미작업·이월에 노출되는 합성 배정 접수를 fixture와 안내 경로에 반영
- [x] v1.1.38 호환성 검수: 기존 package·remote signing key를 유지한 APK build와 artifact package/versionCode/서명/SHA-256 검증
- [ ] v1.1.38 호환성 검수: 새 APK로 전체 목록→미작업·이월→출발→점검표→견적 작성→초안 재열기 실기기 영상·logcat 수집
- [x] v1.1.38 Codex 제출: APK 원본·APK-only ZIP·전체 SHA-256·실제 수정 diff·호환성 회귀 및 preview HTTP 로그를 단일 검수 패키지로 제공
- [ ] v1.1.38 검수 기간: 운영 게시 없이 새 단일 합성 review API와 Deployment Protection Exception을 유지하고 실기기 전체 흐름 결과를 수집
- [x] v1.1.38 Codex 후속: `verify-review-trpc-client.mjs`의 저장 응답 `hasConsented` 직접 요구를 `success:true` 뒤 인증 readback 확인으로 교체하고 실행 로그 갱신
- [x] v1.1.38 Codex 후속: 동일 APK 재빌드 없이 삭제 없는 업데이트 설치·전체 흐름·오류 시점 화면/logcat 수집 절차를 재안내
- [x] v1.1.38 실기기 안내 보완: 전체 작업 목록에 합성 접수 `810001`이 실제 표시될 때만 통과로 판정하고 빈 목록·오류 화면은 실패로 기록
- [x] v1.1.38 실기기 안내 보완: PDF 2페이지의 잘린 logcat 명령을 운영체제별 완전한 명령으로 정정
- [ ] v1.1.38 실기기 검수: code 38 APK를 삭제 없이 업데이트한 뒤 전체 목록→미작업·이월→출발→점검표→견적 작성→초안 재열기 연속 영상과 오류 시점 logcat 수집
- [ ] v1.1.38 순차 실기기 검수: 재빌드 없이 code 38 APK 원본을 재첨부하고 `review-tech` 로그인 뒤 전체 작업 목록의 `REVIEW-810001` 표시 화면을 먼저 판정
- [ ] v1.1.38 순차 실기기 검수: 첫 화면에서 확인된 오류 단계에 한해 필요한 화면 또는 같은 시점 logcat을 요청하고 원인 보완·Codex 증빙을 진행
- [x] v1.1.38 실기기 실패: update 설치본에서 전체 작업 목록·점검표 진입 종료가 재현됐음을 실패로 기록하고 code 38 APK를 보존
- [ ] v1.1.38 종료 분석: 통신 계약과 분리해 전체 작업 목록·점검표 화면 전환·렌더링 예외의 실제 원인을 분석
- [ ] v1.1.38 종료 보완: 확인된 원인만 수정하고 변경 파일·수정 전후 focused 재현 결과를 Codex 검수 자료로 제출
- [x] v1.1.38 Windows 로그 수집: 공식 Android Platform Tools 확인·USB 디버깅/RSA 승인 상태 안내·시작/종료 수집을 지원하는 code38-crash.txt 도구 제공
- [ ] v1.1.38 Windows 로그 분석: 수집된 JavaScript·AndroidRuntime 종료 기록으로 실제 원인을 분석하고 필요한 경우에만 수정 후보를 준비
- [x] v1.1.38 Windows 도구 보정: 첫 주석 종료 구문·UTF-8 BOM·명시 인코딩을 PowerShell 파서 검사로 확인
- [x] v1.1.38 Windows 도구 보정: `adb logcat -c`를 제거하고 연결 끊김·프로세스 조기 종료·빈 로그를 실패로 판정
- [x] v1.1.38 Windows 도구 보정: 실행 ZIP 한 파일과 별도 `SHA256SUMS.txt`를 정확한 이름·형식으로 재제출
- [x] v1.1.38 Windows 도구 후속: PowerShell 5.1 `get-state` 예외·비정상 종료코드·빈 응답을 catch해 확보 로그와 실패 이유를 `code38-crash.txt`에 보존
- [x] v1.1.38 Windows 도구 후속: 성공·실패 상태와 관계없이 생성된 `code38-crash.txt` 한 파일을 제출하도록 안내서 보완 및 단일 ZIP 재제출
- [x] v1.1.38 실기기 실패 원인: `ExponentImagePicker` native module 등록 누락으로 전체 작업 목록·점검표 진입에서 `mqt_v_native` 종료가 발생한 실제 logcat 확인
- [x] v1.1.39 ImagePicker 보완: Expo SDK 54 호환 `expo-image-picker`·`expo-location`·`expo-task-manager` 의존성과 lockfile을 정렬하고 autolinking resolve 결과에 ImagePickerModule 등록 확인
- [x] v1.1.39 ImagePicker 보완: work-report 사진 모듈 로드·카메라/앨범·취소/실패 안내를 네이티브 등록 실패가 화면 종료로 번지지 않도록 검증
- [x] v1.1.39 Android 검수: 기존 package·remote signing key 유지 APK build, ImagePickerModule 등록 목록·DEX·package/versionCode·서명·SHA-256 확인
- [ ] v1.1.39 실기기 검수: 전체 목록 REVIEW-810001→미작업·이월→출발→점검표→카메라/앨범·취소→견적→초안 재열기 실행 결과 수집
- [ ] v1.1.39 Codex 제출: code 38 실제 오류·변경 파일/diff·의존성/lockfile·autolinking/생성 등록 목록·APK 증거·실기기 미검증 범위 제출
- [x] v1.1.40 수량 입력 UI: tech-estimate 수량 입력칸을 최소 높이 48·너비 60, 18pt 굵은 숫자, Android 세로 중앙 정렬로 최소 보완
- [x] v1.1.40 수량 입력 UI: − / + 버튼을 함께 확대하고 1·2·3·7·10 및 확대 글꼴 상태의 잘림·정렬을 source geometry 검증
- [x] v1.1.40 회귀: 수량 변경 금액 계산·초안 저장/재열기·code 39 ImagePicker 등록 보완을 focused test로 재확인
- [x] v1.1.40 Android 검수: 기존 package·remote signing key를 유지한 update APK build와 manifest·서명·SHA-256 검증
- [ ] v1.1.40 Android 화면 증거: 수량 1·2·3·7·10, ± 버튼, 금액 반영·초안 재열기 및 ImagePicker 사진 첨부를 실제 기기에서 확인
- [x] 기사 자동견적 구성 보완: 홈페이지 승인 단가 기준으로 분배기·각방 구성의 제어기·V타입·와이파이형·단자함 선택 계약을 read-only 대조
- [x] 기사 자동견적 구성 보완: 기존 버튼을 재사용해 분배기·각방 구성에서 제어기·V타입·와이파이형·단자함 독립 선택을 구현
- [x] 기사 자동견적 단독보수 보완: 공급측만 단독보수 120,000원은 유지하고 단자함·라인보수 20A·라인보수 25A 승인 단가 품목을 추가
- [x] 기사 자동견적 회귀: 추가 품목의 수량·합계·가격 유형·초안 저장/재열기와 code 40 수량 UI·ImagePicker 경계를 재검증
- [x] 기사 자동견적 Android 검수: 기존 package·remote signing key를 유지한 업데이트 APK 및 artifact 무결성 검증
- [x] 운영 기사앱 배포 점검: 기존 홈페이지 다운로드 경로·현재 운영 APK·운영 API build profile·고정 파일 호스팅을 read-only 대조
- [x] 운영 기사앱 배포 점검: 운영 API APK와 합성 review APK의 API·package·서명·versionCode·SHA-256 분리 확인
- [x] 운영 기사앱 배포: 홈페이지 메인·모바일 메뉴의 기사용 앱 다운로드 버튼과 기존 다운로드 페이지·버전/업데이트/무삭제 안내를 최소 변경
- [x] 운영 기사앱 배포: 고정 다운로드 주소의 운영 Android APK·홈페이지 버튼·파일 version/서명/SHA-256 end-to-end 검증 및 운영 반영 범위 보고
- [x] 운영 기사앱 배포 진단: 서버 multipart upload는 94MB code 42 전송 중 write timeout으로 완료되지 않아 release metadata가 기존 code 32 상태임을 확인
- [x] 운영 기사앱 배포 대체: 기존 GitHub release 저장 경로에 검증된 code 42 APK를 업로드하고 공식 고정 download metadata에 immutable URL 등록
- [x] 운영 홈페이지 배포 복구: main push가 Git author account configuration으로 BLOCKED된 것을 팀 소유자 identity의 빈 deployment commit으로 복구
- [x] 운영 위치 공유 장애: 2026-09-15 11:56 KST code 42 설치본·운영 latest metadata·HTTP 요청/응답·Vercel runtime log를 read-only로 대조
- [x] 운영 위치 공유 장애: 전경·화면꺼짐 전송의 API 주소·Bearer 인증·접수/추적 ID·location_sessions 저장·앱 마지막 전송 상태 갱신 경로 분리 분석
- [ ] 운영 위치 공유 장애: 확인된 원인만 최소 보완하고 새 좌표 저장·고객 추적 링크 반영·마지막 전송 시각·SMS 미발송을 검증
- [x] 운영 위치 공유 장애: 기존 code 42 native APK를 기준으로 위치 인증 JavaScript·v1.1.43/code 43 metadata만 Expo Repack하고 기존 signer·운영 API 경계를 검증
- [x] 운영 위치 공유 장애: resolver가 신뢰하는 immutable GitHub release에 정확한 `future-energy-heating.apk` asset·integrity metadata를 등록하고 공식 `/download/driver/latest`에서 code 43 package/version/서명/SHA-256 end-to-end 검증
- [x] 운영 APK 설치 실패: code 43 최종 APK의 `resources.arsc`·88개 uncompressed native library가 4KB/16KB zip alignment 검증에 실패한 실제 문제를 기록
- [x] 운영 APK 정렬 보완: 위치 Bearer 수정은 유지하고 code 44+ APK을 native build 또는 align-aware repack 경로로 생성
- [x] 운영 APK 정렬 보완: 최종 서명 APK에 `zipalign -c -P 16 -v 4`와 기존 signer `apksigner verify --print-certs`를 모두 통과
- [x] 운영 APK 정렬 보완: 기존 복구용 release를 유지한 code 44 immutable release와 `/download/driver/latest` 전환 후 서버 재다운로드 file의 version·hash·alignment·signature 재검증
- [ ] 운영 APK 정렬 보완: 실제 Android 업데이트 설치 성공은 기기 확인 전까지 미확인으로 유지
- [x] 고객용 지사 현황: 관리자 등록 호남지사의 공개 가능 지사명·대표전화·영업주소·서비스 지역과 기존 홈페이지 PC/모바일 메뉴 구조를 read-only 대조
- [x] 고객용 지사 현황: 비로그인 `/branches` 페이지에 호남지사 1곳만 표시하고 등록 대표전화의 전화 문의 연결을 기존 디자인에 맞춰 구현; 주소·길찾기·placeholder 문구는 제외
- [x] 고객용 지사 현황: 메인 PC 상단·모바일 메뉴 연결, 호남지사 1곳 공개·대표전화 대상·주소/길찾기 미노출·모바일 가독성을 비로그인 상태로 검증
- [x] 고객용 지사 현황: 운영 홈페이지 반영 후 공개 주소·화면·수정 범위 보고

## 일정요청→접수전환·기사배정 통합 워크플로우 (34차)
- [x] 상태값 통일: customer_schedule_requested→schedule_confirmed→reception_converted→technician_assigned→technician_confirmation_pending→technician_confirmed→en_route→arrived→work_started→work_completed
- [x] 기사앱 DB 스키마: 새 상태값 추가 (기사확인대기/기사확인완료/출발/도착/공사중/공사완료)
- [x] 기사앱 DB 마이그레이션: status enum 업데이트, technicianConfirmedAt/workStartedAt 컬럼 추가
- [x] 기사앱 서버: confirmJobSchedule API 추가 (기사확인대기 → 기사확인완료)
- [x] 기사앱 서버: markWorkStarted API 추가 (도착 → 공사중)
- [x] 기사앱 서버: markWorkCompleted API 업데이트 (공사중 → 공사완료)
- [x] 기사앱 서버: startTracking에 출발 상태 업데이트 추가
- [x] 기사앱 서버: markArrived에 도착 상태 업데이트 추가
- [x] 기사앱 db.ts: assignTechnician 함수 상태를 방문예정 → 기사확인대기로 변경
- [x] 기사앱 tech-schedule.tsx: 일정접수확인 → 출발 → 도착 → 공사시작 → 공사완료 버튼 순서 구현
- [x] 홈페이지 dashboard.html: 접수전환·기사배정 통합 버튼 및 모달 구현
- [x] 홈페이지 branch.html: 접수전환·기사배정 통합 버튼 및 모달 구현
- [x] 홈페이지 서버: 기사확인대기/완료 상태값 추가
- [x] 홈페이지 DB: repair_requests status enum 업데이트
- [x] 오타 수정: 품조에너지테크/품쳐에너지테크 → 퓨처에너지테크
- [x] GitHub push (futureenergytech 레포)
- [x] 기사앱 체크포인트 저장

## 기사앱 자동 업그레이드 체계 (22차)
- [x] GET /api/mobile-app/latest API 구현 (versionName, versionCode, minSupportedVersionCode, apkUrl, sha256, fileSize, releaseNotes, publishedAt)
- [x] GET /api/mobile-app/releases API 구현 (전체 버전 목록)
- [x] POST /api/mobile-app/releases API 구현 (새 버전 등록, 관리자 토큰)
- [x] POST /api/mobile-app/upload-apk API 구현 (APK S3 업로드)
- [x] GET /download/driver/latest 고정 URL (302 리다이렉트, 캐시 없음)
- [x] GET /app/driver-download 다운로드 안내 페이지 (QR 대상 고정 페이지)
- [x] mobile_app_releases DB 테이블 추가
- [x] download.html 고정 URL 사용, 버전 정보 동적 표시, QR 고정 페이지 연결
- [x] hooks/use-app-update.ts 버전 체크 훅 구현 (앱 시작 + 포그라운드 복귀 시 체크)
- [x] components/app-update-modal.tsx 업데이트 안내 모달 구현 (선택적/강제 업데이트)
- [x] app/_layout.tsx에 업데이트 모달 통합
- [x] scripts/publish-apk.sh APK 배포 자동화 스크립트
- [x] busboy 패키지 추가 (multipart 파싱)
- [x] api/index.ts에 ensureMobileAppReleasesTable 초기화 추가

## 기사앱 일정 화면 개선 (v1.1.4)
- [x] 서버: listByTechnicianUserId를 protectedProcedure로 변경 (세션 기반 기사 ID 조회)
- [x] 기사앱 홈: 기사 메뉴에 "오늘 작업 N건", "내일 일정 N건", "미작업·이월 N건" 건수 표시
- [x] 기사앱 홈: 각 항목 누르면 해당 필터 탭으로 이동
- [x] tech-schedule.tsx: 탭 UI 추가 (오늘/내일/미작업·이월/전체)
- [x] tech-schedule.tsx: 탭 이름 "오늘 일정" → "작업 일정"으로 변경
- [x] tech-schedule.tsx: 오늘 분류 - scheduledDate=오늘(KST), 취소 제외, 완료 포함
- [x] tech-schedule.tsx: 내일 분류 - scheduledDate=내일(KST), 취소 제외, 방문시간 순
- [x] tech-schedule.tsx: 미작업·이월 분류 - scheduledDate<오늘이거나 null, 완료/취소 제외
- [x] tech-schedule.tsx: 전체 탭 - 배정된 모든 작업 (취소 제외)
- [x] tech-schedule.tsx: 오류 시 빈 배열 대신 오류 메시지 + 다시 시도 버튼
- [x] tech-schedule.tsx: pull-to-refresh 구현
- [x] 탭 레이아웃: "오늘 일정" → "작업 일정"으로 변경
- [x] app.config.ts: version 1.1.4, versionCode 15로 업데이트
- [x] 검증: 10가지 조건 데이터 배정 후 분류 결과 확인
- [ ] APK 빌드 및 배포

## v1.1.4 재빌드 작업 (현재)
- [ ] EAS 빌드 상태 점검 및 현재 소스 검사
- [ ] API 주소 www 포함 고정 확인, AbortSignal.timeout 제거, health probe 제거
- [ ] 버전 v1.1.4/versionCode 15로 교정
- [ ] technicianId 540003 연결 및 TEST-2026-0002 접수 배정 확인
- [ ] Metro 번들링 검증 (www 없는 주소 0건 확인)
- [ ] GitHub main 반영
- [ ] EAS APK 빌드 (production-apk)

## 토큰 형식 통일 + 기사목록 수정 (v1.1.9)
- [x] DB: 300003으로 잘못 배정된 접수 1500001(FE-20260805-2507)을 540003으로 이전
- [x] server/_core/context.ts: Bearer userId:서명값 형식 HMAC 토큰 인증 추가 (앱 전용)
- [x] server/routers.ts: auth.login 토큰 반환 형식을 userId:서명값으로 변경
- [x] server/routers.ts: auth.verifyToken이 userId:서명값 및 서명값만 형식 모두 지원
- [x] server/db.ts: getActiveTechnicians → technicians 테이블 기준 (technicians.id 반환)
- [x] server/db.ts: getAllTechnicians → technicians 테이블 기준
- [x] server/db.ts: getTechniciansByBranch → technicians 테이블 기준
- [x] lib/auth-context.tsx: rememberMe=false 시 SecureStore 토큰 유지 (clearAllAuthStorage 버그 수정)
- [x] app/(tabs)/tech-schedule.tsx: isError 추가, 오류 메시지 + 재시도 버튼 표시
- [ ] 서버 Publish 배포
- [ ] 운영 서버 검증: 로그인 technicianId=540003, listMySchedule HTTP 200, 접수 1건 확인
- [ ] app.config.ts: version 1.1.9, versionCode 20으로 업데이트
- [ ] APK 빌드 및 홈페이지 교체

## 서버 인증 통일 + 기사목록 수정 (2026-08-06)
- [x] technicians.userId UNIQUE 인덱스 추가
- [x] 토큰 형식 통일: userId:issuedAt:sig (30일 만료, 비밀번호 변경 시 폐기)
- [x] auth.changePassword: currentPassword 필수 검증 + 변경 후 새 토큰 반환
- [x] resolveCallerRole: 신형/구형 토큰 모두 검증
- [x] getActiveTechniciansWithAccount: userId IS NOT NULL 필터 (배정용)
- [x] getTechniciansByBranchWithAccount: userId IS NOT NULL 필터 (배정용)
- [x] dashboard.html + branch.html: trpc 함수에 인증 헤더 추가, 401/403 오류 표시
- [x] login.html: 비밀번호 변경 화면에 현재(임시) 비밀번호 입력 필드 추가
- [x] 하드코딩된 토큰 값 포함 검증 스크립트 전체 삭제

## 기사 회원가입·본사 승인 복구 (2026-09-15)
- [x] 마지막 정상 버전과 현재 소스의 기사 가입 버튼·가입 화면·휴대폰 인증·가입 신청 API·본사 승인 목록 차이 및 누락 시점 조사
- [x] 기존 데이터 모델과 권한 체계를 유지하여 기사앱 초기 로그인 화면의 기사 회원가입 및 휴대폰 인증 가입 신청 흐름 복구
- [x] 가입 신청 기사를 기존 본사 홈페이지 계정 승인 관리의 승인 대기 목록에 연결하고, 본사 승인 전 로그인 차단·승인 후 기사앱 정상 로그인 연결
- [x] production 검수 계정으로 가입 신청→본사 승인 대기→승인→기사 로그인→비활성화·재로그인 차단을 API 수준에서 실제 검증; 고객 업무·출발·고객 문자 미실행
- [ ] 실제 Android 화면에서 기사 회원가입 버튼·휴대폰 인증·승인 대기 안내·승인 후 로그인과 기존 위치·이동경로·견적·수량·초안·사진 회귀 확인
- [x] 기존 package·서명·APK 정렬을 검증한 상위 versionCode 업데이트 APK 준비, code 44 복구본 보존 및 공식 다운로드 반영
- [x] v1.1.45/code45 업데이트 APK 생성 및 기존 package·SHA-256 인증서·Build Tools 36 16KB 정렬·v2/v3 전자서명 검증
- [x] 검수 계정 실동작 확인 후 v1.1.45/code45 APK를 공식 `/download/driver/latest`에 반영하고, 공식 주소 재다운로드 파일을 재검증
- [x] 승인된 검수 번호 1건에만 인증문자 1회 발송하고, 기존 계정·전화번호를 덮어쓰지 않는 기사 가입 신청 생성
- [x] 승인 전 기사 업무 접근 차단·본사 계정 승인 대기 목록 표시·본사 승인·기사 로그인 실제 확인; 고객 업무 배정·출발·고객 문자 발송은 금지
- [x] 실제 검증 직후 생성한 검수 기사 계정 비활성화 및 비활성 로그인 차단 확인
- [x] 추가 인증문자 발송 없이 최근 검수 요청의 HTTP 상태·서버 반환 오류·SMS 업체 접수/발송 이력을 읽기 전용 대조하고, 번호 중복·요청 제한·업체 실패·API 오류를 구분
- [x] 실제 SMS 재요청 전에 합성 정상 응답의 signupGrant를 원문 형식 그대로 제한 임시 저장하고 기사 가입 요청에 전달하는 검수 코드 확인; 실패 시 재발송 금지

## 기사 매출·결제수단·본사 수금관리 연동 복구 (2026-09-16)
- [x] 운영 매출·수금 기록을 읽기 전용으로 대조하고, 마지막 정상 버전과 현재 소스의 기사 화면·메뉴·API 누락 시점 및 데이터 누락 여부 분리
- [x] 기존 매출 귀속일·한국시간 월 경계·부가세·취소·환불·미수금 산정 기준과 결제수단별 기록 모델을 확인해 유지하는 복구 설계 확정
- [x] 기사앱의 본인 당일 매출·월간(한국시간 월 1일~말일) 합계, 작업별 실제 수금액·카드·현금·계좌이체 입력·저장·재조회 화면 및 API 연결 복구
- [x] 기존 본사 홈페이지 수금관리로 중복 없는 자동 반영·재시도·수정 흐름 복구; 견적금액·매출·실제 수금액을 분리 유지
- [x] 분리 검수 fixture로 카드·현금·계좌이체, 일별·월별 합계, 월말·월초, 재진입 복원, 본사 workReportId 고유 ledger 연동 및 중복 방지 계약 대조; 실제 고객 매출 생성·일괄 삭제·덮어쓰기 금지
- [ ] code46 실제 Android 화면에서 결제수단 3종 입력·저장 후 재실행·당일/월간 매출 및 본사 수금관리 반영을 별도 검수 계정·분리 접수로 확인
- [x] 회원가입·승인·위치 전송·이동경로·견적·사진을 유지하고, 누수·유량 센서 및 공통 인증 기능은 별도 승인 없이 변경하지 않음
- [x] 기존 검수 경로가 운영 매출·수금·정산 집계와 실제로 분리되는지 read-only 확인하고, 분리 불가 상태에서 운영 검수 기록 생성을 중단한 뒤 preview-only fixture로 대체
- [ ] 이전 검수 기사 1개와 합성 접수 1건만 사용해 Android 실제 화면에서 카드·현금·계좌이체 저장·재로그인 보존·본사 동일 기록 반영·수정/재시도 중복 방지 확인; 결제·송금·SMS는 금지
- [x] 검수 종료 후 review fixture는 운영 DB·실제 계정·영구 수금 기록을 만들지 않았고, 운영 매출·수금·정산 합계 미반영을 확인; preview 예외 제거로 fixture 접근 재보호
- [x] 매출 기능 누락 커밋·검수 미탐지 원인·재발 방지 절차 및 실제 화면/API 검증 구분 근거를 증빙·최종 보고에 제출
- [x] Android 기기·emulator 실행 가능 여부를 먼저 확인하고, 불가하면 APK 재빌드 없이 API·본사 검수 화면 결과와 Android 미확인 사항을 분리 보고
- [x] 기존 review fixture에만 결제수단·실제 수금액·KST 일별/월별 합계·동일 reportId 재시도 upsert·기사/본사 동일 검수 조회를 최소 추가; 운영 DB·SMS·실제 계정·운영 설정 접근 차단
- [x] review 기사 API 및 본사 검수 화면에서 동일 fixture 기록의 저장·재조회·결제수단별 합계·본사 반영·중복 방지를 검증하고, 메모리 fixture 결과와 실제 DB 결과를 구분
- [x] 현재 404인 과거 review URL과 운영 Git main의 review source 부재를 확인한 뒤, main과 분리된 review-only branch·preview deployment에만 검수 fixture를 복구; production 배포·운영 설정 변경 금지
- [x] 단일 review preview URL 예외 등록 전에 모든 호출 procedure의 운영 DB·고객·SMS·센서 비연결을 source·runtime contract로 확인하고, 분리 미확인 시 예외 미등록
- [x] 검수 종료 후 등록한 review preview URL 예외 1건만 제거하고, Vercel SSO 302 로그인 리다이렉트로 비인증 직접 접근 차단 복구를 확인
- [x] Vercel deployment별 메모리 fixture가 분리되는 특성을 반영해 기사 저장·본사 검수 화면이 같은 최신 review deployment를 사용하도록 단일 예외 URL을 교체하고, 이전 예외는 즉시 재보호
- [x] code46 APK의 기존 package·서명·Build Tools 36 16KB 정렬을 검증하고, 실제 Android 화면 미검증과 fixture/API 검증 결과를 분리해 증빙에 기록

## code46 APK 전달·운영 반영 검증 (2026-09-16)
- [x] 전달 전 code46 APK의 공식 운영 API 연결, package/versionCode/SHA-256, 기존 signer, v2/v3 전자서명, Build Tools 36 16KB 정렬 및 code45 복구본 유지 상태 재확인
- [x] 검증된 code46 APK 원본과 삭제 없는 업데이트·운영 매출 미생성 안내를 전달하고 실제 Android 화면 확인 결과를 대기
- [x] 사용자 설치·매출/결제 화면 정상 확인 후에만 기존 복구본을 유지한 공식 `/download/driver/latest` code46 전환 및 서버 재다운로드 무결성 검증
- [ ] 다음 실제 업무 완료보고 1건에 대해 기사앱과 본사 수금관리의 금액·결제수단을 읽기 전용으로 대조; 그 전에는 실제 운영 저장·반영 완료로 보고하지 않음
- [x] code32 누락 커밋·파일과 재발 방지 검수 결과, 실제 Android 화면/API/운영 대조 확인 범위를 최종 인계에 구분해 기록
- [x] 실기기 매출 화면 표시 확인을 근거로 동일 code46 APK만 공식 `/download/driver/latest`에 전환하고 code45 복구본을 보존
- [x] 공식 고정 주소 재다운로드 code46의 package/versionCode/SHA-256/기존 signer/Build Tools 36 16KB 정렬을 검증하고 실제 완료보고→본사 수금 반영은 미확인으로 인계
