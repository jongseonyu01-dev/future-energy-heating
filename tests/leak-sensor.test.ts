import { describe, it, expect } from "vitest";
import * as db from "../server/db";
import { buildLeakAlertMessage } from "../server/notification";

describe("누수 알림 메시지 빌더", () => {
  it("아파트명/동/호수/설치위치를 포함한 메시지를 생성한다", () => {
    const msg = buildLeakAlertMessage("한빛아파트", "101", "1203", "분배기 하단");
    expect(msg).toContain("[퓨처에너지테크]");
    expect(msg).toContain("누수 감지 알림입니다.");
    expect(msg).toContain("한빛아파트 101동 1203호");
    expect(msg).toContain("분배기 하단");
    expect(msg).toContain("고객센터");
  });
});

describe("누수센서 DB 조회", () => {
  it("전체 센서 목록을 조회할 수 있다", async () => {
    const sensors = await db.getAllSensors();
    expect(Array.isArray(sensors)).toBe(true);
    // 데모 데이터 3건 이상 존재
    expect(sensors.length).toBeGreaterThanOrEqual(3);
  });

  it("전화번호로 고객 센서를 조회할 수 있다 (하이픈 무관)", async () => {
    const all = await db.getAllSensors();
    if (all.length === 0) return;
    const target = all[0];
    const byPhone = await db.getSensorsByPhone(target.phoneNumber);
    expect(byPhone.length).toBeGreaterThanOrEqual(1);
    // 하이픈을 넣어도 동일하게 조회
    const digits = target.phoneNumber.replace(/[^0-9]/g, "");
    const withHyphen =
      digits.length === 11
        ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
        : target.phoneNumber;
    const byHyphen = await db.getSensorsByPhone(withHyphen);
    expect(byHyphen.length).toBeGreaterThanOrEqual(1);
  });

  it("id로 센서 단건을 조회할 수 있다", async () => {
    const all = await db.getAllSensors();
    if (all.length === 0) return;
    const found = await db.getSensorById(all[0].id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(all[0].id);
  });

  it("sensorUid로 센서를 조회할 수 있다", async () => {
    const all = await db.getAllSensors();
    if (all.length === 0) return;
    const found = await db.getSensorByUid(all[0].sensorUid);
    expect(found).not.toBeNull();
    expect(found?.sensorUid).toBe(all[0].sensorUid);
  });
});

describe("누수센서 상태 업데이트 및 복원 (웹훅/테스트 공통 경로)", () => {
  it("상태를 누수감지로 변경한 뒤 다시 정상으로 복원할 수 있다", async () => {
    const all = await db.getAllSensors();
    if (all.length === 0) return;
    // 정상 상태 센서를 하나 고른다 (없으면 첫 번째)
    const target = all.find((s) => s.status === "정상") ?? all[0];
    const original = {
      status: target.status,
      leakDetectedAt: target.leakDetectedAt,
      isResolved: target.isResolved,
    };

    const now = new Date();
    await db.updateSensorState(target.sensorUid, {
      status: "누수감지",
      leakDetectedAt: now,
      lastCommAt: now,
      isResolved: false,
    });
    const afterLeak = await db.getSensorById(target.id);
    expect(afterLeak?.status).toBe("누수감지");
    expect(afterLeak?.leakDetectedAt).not.toBeNull();

    // 이벤트 기록도 가능해야 한다
    await db.createSensorEvent({
      sensorUid: target.sensorUid,
      leakDetected: true,
      batteryLevel: target.batteryLevel,
      reportedAt: now,
      source: "DEMO_TEST",
      rawPayload: JSON.stringify({ test: true }),
    });
    const events = await db.getSensorEvents(target.sensorUid);
    expect(events.length).toBeGreaterThanOrEqual(1);

    // 원상 복원 (데모 일관성 유지)
    await db.updateSensorState(target.sensorUid, {
      status: original.status as any,
      leakDetectedAt: original.leakDetectedAt as any,
      isResolved: original.isResolved as any,
    });
    const restored = await db.getSensorById(target.id);
    expect(restored?.status).toBe(original.status);
  });
});
