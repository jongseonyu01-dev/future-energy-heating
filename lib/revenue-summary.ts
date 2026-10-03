export type CollectionRow = {
  reportId?: number | string | null;
  requestId?: number | string | null;
  completedAt?: Date | string | null;
  paymentMethod?: string | null;
  paymentAmount?: number | string | null;
};

export type PaymentAmountResult =
  | { ok: true; value: number | null }
  | { ok: false; value: null };

export type PaymentDraft = {
  paymentMethod: string;
  paymentAmount: string;
};

const KST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatKstParts(value: Date): Record<string, string> {
  return Object.fromEntries(
    KST_PARTS.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function getKstDayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = formatKstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getKstYearMonth(value: Date = new Date()): { year: number; month: number; key: string } {
  const parts = formatKstParts(value);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    key: `${parts.year}-${parts.month}`,
  };
}

export function parsePaymentAmount(raw: string): PaymentAmountResult {
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9_999_999_999.99) {
    return { ok: false, value: null };
  }
  return { ok: true, value: amount };
}

export function restorePaymentDraft(report: {
  paymentMethod?: string | null;
  paymentAmount?: number | string | null;
} | null | undefined): PaymentDraft {
  return {
    paymentMethod: report?.paymentMethod ? String(report.paymentMethod) : "",
    paymentAmount:
      report?.paymentAmount !== null && report?.paymentAmount !== undefined
        ? String(report.paymentAmount)
        : "",
  };
}

function numericAmount(value: CollectionRow["paymentAmount"]): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

export function summarizeTechnicianCollections(rows: CollectionRow[], now: Date = new Date()) {
  const todayKey = getKstDayKey(now);
  const month = getKstYearMonth(now);
  const seenReports = new Set<string>();
  const byMethod: Record<string, number> = {};
  let monthAmount = 0;
  let monthCount = 0;
  let todayAmount = 0;
  let todayCount = 0;

  for (const [index, row] of rows.entries()) {
    const uniqueKey = String(row.reportId ?? row.requestId ?? `row-${index}`);
    if (seenReports.has(uniqueKey)) continue;
    seenReports.add(uniqueKey);

    const dayKey = getKstDayKey(row.completedAt);
    if (!dayKey || !dayKey.startsWith(month.key)) continue;
    const amount = numericAmount(row.paymentAmount);
    const method = row.paymentMethod?.trim() || "미입력";
    monthAmount += amount;
    monthCount += 1;
    byMethod[method] = (byMethod[method] || 0) + amount;
    if (dayKey === todayKey) {
      todayAmount += amount;
      todayCount += 1;
    }
  }

  return {
    year: month.year,
    month: month.month,
    todayAmount,
    todayCount,
    monthAmount,
    monthCount,
    byMethod,
  };
}
