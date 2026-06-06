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
