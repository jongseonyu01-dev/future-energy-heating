export type PriceMode = "standard" | "discount" | "dist_discount";

export type PriceItem = {
  id: number;
  category: string;
  name: string;
  unit?: string | null;
  stdPrice: number;
  discPrice: number;
  description?: string | null;
  isActive?: boolean;
};

export type QuoteLineSource = "manifold" | "auto" | "thermostat" | "actuator" | "controller" | "configuration" | "partial" | "pipe";

export type ControllerType = "none" | "basic" | "wifi" | "vtype";

export type QuoteLine = {
  lineId: string;
  priceItemId: number | null;
  name: string;
  category: string;
  unit: string | null;
  qty: number;
  unitPrice: number;
  subtotal: number;
  priceMode: PriceMode;
  stdPrice: number;
  discPrice: number;
  source: QuoteLineSource;
  auto: boolean;
  distOnly: boolean;
  controllerType?: Exclude<ControllerType, "none">;
  manifoldPort?: number;
  areaPyeong?: number;
  automationKey?: string;
};

export type QuoteDraft = {
  version: 1;
  customer: { name: string; phone: string; requestId: string | null };
  memo: string;
  priceMode: Exclude<PriceMode, "dist_discount">;
  selectedPort: number | null;
  lines: QuoteLine[];
  savedAt: string;
};

export const PORTS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const DIST_ONLY_NAMES = new Set([
  "유량밸브 15A",
  "메인밸브 20A (분배기교체)",
  "메인밸브 25A (분배기교체)",
]);

const LEGACY_PARTIAL_NAMES = new Set([
  "유량밸브 교체",
  "스트레이너 교체",
  "배관 수리",
  "배관 청소",
  "배관 교체 (m당)",
  "온도조절기 교체",
  "구동기 교체",
  "제어기 교체",
  "열량계 교체",
  "수도계량기 교체",
  "전체 배관 세척",
  "분배기 청소",
  "기본 점검",
  "정밀 점검",
  "긴급출동비",
  "기타 부품 교체",
]);

/** 현재 홈페이지 자동견적의 현행 독립 시공 항목. 공용 단가 DB를 변경하지 않는다. */
const CURRENT_PARTIAL_CONTRACT_ITEMS: PriceItem[] = [
  { id: -1001, category: "밸브/배관", name: "유량밸브 15A / 부분수리", unit: "개", stdPrice: 74000, discPrice: 58000 },
  { id: -1002, category: "밸브/배관", name: "유량밸브 20A / 부분수리", unit: "개", stdPrice: 82000, discPrice: 65000 },
  { id: -1003, category: "밸브/배관", name: "유량밸브 25A / 부분수리", unit: "개", stdPrice: 114000, discPrice: 94000 },
  { id: -1101, category: "밸브/배관", name: "나비밸브 XL 15A", unit: "개", stdPrice: 58000, discPrice: 45000 },
  { id: -1102, category: "밸브/배관", name: "나비밸브 동 15A", unit: "개", stdPrice: 74000, discPrice: 59000 },
];

const MANIFOLD_MAIN_VALVE_CONTRACT: Record<20 | 25, { stdPrice: number; discPrice: number }> = {
  20: { stdPrice: 91000, discPrice: 73000 },
  25: { stdPrice: 108000, discPrice: 91000 },
};

export class QuotePriceError extends Error {}

/** 견적 단가는 정수 원화만 허용한다. 소수 단가는 항목·초안·제출 모두 차단한다. */
function asPositiveWholeWon(value: number | null | undefined): number | null {
  const price = Number(value);
  return Number.isFinite(price) && Number.isInteger(price) && price > 0 ? price : null;
}

function activeItems(items: PriceItem[]): PriceItem[] {
  return items.filter((item) => item.isActive !== false);
}

function findItem(items: PriceItem[], name: string): PriceItem | undefined {
  return activeItems(items).find((item) => item.name === name);
}

function findItemByNames(items: PriceItem[], names: string[]): PriceItem | undefined {
  return activeItems(items).find((item) => names.includes(item.name));
}

function priceFor(item: PriceItem, mode: Exclude<PriceMode, "dist_discount">): number {
  const price = asPositiveWholeWon(mode === "standard" ? item.stdPrice : item.discPrice);
  if (price == null) {
    throw new QuotePriceError(`${item.name}의 ${mode === "standard" ? "표준시공가" : "단체할인가"}가 정수 원화로 등록되지 않았습니다.`);
  }
  return price;
}

function createLine(
  item: PriceItem,
  options: {
    source: QuoteLineSource;
    mode: Exclude<PriceMode, "dist_discount">;
    qty?: number;
    auto?: boolean;
    distOnly?: boolean;
    overridePrice?: number;
    controllerType?: Exclude<ControllerType, "none">;
    manifoldPort?: number;
    areaPyeong?: number;
    automationKey?: string;
  },
): QuoteLine {
  const qty = Math.max(1, Math.trunc(options.qty ?? 1));
  const distOnly = options.distOnly ?? false;
  const unitPrice = options.overridePrice ?? priceFor(item, options.mode);
  if (asPositiveWholeWon(unitPrice) == null) {
    throw new QuotePriceError(`${item.name}의 유효 단가가 정수 원화가 아닙니다.`);
  }
  const priceMode: PriceMode = distOnly ? "dist_discount" : options.mode;
  const key = options.automationKey ?? options.controllerType ?? options.manifoldPort ?? options.areaPyeong ?? "one";
  return {
    lineId: `${options.source}:${item.id}:${key}`,
    priceItemId: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit ?? null,
    qty,
    unitPrice,
    subtotal: qty * unitPrice,
    priceMode,
    stdPrice: options.overridePrice ?? Number(item.stdPrice),
    discPrice: options.overridePrice ?? Number(item.discPrice),
    source: options.source,
    auto: options.auto ?? false,
    distOnly,
    controllerType: options.controllerType,
    manifoldPort: options.manifoldPort,
    areaPyeong: options.areaPyeong,
    automationKey: options.automationKey,
  };
}

function ensurePort(port: number): void {
  if (!PORTS.includes(port as (typeof PORTS)[number])) {
    throw new QuotePriceError("분배기 구수는 2구부터 10구까지 선택해야 합니다.");
  }
}

export function totalOf(lines: QuoteLine[]): number {
  return lines.reduce((sum, line) => sum + line.subtotal, 0);
}

export function getPartialSelectableItems(items: PriceItem[]): PriceItem[] {
  const currentItems = activeItems(items).filter((item) => {
    if (item.category === "분배기교체") return false;
    if (/^분배기 교체 \(\d+구\)$/.test(item.name)) return false;
    if (DIST_ONLY_NAMES.has(item.name)) return false;
    if (LEGACY_PARTIAL_NAMES.has(item.name)) return false;
    return asPositiveWholeWon(item.stdPrice) != null && asPositiveWholeWon(item.discPrice) != null;
  });
  const names = new Set(currentItems.map((item) => item.name));
  return [...currentItems, ...CURRENT_PARTIAL_CONTRACT_ITEMS.filter((item) => !names.has(item.name))];
}

export function getDirectSelectableItems(items: PriceItem[]): PriceItem[] {
  return getPartialSelectableItems(items).filter((item) => asPositiveWholeWon(item.stdPrice) != null && asPositiveWholeWon(item.discPrice) != null);
}

export function addDirectItem(
  lines: QuoteLine[],
  item: PriceItem,
  mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  const next = createLine(item, { source: "partial", mode });
  const existing = lines.find((line) => line.lineId === next.lineId);
  const withDirectItem = !existing ? [...lines, next] : lines.map((line) =>
    line.lineId === next.lineId
      ? { ...line, qty: line.qty + 1, subtotal: (line.qty + 1) * line.unitPrice }
      : line,
  );
  return syncSupplyLineRepairPrice(withDirectItem);
}

/** 빠른 선택 버튼은 동일 단독보수 품목을 추가·해제하되 이미 입력한 수량은 임의로 바꾸지 않는다. */
export function toggleDirectItem(
  lines: QuoteLine[],
  item: PriceItem,
  mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  const next = createLine(item, { source: "partial", mode });
  const selected = lines.some((line) => line.lineId === next.lineId);
  return syncSupplyLineRepairPrice(selected ? lines.filter((line) => line.lineId !== next.lineId) : [...lines, next]);
}

/** 각방 구성의 단자함은 기존 제어기 버튼 배열과 같은 활성 단가를 사용한다. */
export function toggleTerminalBox(
  lines: QuoteLine[],
  items: PriceItem[],
  mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  const item = findItem(items, "단자함");
  if (!item) throw new QuotePriceError("단자함 단가를 불러오지 못했습니다.");
  const automationKey = "terminal-box";
  const selected = lines.some((line) => line.source === "configuration" && line.automationKey === automationKey);
  const retained = lines.filter((line) => !(line.source === "configuration" && line.automationKey === automationKey));
  if (selected) return retained;
  return [...retained, createLine(item, { source: "configuration", mode, automationKey })];
}

/** 현재 홈페이지의 공급측 라인보수 단가 분기: 라인보수 동시 70,000원, 단독 120,000원. */
export function addSupplyLineRepair(
  lines: QuoteLine[],
  mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  const hasLineRepair = lines.some((line) => line.name.startsWith("라인보수 20A") || line.name.startsWith("라인보수 25A"));
  const price = hasLineRepair ? 70000 : 120000;
  const name = hasLineRepair ? "공급측 라인보수 (라인보수 동시)" : "공급측 라인보수 (공급측만 단독)";
  const next = lines.filter((line) => !line.name.startsWith("공급측 라인보수"));
  const item: PriceItem = { id: -1200, category: "밸브/배관", name, unit: "식", stdPrice: price, discPrice: price };
  return [...next, createLine(item, { source: "partial", mode })];
}

/** 라인보수 동시 여부가 바뀌면 기존 공급측 라인보수의 승인 분기만 동기화한다. */
function syncSupplyLineRepairPrice(lines: QuoteLine[]): QuoteLine[] {
  const supply = lines.find((line) => line.name.startsWith("공급측 라인보수"));
  if (!supply) return lines;
  const hasLineRepair = lines.some((line) => line.name.startsWith("라인보수 20A") || line.name.startsWith("라인보수 25A"));
  const unitPrice = hasLineRepair ? 70000 : 120000;
  const name = hasLineRepair ? "공급측 라인보수 (라인보수 동시)" : "공급측 라인보수 (공급측만 단독)";
  return lines.map((line) => line.lineId === supply.lineId
    ? { ...line, name, unitPrice, subtotal: line.qty * unitPrice, stdPrice: unitPrice, discPrice: unitPrice }
    : line);
}

/** 현재 홈페이지의 분배기 시공 전용 메인밸브 단가를 현재 견적에 추가한다. */
export function addManifoldMainValve(
  lines: QuoteLine[],
  size: 20 | 25,
  mode: Exclude<PriceMode, "dist_discount">,
  qty = 1,
): QuoteLine[] {
  const price = MANIFOLD_MAIN_VALVE_CONTRACT[size];
  const item: PriceItem = {
    id: size === 20 ? -1300 : -1301,
    category: "밸브/배관",
    name: `메인밸브 ${size}A (분배기교체)`,
    unit: "개",
    stdPrice: price.stdPrice,
    discPrice: price.discPrice,
  };
  const line = createLine(item, { source: "partial", mode, qty });
  const retained = lines.filter((existing) => existing.lineId !== line.lineId);
  return [...retained, line];
}

export function selectManifold(
  lines: QuoteLine[],
  items: PriceItem[],
  port: number,
  mode: Exclude<PriceMode, "dist_discount">,
  areaPyeong?: number | null,
): QuoteLine[] {
  ensurePort(port);
  const manifold = findItem(items, `분배기 교체 (${port}구)`);
  const strainer = findItem(items, "스트레이너 25A");
  if (!manifold || !strainer) {
    throw new QuotePriceError("분배기 본체 또는 분배기 시공용 스트레이너 단가를 불러오지 못했습니다.");
  }

  const hadAllRoomFlowValve = lines.some((line) => line.source === "auto" && line.name === "유량밸브 15A");
  const roomThermostats = lines.filter((line) => line.source === "thermostat" && line.automationKey?.startsWith("room-"));
  const actuators = lines.filter((line) => line.source === "actuator");
  const retained = lines.filter(
    (line) => line.source !== "manifold" && line.source !== "auto" && line.source !== "thermostat" && line.source !== "actuator" && !(line.source === "pipe" && line.auto),
  );
  let next: QuoteLine[] = [
    ...retained,
    createLine(manifold, { source: "manifold", mode, manifoldPort: port }),
    // 현재 홈페이지 계약: 분배기 교체용 스트레이너는 36,000원 고정이다.
    createLine(strainer, {
      source: "auto",
      mode,
      auto: true,
      distOnly: true,
      overridePrice: 36000,
      manifoldPort: port,
    }),
  ];

  if (hadAllRoomFlowValve) {
    const valve = findItem(items, "유량밸브 15A");
    if (!valve) throw new QuotePriceError("유량밸브 15A 단가를 불러오지 못했습니다.");
    // 분배기 전체 각방 유량밸브는 활성 단체할인가가 있어야만 추가한다.
    // 과거 29,000원 고정값·0원 fallback은 사용하지 않는다.
    const discountPrice = priceFor(valve, "discount");
    next = [
      ...next,
      createLine(valve, { source: "auto", mode, qty: port, auto: true, distOnly: true, overridePrice: discountPrice, manifoldPort: port, automationKey: "all-room-flow" }),
    ];
  }

  for (const line of roomThermostats) {
    const item = findItemByNames(items, [line.name]);
    if (!item) throw new QuotePriceError(`${line.name} 단가를 불러오지 못했습니다.`);
    next.push(createLine(item, { source: "thermostat", mode, qty: port, auto: true, manifoldPort: port, automationKey: line.automationKey }));
  }
  for (const line of actuators) {
    const item = findItemByNames(items, [line.name]);
    if (!item) throw new QuotePriceError(`${line.name} 단가를 불러오지 못했습니다.`);
    next.push(createLine(item, { source: "actuator", mode, qty: port, auto: true, manifoldPort: port, automationKey: line.automationKey }));
  }

  if (areaPyeong != null && Number.isFinite(areaPyeong) && areaPyeong >= 10) {
    next.push(createPipeCleaningLine(areaPyeong, mode, true));
  }
  return syncControllerAutoDigitalThermostat(next, items, mode);
}

export function addAllRoomFlowValve(
  lines: QuoteLine[],
  items: PriceItem[],
  port: number,
  mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  ensurePort(port);
  const valve = findItem(items, "유량밸브 15A");
  if (!valve) throw new QuotePriceError("유량밸브 15A 단가를 불러오지 못했습니다.");
  // 활성 단체가가 없거나 0원이면 priceFor가 예외를 던져 품목을 추가하지 않는다.
  const discountPrice = priceFor(valve, "discount");
  const filtered = lines.filter((line) => !(line.source === "auto" && line.name === "유량밸브 15A"));
  return [
    ...filtered,
    createLine(valve, { source: "auto", mode, qty: port, auto: true, distOnly: true, overridePrice: discountPrice, manifoldPort: port, automationKey: "all-room-flow" }),
  ];
}

type ThermostatKind = "digital" | "analog";
type ActuatorKind = "paraffin" | "motor";

const THERMOSTAT_NAMES: Record<ThermostatKind, string[]> = {
  digital: ["디지털 온도조절기"],
  analog: ["아날로그 조절기", "아날로그 온도조절기"],
};

const ACTUATOR_NAMES: Record<ActuatorKind, string[]> = {
  paraffin: ["구동기 파라핀"],
  motor: ["구동기 모터타입"],
};

export function toggleRoomThermostat(
  lines: QuoteLine[],
  items: PriceItem[],
  kind: ThermostatKind,
  port: number,
  mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  ensurePort(port);
  const automationKey = `room-${kind}`;
  const selected = lines.some((line) => line.source === "thermostat" && line.automationKey === automationKey);
  // 운영 홈페이지 계약: 각방 조절기는 한 종류만 자동 적용한다.
  // 같은 종류 재선택은 해제하고, 다른 종류 선택은 기존 각방 조절기를 교체한다.
  const retained = lines.filter((line) => !(line.source === "thermostat" && line.automationKey?.startsWith("room-")));
  if (selected) return retained;
  const item = findItemByNames(items, THERMOSTAT_NAMES[kind]);
  if (!item) throw new QuotePriceError(`${kind === "digital" ? "디지털" : "아날로그"} 온도조절기 단가를 불러오지 못했습니다.`);
  return [...retained, createLine(item, { source: "thermostat", mode, qty: port, auto: true, manifoldPort: port, automationKey })];
}

export function toggleActuator(
  lines: QuoteLine[],
  items: PriceItem[],
  kind: ActuatorKind,
  port: number,
  mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  ensurePort(port);
  const automationKey = `actuator-${kind}`;
  const selected = lines.some((line) => line.source === "actuator" && line.automationKey === automationKey);
  const retained = lines.filter((line) => line.source !== "actuator");
  if (selected) return retained;
  const item = findItemByNames(items, ACTUATOR_NAMES[kind]);
  if (!item) throw new QuotePriceError(`${kind === "paraffin" ? "파라핀" : "모터"} 구동기 단가를 불러오지 못했습니다.`);
  return [...retained, createLine(item, { source: "actuator", mode, qty: port, auto: true, manifoldPort: port, automationKey })];
}

function syncControllerAutoDigitalThermostat(
  lines: QuoteLine[],
  _items: PriceItem[],
  _mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  // 홈페이지 현행 계약: 제어기 선택은 각방 디지털/아날로그 조절기 수량을 바꾸지 않는다.
  // 과거 controller-digital 자동 3개 line이 남아 있으면 제거해 기존 수량과 중복되지 않게 한다.
  return lines.filter((line) => !(line.source === "thermostat" && line.automationKey === "controller-digital"));
}

export function clearManifoldSelection(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((line) => !(
    line.source === "manifold" ||
    line.source === "auto" ||
    line.source === "thermostat" ||
    line.source === "actuator" ||
    line.source === "controller" ||
    line.source === "configuration" ||
    (line.source === "pipe" && line.auto)
  ));
}

export function clearAllRoomConfiguration(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((line) => !(
    (line.source === "auto" && line.name === "유량밸브 15A") ||
    line.source === "thermostat" ||
    line.source === "actuator" ||
    line.source === "controller" ||
    line.source === "configuration"
  ));
}

export function createPipeCleaningLine(
  areaPyeong: number,
  mode: Exclude<PriceMode, "dist_discount">,
  auto = false,
): QuoteLine {
  const area = Math.trunc(areaPyeong);
  if (!Number.isFinite(area) || area < 10) {
    throw new QuotePriceError("배관청소 평형은 10평 이상이어야 합니다.");
  }
  const stdPrice = area * 1000 + 140000;
  const discPrice = area * 1000 + 80000;
  const unitPrice = mode === "standard" ? stdPrice : discPrice;
  return {
    lineId: `pipe:${area}:${auto ? "auto" : "manual"}`,
    priceItemId: null,
    name: `배관청소 (${area}평)`,
    category: "밸브/배관",
    unit: "식",
    qty: 1,
    unitPrice,
    subtotal: unitPrice,
    priceMode: mode,
    stdPrice,
    discPrice,
    source: "pipe",
    auto,
    distOnly: false,
    areaPyeong: area,
  };
}

export function toggleController(
  lines: QuoteLine[],
  items: PriceItem[],
  type: ControllerType,
  mode: Exclude<PriceMode, "dist_discount">,
): QuoteLine[] {
  const special = type === "wifi" || type === "vtype";
  const selected = lines.some((line) => line.controllerType === type);
  let retained: QuoteLine[];

  if (special) {
    retained = lines.filter((line) => line.controllerType !== "basic" && line.controllerType !== type);
  } else {
    retained = lines.filter((line) => !line.controllerType);
  }
  if (type === "none" || selected) return syncControllerAutoDigitalThermostat(retained, items, mode);

  const nameByType: Record<Exclude<ControllerType, "none">, string> = {
    basic: "제어기",
    wifi: "와이파이형 제어기",
    vtype: "조절기 V타입",
  };
  const item = findItem(items, nameByType[type]);
  if (!item) throw new QuotePriceError(`${nameByType[type]} 단가를 불러오지 못했습니다.`);
  return syncControllerAutoDigitalThermostat(
    [...retained, createLine(item, { source: "controller", mode, auto: true, controllerType: type })],
    items,
    mode,
  );
}

export function setLineQuantity(lines: QuoteLine[], lineId: string, requestedQty: number): QuoteLine[] {
  if (!Number.isInteger(requestedQty) || requestedQty < 1) {
    throw new QuotePriceError("수량은 1 이상 정수여야 합니다.");
  }
  const qty = requestedQty;
  return lines.map((line) => line.lineId === lineId ? { ...line, qty, subtotal: qty * line.unitPrice } : line);
}

export function removeLine(lines: QuoteLine[], lineId: string): QuoteLine[] {
  return syncSupplyLineRepairPrice(lines.filter((line) => line.lineId !== lineId));
}

export function applyPriceMode(lines: QuoteLine[], mode: Exclude<PriceMode, "dist_discount">): QuoteLine[] {
  return lines.map((line) => {
    if (line.distOnly) return line;
    const unitPrice = mode === "standard" ? line.stdPrice : line.discPrice;
    if (asPositiveWholeWon(unitPrice) == null) throw new QuotePriceError(`${line.name}의 선택 가격이 정수 원화가 아닙니다.`);
    return { ...line, priceMode: mode, unitPrice, subtotal: line.qty * unitPrice };
  });
}

export function validateDraft(draft: QuoteDraft): QuoteDraft {
  if (!draft || draft.version !== 1 || !Array.isArray(draft.lines)) throw new QuotePriceError("저장된 초안 형식이 올바르지 않습니다.");
  for (const line of draft.lines) {
    if (!line.name || !Number.isFinite(line.qty) || !Number.isInteger(line.qty) || line.qty < 1 || asPositiveWholeWon(line.unitPrice) == null) {
      throw new QuotePriceError("저장된 초안에 유효하지 않은 품목 또는 단가가 있습니다.");
    }
    if (!Number.isInteger(line.subtotal) || line.subtotal !== line.qty * line.unitPrice) throw new QuotePriceError("저장된 초안의 품목 합계가 일치하지 않습니다.");
  }
  return draft;
}
