import { describe, expect, it } from "vitest";
import {
  QuotePriceError,
  addAllRoomFlowValve,
  addDirectItem,
  addManifoldMainValve,
  addSupplyLineRepair,
  applyPriceMode,
  clearManifoldSelection,
  createPipeCleaningLine,
  getPartialSelectableItems,
  removeLine,
  selectManifold,
  setLineQuantity,
  toggleActuator,
  toggleController,
  toggleDirectItem,
  toggleRoomThermostat,
  toggleTerminalBox,
  totalOf,
  type PriceItem,
  type QuoteDraft,
  validateDraft,
} from "../lib/tech-estimate-engine";

const prices: PriceItem[] = [
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((port, index) => ({
    id: index + 1,
    category: "분배기교체",
    name: `분배기 교체 (${port}구)`,
    unit: "식",
    stdPrice: 500000 + port * 1000,
    discPrice: 450000 + port * 1000,
  })),
  { id: 31, category: "밸브/배관", name: "스트레이너 25A", unit: "개", stdPrice: 81000, discPrice: 64000 },
  { id: 32, category: "밸브/배관", name: "유량밸브 15A", unit: "개", stdPrice: 74000, discPrice: 58000 },
  { id: 41, category: "제어/조절", name: "제어기", unit: "개", stdPrice: 141000, discPrice: 141000 },
  { id: 42, category: "제어/조절", name: "와이파이형 제어기", unit: "개", stdPrice: 220000, discPrice: 220000 },
  { id: 43, category: "제어/조절", name: "조절기 V타입", unit: "개", stdPrice: 110000, discPrice: 110000 },
  { id: 49, category: "제어/조절", name: "단자함", unit: "개", stdPrice: 38000, discPrice: 30000 },
  { id: 53, category: "밸브/배관", name: "라인보수 20A", unit: "개", stdPrice: 166000, discPrice: 143000 },
  { id: 54, category: "밸브/배관", name: "라인보수 25A", unit: "개", stdPrice: 203000, discPrice: 194000 },
  { id: 45, category: "제어/조절", name: "디지털 온도조절기", unit: "개", stdPrice: 106000, discPrice: 91000 },
  { id: 46, category: "제어/조절", name: "아날로그 조절기", unit: "개", stdPrice: 39000, discPrice: 30000 },
  { id: 47, category: "제어/조절", name: "구동기 파라핀", unit: "개", stdPrice: 40000, discPrice: 35000 },
  { id: 48, category: "제어/조절", name: "구동기 모터타입", unit: "개", stdPrice: 50000, discPrice: 42000 },
  { id: 44, category: "제어/조절", name: "제어기 교체", unit: "개", stdPrice: 55000, discPrice: 48000 },
  { id: 51, category: "청소/점검", name: "분배기 청소", unit: "식", stdPrice: 50000, discPrice: 44000 },
  { id: 52, category: "기타", name: "기타 공사", unit: "식", stdPrice: 0, discPrice: 0 },
];

describe("tech estimate engine parity", () => {
  it("selects 2–10 ports and replaces a prior manifold without retaining a duplicate", () => {
    for (const port of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const selected = selectManifold([], prices, port, "standard", 24);
      expect(selected.filter((line) => line.source === "manifold")).toHaveLength(1);
      expect(selected.find((line) => line.source === "manifold")?.name).toBe(`분배기 교체 (${port}구)`);
      expect(selected.find((line) => line.name === "스트레이너 25A")?.unitPrice).toBe(36000);
    }

    let lines = selectManifold([], prices, 2, "standard", 24);
    lines = addAllRoomFlowValve(lines, prices, 2, "standard");
    lines = selectManifold(lines, prices, 10, "standard", 24);

    expect(lines.filter((line) => line.source === "manifold")).toHaveLength(1);
    expect(lines.find((line) => line.source === "manifold")?.name).toBe("분배기 교체 (10구)");
    expect(lines.find((line) => line.name === "유량밸브 15A")?.qty).toBe(10);
    expect(lines.find((line) => line.name === "유량밸브 15A")?.unitPrice).toBe(58000);
    expect(lines.filter((line) => line.name === "스트레이너 25A")[0]?.unitPrice).toBe(36000);
  });

  it("keeps wifi and V-type controllers independent and toggles each one separately", () => {
    let lines = toggleController([], prices, "wifi", "standard");
    lines = toggleController(lines, prices, "vtype", "standard");
    expect(lines.filter((line) => line.source === "controller").map((line) => line.name)).toEqual(["와이파이형 제어기", "조절기 V타입"]);
    expect(lines.some((line) => line.automationKey === "controller-digital")).toBe(false);

    lines = toggleController(lines, prices, "wifi", "standard");
    expect(lines.filter((line) => line.source === "controller").map((line) => line.name)).toEqual(["조절기 V타입"]);
    expect(lines.some((line) => line.automationKey === "controller-digital")).toBe(false);
    lines = toggleController(lines, prices, "vtype", "standard");
    expect(lines).toHaveLength(0);
  });

  it("adds the terminal box to manifold room configuration with the active approved price and clears it with the manifold", () => {
    let lines = selectManifold([], prices, 4, "standard");
    lines = addAllRoomFlowValve(lines, prices, 4, "standard");
    lines = toggleController(lines, prices, "wifi", "standard");
    lines = toggleController(lines, prices, "vtype", "standard");
    lines = toggleTerminalBox(lines, prices, "standard");

    expect(lines.find((line) => line.automationKey === "terminal-box")).toMatchObject({ name: "단자함", source: "configuration", unitPrice: 38000, qty: 1, subtotal: 38000 });
    expect(lines.filter((line) => line.source === "controller").map((line) => line.name)).toEqual(["와이파이형 제어기", "조절기 V타입"]);
    expect(clearManifoldSelection(lines).some((line) => line.name === "단자함")).toBe(false);
  });

  it("keeps homepage room thermostat and actuator selections at the selected port quantity", () => {
    let lines = selectManifold([], prices, 4, "discount");
    lines = addAllRoomFlowValve(lines, prices, 4, "discount");
    lines = toggleRoomThermostat(lines, prices, "digital", 4, "discount");
    lines = toggleActuator(lines, prices, "paraffin", 4, "discount");
    lines = selectManifold(lines, prices, 7, "discount");
    expect(lines.find((line) => line.automationKey === "room-digital")?.qty).toBe(7);
    expect(lines.find((line) => line.automationKey === "actuator-paraffin")?.qty).toBe(7);
    expect(lines.find((line) => line.automationKey === "all-room-flow")?.unitPrice).toBe(58000);
  });

  it("replaces the room thermostat type instead of accumulating both types", () => {
    let lines = selectManifold([], prices, 4, "standard");
    lines = toggleRoomThermostat(lines, prices, "digital", 4, "standard");
    lines = toggleRoomThermostat(lines, prices, "analog", 4, "standard");
    expect(lines.filter((line) => line.source === "thermostat" && line.automationKey?.startsWith("room-"))).toHaveLength(1);
    expect(lines.find((line) => line.automationKey === "room-analog")).toMatchObject({ qty: 4, name: "아날로그 조절기" });
    expect(lines.some((line) => line.automationKey === "room-digital")).toBe(false);
  });

  it("clears manifold-linked lines and exposes no stale selection after manifold deletion", () => {
    let lines = selectManifold([], prices, 5, "standard");
    lines = addAllRoomFlowValve(lines, prices, 5, "standard");
    lines = toggleController(lines, prices, "wifi", "standard");
    expect(clearManifoldSelection(lines)).toEqual([]);
  });

  it("keeps current controller products distinct while excluding legacy partial placeholders", () => {
    const partialNames = getPartialSelectableItems(prices).map((item) => item.name);
    expect(partialNames).toContain("제어기");
    expect(partialNames).toContain("와이파이형 제어기");
    expect(partialNames).toContain("조절기 V타입");
    expect(partialNames).toContain("단자함");
    expect(partialNames).toContain("라인보수 20A");
    expect(partialNames).toContain("라인보수 25A");
    expect(partialNames).not.toContain("분배기 청소");
    expect(partialNames).not.toContain("제어기 교체");
    expect(partialNames).not.toContain("수도계량기 교체");
    expect(partialNames).toContain("스트레이너 25A");
  });

  it("uses website pipe-cleaning formulas for standard and discount prices", () => {
    expect(createPipeCleaningLine(32, "standard").unitPrice).toBe(172000);
    expect(createPipeCleaningLine(32, "discount").unitPrice).toBe(112000);
    expect(() => createPipeCleaningLine(9, "standard")).toThrow(QuotePriceError);
  });

  it("keeps the selected price category and exact snapshot prices in a reopening draft", () => {
    let lines = selectManifold([], prices, 4, "discount", 25);
    lines = toggleController(lines, prices, "wifi", "discount");
    lines = toggleController(lines, prices, "vtype", "discount");
    lines = setLineQuantity(lines, "controller:42:wifi", 2);
    const draft: QuoteDraft = {
      version: 1,
      customer: { name: "검증용", phone: "0000000000", requestId: null },
      memo: "draft parity",
      priceMode: "discount",
      selectedPort: 4,
      lines,
      savedAt: "2026-09-12T00:00:00.000Z",
    };
    const restored = validateDraft(JSON.parse(JSON.stringify(draft)));
    expect(restored).toEqual(draft);
    expect(totalOf(restored.lines)).toBe(totalOf(lines));
    expect(() => validateDraft({ ...draft, lines: [{ ...draft.lines[0], qty: 1.5, subtotal: draft.lines[0].unitPrice * 1.5 }] })).toThrow("유효하지 않은 품목 또는 단가");
  });

  it("reprices only current in-progress lines when price mode changes", () => {
    const line = addDirectItem([], prices.find((item) => item.name === "제어기 교체")!, "discount");
    expect(line[0]?.unitPrice).toBe(48000);
    expect(applyPriceMode(line, "standard")[0]?.unitPrice).toBe(55000);
  });

  it("fails closed when a required product price is absent instead of adding a zero-priced line", () => {
    const noWifi = prices.filter((item) => item.name !== "와이파이형 제어기");
    expect(() => toggleController([], noWifi, "wifi", "standard")).toThrow("단가를 불러오지 못했습니다");
    expect(getPartialSelectableItems(prices).map((item) => item.name)).not.toContain("기타 공사");
    expect(() => setLineQuantity(lineWithOnlyValidQty(), "partial:41:one", 0)).toThrow("수량은 1 이상 정수");
  });

  it("uses the active flow-valve discount price and blocks a missing or zero discount price", () => {
    const activeDiscount = addAllRoomFlowValve(selectManifold([], prices, 4, "standard"), prices, 4, "standard");
    expect(activeDiscount.find((line) => line.automationKey === "all-room-flow")).toMatchObject({ qty: 4, unitPrice: 58000, priceMode: "dist_discount" });
    const zeroDiscount = prices.map((item) => item.name === "유량밸브 15A" ? { ...item, discPrice: 0 } : item);
    expect(() => addAllRoomFlowValve(selectManifold([], prices, 4, "standard"), zeroDiscount, 4, "standard")).toThrow("단체할인가");
  });

  it("blocks fractional won prices from selectable items, automatic lines, and draft snapshots", () => {
    const fractional = prices.map((item) => item.name === "유량밸브 15A" ? { ...item, discPrice: 32000.5 } : item);
    expect(() => addAllRoomFlowValve(selectManifold([], prices, 4, "standard"), fractional, 4, "standard")).toThrow("정수 원화");

    const directFractional = { id: 99, category: "검수", name: "소수 단가 검수품", unit: "개", stdPrice: 32000.5, discPrice: 30000 };
    expect(getPartialSelectableItems([...prices, directFractional]).some((item) => item.id === directFractional.id)).toBe(false);

    const validDraft: QuoteDraft = {
      version: 1,
      customer: { name: "검증용", phone: "0000000000", requestId: null },
      memo: "",
      priceMode: "standard",
      selectedPort: null,
      lines: [{ ...addDirectItem([], prices.find((item) => item.name === "제어기")!, "standard")[0]!, unitPrice: 32000.5, subtotal: 32000.5 }],
      savedAt: "2026-09-13T00:00:00.000Z",
    };
    expect(() => validateDraft(validDraft)).toThrow("유효하지 않은 품목 또는 단가");
  });

  it("does not append controller thermostat lines to an existing room thermostat quantity", () => {
    let lines = selectManifold([], prices, 4, "standard");
    lines = addAllRoomFlowValve(lines, prices, 4, "standard");
    lines = toggleRoomThermostat(lines, prices, "digital", 4, "standard");
    lines = toggleController(lines, prices, "wifi", "standard");
    lines = toggleController(lines, prices, "vtype", "standard");
    expect(lines.find((line) => line.automationKey === "room-digital")).toMatchObject({ qty: 4, name: "디지털 온도조절기" });
    expect(lines.filter((line) => line.name === "디지털 온도조절기")).toHaveLength(1);
    expect(lines.some((line) => line.automationKey === "controller-digital")).toBe(false);
  });

  it("uses the current homepage supply-line repair price branch without reusing legacy repair entries", () => {
    const alone = addSupplyLineRepair([], "standard");
    expect(alone[0]).toMatchObject({ name: "공급측 라인보수 (공급측만 단독)", unitPrice: 120000 });
    const withLine = toggleDirectItem(alone, prices.find((item) => item.name === "라인보수 20A")!, "discount");
    expect(withLine.find((line) => line.name.startsWith("공급측 라인보수"))).toMatchObject({ name: "공급측 라인보수 (라인보수 동시)", unitPrice: 70000 });
    expect(withLine.find((line) => line.name === "라인보수 20A")).toMatchObject({ unitPrice: 143000, subtotal: 143000 });
    const restored = removeLine(withLine, withLine.find((line) => line.name === "라인보수 20A")!.lineId);
    expect(restored.find((line) => line.name.startsWith("공급측 라인보수"))).toMatchObject({ name: "공급측 라인보수 (공급측만 단독)", unitPrice: 120000 });
  });

  it("preserves current homepage manifold-only main-valve standard and discount prices", () => {
    expect(addManifoldMainValve([], 20, "standard")[0]).toMatchObject({ unitPrice: 91000, priceMode: "standard" });
    expect(addManifoldMainValve([], 25, "discount", 2)[0]).toMatchObject({ unitPrice: 91000, qty: 2, subtotal: 182000 });
  });
});

function lineWithOnlyValidQty() {
  return addDirectItem([], prices.find((item) => item.name === "제어기")!, "standard");
}
