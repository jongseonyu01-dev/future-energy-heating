export type AssignedWork = {
  id?: number | string;
  requestNumber?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  status?: string | null;
};

/** Existing technician-home semantics: only this status is omitted from assignment views. */
export const CANCELLED_WORK_STATUSES = ["업무취소"] as const;
/** Completed work is retained for today's existing summary, but excluded from future schedules. */
export const COMPLETED_WORK_STATUSES = ["작업완료", "공사완료"] as const;

export function getKstDateString(now = new Date(), offsetDays = 0): string {
  const kstMs =
    now.getTime() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatKstDateLabel(date: string): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!matched) return date;
  const [, year, month, day] = matched;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()
  ];
  return `${Number(month)}.${Number(day)} (${weekday})`;
}

export function isCancelledWork(work: AssignedWork): boolean {
  return CANCELLED_WORK_STATUSES.includes(
    work.status as (typeof CANCELLED_WORK_STATUSES)[number],
  );
}

export function isCompletedWork(work: AssignedWork): boolean {
  return COMPLETED_WORK_STATUSES.includes(
    work.status as (typeof COMPLETED_WORK_STATUSES)[number],
  );
}

/** Preserves the existing home-card behavior: scheduled today, except explicit cancellation. */
export function getTodayAssignedWorks<T extends AssignedWork>(
  works: readonly T[],
  today: string,
): T[] {
  return works.filter(
    (work) => work.scheduledDate === today && !isCancelledWork(work),
  );
}

/** Scheduled work eligible for an upcoming date: excludes completed and explicit cancellation. */
export function getUpcomingWorksForDate<T extends AssignedWork>(
  works: readonly T[],
  date: string,
): T[] {
  return works
    .filter(
      (work) =>
        work.scheduledDate === date &&
        !isCancelledWork(work) &&
        !isCompletedWork(work),
    )
    .slice()
    .sort((left, right) => {
      const timeOrder = String(left.scheduledTime ?? "").localeCompare(
        String(right.scheduledTime ?? ""),
      );
      if (timeOrder !== 0) return timeOrder;
      return String(left.requestNumber ?? left.id ?? "").localeCompare(
        String(right.requestNumber ?? right.id ?? ""),
      );
    });
}

export function getOverdueWorks<T extends AssignedWork>(
  works: readonly T[],
  today: string,
): T[] {
  return works
    .filter(
      (work) =>
        (!work.scheduledDate || work.scheduledDate < today) &&
        !isCancelledWork(work) &&
        !isCompletedWork(work),
    )
    .slice()
    .sort((left, right) =>
      String(left.scheduledDate ?? "").localeCompare(
        String(right.scheduledDate ?? ""),
      ),
    );
}

export function getActiveAssignedWorks<T extends AssignedWork>(
  works: readonly T[],
): T[] {
  return works.filter((work) => !isCancelledWork(work));
}

/** Tomorrow through the following sixth day, always Asia/Seoul calendar dates. */
export function getUpcomingKstDates(now = new Date()): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    getKstDateString(now, index + 1),
  );
}

/**
 * Keeps a selected weekly date only while it remains in the newly computed
 * tomorrow-through-seven-day range. Otherwise move to the new tomorrow.
 */
export function reconcileWeeklySelectedDate(
  selectedDate: string,
  upcomingDates: readonly string[],
): string {
  return upcomingDates.includes(selectedDate) ? selectedDate : upcomingDates[0];
}

/** Milliseconds until the next KST midnight, plus a small render buffer. */
export function getMsUntilNextKstMidnight(now = new Date()): number {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const nextKstMidnightMs = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + 1,
  );
  return Math.max(1_000, nextKstMidnightMs - kstMs + 50);
}
