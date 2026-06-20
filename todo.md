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
