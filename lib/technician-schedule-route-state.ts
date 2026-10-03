export const technicianScheduleTabs = [
  "today",
  "tomorrow",
  "overdue",
  "all",
] as const;

export type TechnicianScheduleTab = (typeof technicianScheduleTabs)[number];

export type TechnicianScheduleRouteState = {
  activeTab: TechnicianScheduleTab;
  selectedDate: string | null;
};

export function getTechnicianScheduleRouteState(params: {
  tab?: string | string[];
  date?: string | string[];
}): TechnicianScheduleRouteState {
  const tabValue = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const dateValue = Array.isArray(params.date) ? params.date[0] : params.date;
  const activeTab = technicianScheduleTabs.includes(
    tabValue as TechnicianScheduleTab,
  )
    ? (tabValue as TechnicianScheduleTab)
    : "today";
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue ?? ""))
    ? String(dateValue)
    : null;
  return { activeTab, selectedDate };
}

/** A tab route intentionally has no `date`, clearing the weekly date mode. */
export function getTechnicianScheduleTabRoute(
  tab: TechnicianScheduleTab,
): string {
  return `/tech-schedule?tab=${tab}`;
}
