import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildBranchAssignedMessage,
  buildScheduleConfirmedMessage,
  buildTechnicianArrivedMessage,
  buildTechnicianDepartedMessage,
  buildWorkCompletedMessage,
  isAlimtalkConfigured,
  sendNotification,
} from "../server/notification";

describe("워크플로우 단계별 알림 메시지 빌더", () => {
  it("지사 배정 안내에 지사명과 브랜드 헤더가 포함된다", () => {
    const msg = buildBranchAssignedMessage("홍길동", "안산지사", "031-111-2222");
    expect(msg).toContain("[퓨처에너지테크]");
    expect(msg).toContain("안산지사");
    expect(msg).toContain("031-111-2222");
  });

  it("일정 확정 메시지는 날짜·시간을 포함하고 변경이 아니면 '확정' 문구를 쓴다", () => {
    const msg = buildScheduleConfirmedMessage("홍길동", "2026-06-16", "10:00", false);
    expect(msg).toContain("확정");
    expect(msg).toContain("2026-06-16 10:00");
    expect(msg).not.toContain("변경 사유");
  });

  it("일정 변경 메시지는 '변경' 문구와 사유를 포함한다", () => {
    const msg = buildScheduleConfirmedMessage("홍길동", "2026-06-17", "14:00", true, "기사 일정 조정");
    expect(msg).toContain("변경");
    expect(msg).toContain("변경 사유: 기사 일정 조정");
  });

  it("기사 출발 메시지에 위치 확인 링크가 포함된다", () => {
    const url = "https://futureenergytech.co.kr/track/abc123";
    const msg = buildTechnicianDepartedMessage("홍길동", "김기사", url);
    expect(msg).toContain(url);
    expect(msg).toContain("김기사");
  });

  it("기사 도착 메시지에 기사명이 포함된다", () => {
    const msg = buildTechnicianArrivedMessage("홍길동", "김기사");
    expect(msg).toContain("도착");
    expect(msg).toContain("김기사");
  });

  it("작업 완료 메시지는 후기 링크가 있으면 포함, 없으면 미포함", () => {
    const withReview = buildWorkCompletedMessage("홍길동", "https://x.kr/review/1");
    expect(withReview).toContain("후기 작성: https://x.kr/review/1");
    const noReview = buildWorkCompletedMessage("홍길동");
    expect(noReview).not.toContain("후기 작성");
  });
});

describe("알림톡 우선 발송 / 문자 대체 로직", () => {
  const orig = { ...process.env };
  beforeEach(() => {
    delete process.env.SOLAPI_ALIMTALK_ENABLED;
    delete process.env.SOLAPI_KAKAO_PFID;
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER;
  });
  afterEach(() => {
    process.env = { ...orig };
  });

  it("알림톡 미설정 시 isAlimtalkConfigured는 false", () => {
    expect(isAlimtalkConfigured()).toBe(false);
  });

  it("알림톡 미설정 + SMS 미설정 시 SMS 채널로 SKIPPED 반환(대체 없음)", async () => {
    const r = await sendNotification("01012345678", "테스트");
    expect(r.channel).toBe("SMS");
    expect(r.fallbackUsed).toBe(false);
    expect(r.result).toBe("SKIPPED");
  });

  it("알림톡 설정되어도 템플릿 미구현이면 문자로 대체 발송(fallbackUsed=true)", async () => {
    process.env.SOLAPI_ALIMTALK_ENABLED = "true";
    process.env.SOLAPI_KAKAO_PFID = "@futureenergy";
    // SMS 자격증명도 설정해야 대체 발송이 SUCCESS/SKIPPED 흐름을 탄다
    const r = await sendNotification("01012345678", "테스트");
    expect(r.channel).toBe("SMS");
    expect(r.fallbackUsed).toBe(true);
  });
});
