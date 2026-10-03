import { describe, expect, it } from "vitest";

import {
  formatKstDateLabel,
  getActiveAssignedWorks,
  getKstDateString,
  getMsUntilNextKstMidnight,
  getOverdueWorks,
  getTodayAssignedWorks,
  getUpcomingKstDates,
  getUpcomingWorksForDate,
  reconcileWeeklySelectedDate,
} from "../lib/technician-weekly-schedule";
import {
  getTechnicianScheduleRouteState,
  getTechnicianScheduleTabRoute,
} from "../lib/technician-schedule-route-state";

const works = [
  {
    id: 1,
    requestNumber: "R-1",
    scheduledDate: "2026-09-30",
    scheduledTime: "14:00",
    status: "방문예정",
  },
  {
    id: 2,
    requestNumber: "R-2",
    scheduledDate: "2026-09-30",
    scheduledTime: "09:00",
    status: "방문예정",
  },
  {
    id: 3,
    requestNumber: "R-3",
    scheduledDate: "2026-09-30",
    scheduledTime: "10:00",
    status: "작업완료",
  },
  {
    id: 4,
    requestNumber: "R-4",
    scheduledDate: "2026-09-30",
    scheduledTime: "11:00",
    status: "업무취소",
  },
  {
    id: 5,
    requestNumber: "R-5",
    scheduledDate: "2026-09-29",
    scheduledTime: "08:00",
    status: "작업완료",
  },
  {
    id: 6,
    requestNumber: "R-6",
    scheduledDate: "2026-09-28",
    scheduledTime: "09:00",
    status: "방문예정",
  },
  {
    id: 7,
    requestNumber: "R-7",
    scheduledDate: null,
    scheduledTime: null,
    status: "방문예정",
  },
];

describe("technician weekly schedule", () => {
  it("uses the Asia/Seoul day rather than the device timezone", () => {
    expect(getKstDateString(new Date("2026-09-29T14:59:59.000Z"))).toBe(
      "2026-09-29",
    );
    expect(getKstDateString(new Date("2026-09-29T15:00:00.000Z"))).toBe(
      "2026-09-30",
    );
  });

  it("creates exactly seven dates beginning tomorrow across a month boundary", () => {
    expect(getUpcomingKstDates(new Date("2026-09-29T14:00:00.000Z"))).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
    ]);
    expect(formatKstDateLabel("2026-10-01")).toBe("10.1 (목)");
  });

  it("crosses the KST year boundary and moves an out-of-window selection to tomorrow", () => {
    const beforeMidnightRange = getUpcomingKstDates(
      new Date("2026-12-31T14:59:59.000Z"),
    );
    const afterMidnightRange = getUpcomingKstDates(
      new Date("2026-12-31T15:00:00.000Z"),
    );

    expect(beforeMidnightRange).toEqual([
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
      "2027-01-04",
      "2027-01-05",
      "2027-01-06",
      "2027-01-07",
    ]);
    expect(afterMidnightRange[0]).toBe("2027-01-02");
    expect(reconcileWeeklySelectedDate("2027-01-01", afterMidnightRange)).toBe(
      "2027-01-02",
    );
  });

  it("preserves a selected day that remains in the refreshed seven-day range", () => {
    const beforeMidnightRange = getUpcomingKstDates(
      new Date("2026-09-30T14:59:59.000Z"),
    );
    const afterMidnightRange = getUpcomingKstDates(
      new Date("2026-09-30T15:00:00.000Z"),
    );

    expect(reconcileWeeklySelectedDate("2026-10-03", beforeMidnightRange)).toBe(
      "2026-10-03",
    );
    expect(reconcileWeeklySelectedDate("2026-10-03", afterMidnightRange)).toBe(
      "2026-10-03",
    );
    expect(
      getMsUntilNextKstMidnight(new Date("2026-09-30T14:59:59.000Z")),
    ).toBe(1_050);
  });

  it("keeps today semantics while showing an upcoming day in chronological open-work order", () => {
    expect(
      getTodayAssignedWorks(works, "2026-09-29").map((work) => work.id),
    ).toEqual([5]);
    expect(
      getUpcomingWorksForDate(works, "2026-09-30").map((work) => work.id),
    ).toEqual([2, 1]);
  });

  it("keeps home counts and schedule lists tied to the same authenticated source rows", () => {
    const active = getActiveAssignedWorks(works);
    expect(active).toHaveLength(6);
    expect(getUpcomingWorksForDate(active, "2026-09-30")).toHaveLength(2);
    expect(
      getOverdueWorks(active, "2026-09-29").map((work) => work.id),
    ).toEqual([7, 6]);
  });

  it("clears a weekly date mode before a today-tab round trip", () => {
    expect(
      getTechnicianScheduleRouteState({
        date: "2026-10-04",
        tab: "tomorrow",
      }),
    ).toEqual({ activeTab: "tomorrow", selectedDate: "2026-10-04" });

    expect(getTechnicianScheduleTabRoute("today")).toBe(
      "/tech-schedule?tab=today",
    );
    expect(getTechnicianScheduleRouteState({ tab: "today" })).toEqual({
      activeTab: "today",
      selectedDate: null,
    });

    // A later focus pass reads the same tab-only URL, so the old weekly date
    // cannot be re-applied after navigating away and back to this screen.
    expect(getTechnicianScheduleRouteState({ tab: "today" })).toEqual({
      activeTab: "today",
      selectedDate: null,
    });
  });
});
