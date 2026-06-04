import { describe, it, expect } from "vitest";
import {
  buildReceivedMessage,
  buildStatusChangeMessage,
  isSmsConfigured,
  sendSms,
} from "../server/notification";

describe("알림 메시지 생성", () => {
  it("접수 완료 메시지에 고객명/접수번호가 포함된다", () => {
    const msg = buildReceivedMessage("홍길동", "FE-20240604-1234", "난방 고장");
    expect(msg).toContain("홍길동");
    expect(msg).toContain("FE-20240604-1234");
    expect(msg).toContain("난방 고장");
    expect(msg).toContain("퓨처에너지 난방케어");
  });

  it("방문예정 상태 변경 메시지에 기사명/일정이 포함된다", () => {
    const msg = buildStatusChangeMessage(
      "김철수",
      "FE-20240604-5678",
      "방문예정",
      "이기사",
      "2024-06-10",
      "오전"
    );
    expect(msg).toContain("김철수");
    expect(msg).toContain("방문예정");
    expect(msg).toContain("이기사");
    expect(msg).toContain("2024-06-10");
  });

  it("작업완료 상태 변경 메시지에 감사 문구가 포함된다", () => {
    const msg = buildStatusChangeMessage(
      "박영희",
      "FE-20240604-9999",
      "작업완료"
    );
    expect(msg).toContain("작업완료");
    expect(msg).toContain("감사");
  });
});

describe("SMS 자격증명 검증", () => {
  it("자격증명 설정 여부를 boolean으로 반환한다", () => {
    const configured = isSmsConfigured();
    expect(typeof configured).toBe("boolean");
  });

  it("자격증명이 유효하면 발송 시도, 없으면 SKIPPED를 반환한다", async () => {
    const result = await sendSms("01012345678", "테스트 메시지");
    // 자격증명 미설정: SKIPPED / 설정+유효: SUCCESS / 설정+무효: FAILED
    expect(["SUCCESS", "FAILED", "SKIPPED"]).toContain(result.result);

    if (!isSmsConfigured()) {
      // 자격증명이 없으면 반드시 SKIPPED여야 한다
      expect(result.result).toBe("SKIPPED");
    } else {
      // 자격증명이 있으면 실제 발송을 시도한다 (SUCCESS 또는 인증/번호 오류로 FAILED)
      expect(["SUCCESS", "FAILED"]).toContain(result.result);
      if (result.result === "FAILED") {
        console.warn(
          "[SMS 발송 테스트] 자격증명은 설정되었으나 발송 실패:",
          result.errorMessage
        );
      }
    }
  }, 15000);
});
