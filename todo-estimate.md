# 견적서 전송하기 기능 (독립 메뉴) - 30차 TODO

## Phase 1: 코드 구조 파악
- [ ] 홈페이지 파일 업로드/스토리지 방식 확인 (work_reports 사진 업로드 등)
- [ ] 모바일 앱 파일 업로드 방식 확인
- [ ] 기존 estimates 테이블/API 구조 확인
- [ ] 메시지 발송 기록(notification_logs) 구조 확인
- [ ] 접수(repair_requests) 생성 흐름 확인
- [ ] 본사/지사 관리자 화면 구조 확인

## Phase 2: DB 스키마 확장
- [ ] estimates 테이블에 파일 필드 추가 (fileUrl, fileName, fileType, fileSize, title, customerName, customerPhone, validUntil 등)
- [ ] estimates 승인 조인 정보 (addressFull, sido, sigungu 등, requestedDate, requestedTime, requestMemo, orderId)
- [ ] messageLogs 테이블 (또는 기존 notification_logs 확장)
- [ ] 홈페이지 + 앱 양쪽 스키마 동기화

## Phase 3: 서버 API
- [ ] 파일 업로드 API (PDF/JPG/PNG, S3 저장)
- [ ] estimates.send (견적 생성 + 파일 + SMS 발송)
- [ ] estimates.getByToken (고객용, 만료 체크)
- [ ] estimates.reject (거절 + 본사/지사 알림)
- [ ] estimates.approveWithOrder (승인 + 주소/일정 → 신규 오더 생성 + 알림)
- [ ] estimates.list (권한별: 본사 전체, 지사 자기것만)
- [ ] estimates.resend (재전송)
- [ ] 메시지 발송 기록 저장

## Phase 4: 고객 견적 확인 웹 페이지
- [ ] 파일 뷰어 (PDF/이미지)
- [ ] 승인/거절 버튼
- [ ] 거절 처리 화면
- [ ] 승인 후 주소/일정 입력 화면 → 전송

## Phase 5: 홈페이지 본사/지사 관리자
- [ ] 견적서 전송하기 메뉴/버튼
- [ ] 견적서 전송 폼 (파일 업로드 포함)
- [ ] 견적서 관리 목록 (상태별, 재전송, 보기)
- [ ] 본사/지사 권한 분리

## Phase 6: 모바일 앱 본사/지사 관리자
- [ ] 견적서 전송하기 메뉴/버튼
- [ ] 견적서 전송 폼 (파일 업로드: DocumentPicker/ImagePicker)
- [ ] 견적서 관리 목록

## Phase 7: 테스트 & 배포
- [ ] 거절 흐름 테스트
- [ ] 승인 흐름 테스트 (오더 생성 → 기사 배정)
- [ ] 지사 견적 테스트
- [ ] 기존 기능 회귀 확인
- [ ] GitHub 푸시 (홈페이지 + 앱)
- [ ] 체크포인트 저장

## 검증 완료 (29차 후속)
- [x] DB 스키마 확장 (estimates 독립형 + estimate_message_logs) - 홈페이지 + 앱
- [x] 서버 API: uploadFile/send/getByToken/reject/approveWithOrder/list/resend - 양쪽
- [x] 고객 견적 확인 웹 페이지 (파일 뷰어 + 승인 주소/일정 입력 + 거절)
- [x] 홈페이지 본사/지사 견적서 전송 메뉴 + 관리 목록
- [x] 모바일 앱 본사(탭)/지사(화면) 견적서 전송 + 관리
- [x] 승인 시 신규 접수 자동 생성 + 상태 "기사배정대기" 연결
- [x] 거절 시 관리자 알림
- [x] 단위 테스트 6건 추가 (estimate.test.ts) - 전체 66 통과
- [x] 홈페이지/앱 전체 흐름 API 검증
