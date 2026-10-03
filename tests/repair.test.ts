import { describe, it, expect } from "vitest";

// 접수번호 생성 로직 테스트
function generateRequestNumber(): string {
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `FE-${ymd}-${rand}`;
}

describe("접수번호 생성", () => {
  it("FE- 접두사로 시작해야 한다", () => {
    const num = generateRequestNumber();
    expect(num).toMatch(/^FE-/);
  });

  it("FE-YYYYMMDD-NNNN 형식이어야 한다", () => {
    const num = generateRequestNumber();
    expect(num).toMatch(/^FE-\d{8}-\d{4}$/);
  });

  it("랜덤 숫자가 1000~9999 범위여야 한다", () => {
    for (let i = 0; i < 20; i++) {
      const num = generateRequestNumber();
      const parts = num.split("-");
      const rand = parseInt(parts[2]);
      expect(rand).toBeGreaterThanOrEqual(1000);
      expect(rand).toBeLessThanOrEqual(9999);
    }
  });
});

// 증상 유효성 검사 테스트
const VALID_SYMPTOMS = [
  "집전체가춥다",
  "방일부만춥다",
  "분배기에서물이샌다",
  "온도조절기가작동하지않는다",
  "난방비가많이나온다",
  "배관청소가필요하다",
  "기타문의",
] as const;

describe("증상 유효성 검사", () => {
  it("유효한 증상 목록이 7개여야 한다", () => {
    expect(VALID_SYMPTOMS.length).toBe(7);
  });

  it("각 증상이 문자열이어야 한다", () => {
    VALID_SYMPTOMS.forEach((s) => {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    });
  });
});

// 처리 상태 유효성 검사 테스트
const VALID_STATUSES = [
  "신규접수",
  "기사배정대기",
  "방문예정",
  "작업진행중",
  "견적승인대기",
  "작업완료",
  "재방문필요",
] as const;

describe("처리 상태 유효성 검사", () => {
  it("처리 상태가 7단계여야 한다", () => {
    expect(VALID_STATUSES.length).toBe(7);
  });

  it("신규접수가 첫 번째 상태여야 한다", () => {
    expect(VALID_STATUSES[0]).toBe("신규접수");
  });

  it("작업완료가 포함되어야 한다", () => {
    expect(VALID_STATUSES).toContain("작업완료");
  });
});

// 입력 유효성 검사 테스트
describe("입력 유효성 검사", () => {
  it("전화번호 최소 길이 검사 (9자 이상)", () => {
    const validatePhone = (phone: string) => phone.trim().length >= 9;
    expect(validatePhone("010-1234-5678")).toBe(true);
    expect(validatePhone("010-123")).toBe(false);
    expect(validatePhone("")).toBe(false);
  });

  it("고객 이름 필수 검사", () => {
    const validateName = (name: string) => name.trim().length > 0;
    expect(validateName("홍길동")).toBe(true);
    expect(validateName("")).toBe(false);
    expect(validateName("   ")).toBe(false);
  });
});
