import { describe, it, expect } from "vitest";
import * as db from "../server/db";

describe("관리자 비밀번호 변경 로직", () => {
  it("현재 비밀번호가 틀리면 실패한다", async () => {
    const result = await db.changeAdminPassword(
      "____wrong_password____",
      "newpass123"
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("새 비밀번호가 4자 미만이면 실패한다", async () => {
    // 현재 비밀번호 확인 (기본값 admin1234 또는 변경된 값)
    const current = await db.getAdminPassword();
    const result = await db.changeAdminPassword(current, "12");
    expect(result.success).toBe(false);
    expect(result.error).toContain("4자");
  });

  it("비밀번호 검증 함수는 boolean을 반환한다", async () => {
    const result = await db.verifyAdminPassword("test");
    expect(typeof result).toBe("boolean");
  });
});

describe("기사 관리 데이터 함수", () => {
  it("활성 기사 목록을 배열로 반환한다", async () => {
    const list = await db.getActiveTechnicians();
    expect(Array.isArray(list)).toBe(true);
  });

  it("전체 기사 목록을 배열로 반환한다", async () => {
    const list = await db.getAllTechnicians();
    expect(Array.isArray(list)).toBe(true);
  });

  it("기사 등록 → 수정 → 비활성화 라이프사이클이 동작한다", async () => {
    const db_ = await db.getDb();
    if (!db_) {
      console.warn("[기사 테스트] DB 미연결 - 스킵");
      return;
    }
    // 등록
    const created = await db.createTechnician({
      name: "테스트기사_vitest",
      phoneNumber: "010-9999-0000",
      specialty: "테스트분야",
    });
    expect(created.id).toBeGreaterThan(0);

    // 수정
    await db.updateTechnician(created.id, { specialty: "수정된분야" });

    // 비활성화
    await db.setTechnicianActive(created.id, false);

    const all = await db.getAllTechnicians();
    const target = all.find((t) => t.id === created.id);
    expect(target).toBeTruthy();
    expect(target?.specialty).toBe("수정된분야");
    expect(target?.isActive).toBe(false);

    // 활성 목록에는 없어야 함
    const active = await db.getActiveTechnicians();
    expect(active.find((t) => t.id === created.id)).toBeFalsy();
  });
});
