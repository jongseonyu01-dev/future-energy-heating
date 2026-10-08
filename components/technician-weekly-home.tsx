import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { isAuthenticatedScheduleReady, refreshAuthenticatedSchedule } from "@/lib/authenticated-schedule-refresh";
import { trpc } from "@/lib/trpc";
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
} from "@/lib/technician-weekly-schedule";

type TechnicianWeeklyHomeProps = {
  onPress: (route: string) => void;
};

export function TechnicianWeeklyHome({ onPress }: TechnicianWeeklyHomeProps) {
  const colors = useColors();
  const { user, isLoading: isAuthLoading } = useAppAuth();
  const userId = user?.userId;
  const canRefreshSchedule = isAuthenticatedScheduleReady({ userId, isAuthLoading });
  const [now, setNow] = useState(() => new Date());
  const today = getKstDateString(now);
  const tomorrow = getKstDateString(now, 1);
  const upcomingDates = getUpcomingKstDates(now);
  const [selectedDate, setSelectedDate] = useState(tomorrow);
  const appState = useRef(AppState.currentState);

  // The server derives the technician from the authenticated session; this call never sends another technician ID.
  const {
    data: scheduleData,
    isLoading,
    isError,
    refetch,
  } = trpc.repair.listMySchedule.useQuery(undefined, { enabled: canRefreshSchedule });

  const refreshCalendar = useCallback(() => {
    const currentNow = new Date();
    const currentUpcomingDates = getUpcomingKstDates(currentNow);
    setNow(currentNow);
    setSelectedDate((current) =>
      reconcileWeeklySelectedDate(current, currentUpcomingDates),
    );
    void refreshAuthenticatedSchedule({ ready: canRefreshSchedule, refetch });
  }, [canRefreshSchedule, refetch]);

  useFocusEffect(
    useCallback(() => {
      refreshCalendar();
    }, [refreshCalendar]),
  );

  // A foreground return may happen after KST midnight without a navigation event.
  // Refresh only on that lifecycle boundary; no polling is used.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasInactive = appState.current !== "active";
      appState.current = nextState;
      if (nextState === "active" && wasInactive) refreshCalendar();
    });
    return () => subscription.remove();
  }, [refreshCalendar]);

  // While the view remains foregrounded, wake once at the next KST midnight.
  useEffect(() => {
    const timeout = setTimeout(refreshCalendar, getMsUntilNextKstMidnight(now));
    return () => clearTimeout(timeout);
  }, [now, refreshCalendar]);

  const allWorks = scheduleData ?? [];
  const activeWorks = getActiveAssignedWorks(allWorks);
  const selectedWorks = getUpcomingWorksForDate(activeWorks, selectedDate);
  const summaryCountLabel = (count: number) =>
    isLoading ? "…" : isError ? "—" : `${count}건`;
  const summaryCards = [
    {
      id: "today",
      title: "오늘 작업",
      subtitle: "오늘 배정된 작업",
      icon: "☀️",
      route: "/tech-schedule?tab=today",
      color: "#FF6B35",
      bg: "#FFF3F0",
      count: getTodayAssignedWorks(activeWorks, today).length,
    },
    {
      id: "tomorrow",
      title: "내일 일정",
      subtitle: "내일 예정된 방문",
      icon: "🌅",
      route: "/tech-schedule?tab=tomorrow",
      color: "#3B82F6",
      bg: "#EFF6FF",
      count: getUpcomingWorksForDate(activeWorks, tomorrow).length,
    },
    {
      id: "overdue",
      title: "미작업·이월",
      subtitle: "완료 안 된 이월 작업",
      icon: "⚠️",
      route: "/tech-schedule?tab=overdue",
      color: "#EF4444",
      bg: "#FEF2F2",
      count: getOverdueWorks(activeWorks, today).length,
    },
    {
      id: "works",
      title: "전체 작업 목록",
      subtitle: "배정된 모든 작업 조회",
      icon: "🔧",
      route: "/tech-works",
      color: "#0EA5E9",
      bg: "#F0F9FF",
      count: activeWorks.length,
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.summaryGrid}>
        {summaryCards.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} ${summaryCountLabel(item.count)}`}
            style={({ pressed }) => [
              styles.summaryCard,
              {
                backgroundColor: item.bg,
                borderColor: item.color + "30",
                opacity: pressed ? 0.82 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            onPress={() => onPress(item.route)}
          >
            <View style={styles.summaryTopRow}>
              <Text style={styles.summaryIcon}>{item.icon}</Text>
              <Text style={[styles.summaryCount, { color: item.color }]}>
                {summaryCountLabel(item.count)}
              </Text>
            </View>
            <Text style={[styles.summaryTitle, { color: item.color }]}>
              {item.title}
            </Text>
            <Text style={styles.summarySubtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        style={[
          styles.weeklyCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.weeklyHeader}>
          <View>
            <Text style={[styles.weeklyTitle, { color: colors.foreground }]}>
              앞으로 7일 일정
            </Text>
            <Text style={[styles.weeklySubtitle, { color: colors.muted }]}>
              내일부터 7일 · 한국시간 기준
            </Text>
          </View>
          <Text style={styles.weeklyIcon}>📅</Text>
        </View>

        {isLoading ? (
          <View style={styles.weeklyState}>
            <ActivityIndicator color="#FF6B35" />
            <Text style={[styles.weeklyStateText, { color: colors.muted }]}>
              일정을 불러오는 중입니다.
            </Text>
          </View>
        ) : isError ? (
          <View style={styles.weeklyState}>
            <Text style={[styles.weeklyStateText, { color: "#DC2626" }]}>
              일정을 불러오지 못했습니다.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => { void refreshAuthenticatedSchedule({ ready: canRefreshSchedule, refetch }); }}
              disabled={!canRefreshSchedule}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.dateGrid}>
              {upcomingDates.map((date) => {
                const isSelected = selectedDate === date;
                const count = getUpcomingWorksForDate(activeWorks, date).length;
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${formatKstDateLabel(date)}, ${count}건`}
                    style={({ pressed }) => [
                      styles.dateButton,
                      isSelected && styles.dateButtonSelected,
                      {
                        borderColor: isSelected ? "#FF6B35" : colors.border,
                        opacity: pressed ? 0.78 : 1,
                      },
                    ]}
                    onPress={() => setSelectedDate(date)}
                  >
                    <Text
                      style={[
                        styles.dateLabel,
                        { color: isSelected ? "#C2410C" : colors.foreground },
                      ]}
                    >
                      {formatKstDateLabel(date)}
                    </Text>
                    <Text
                      style={[
                        styles.dateCount,
                        { color: isSelected ? "#FF6B35" : colors.muted },
                      ]}
                    >
                      {count}건
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={[styles.selectedHeader, { borderTopColor: colors.border }]}
            >
              <Text
                style={[styles.selectedTitle, { color: colors.foreground }]}
              >
                {formatKstDateLabel(selectedDate)} 일정
              </Text>
              <Text style={[styles.selectedCount, { color: colors.muted }]}>
                {selectedWorks.length}건
              </Text>
            </View>

            {selectedWorks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🗓️</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  예정된 작업 없음
                </Text>
              </View>
            ) : (
              <View style={styles.workList}>
                {selectedWorks.map((work: any) => (
                  <TouchableOpacity
                    key={work.id}
                    style={[styles.workItem, { borderColor: colors.border }]}
                    onPress={() =>
                      onPress(`/tech-schedule?date=${selectedDate}`)
                    }
                    activeOpacity={0.78}
                  >
                    <View style={styles.workTime}>
                      <Text style={styles.workTimeText}>
                        {work.scheduledTime || "시간 미정"}
                      </Text>
                    </View>
                    <View style={styles.workCopy}>
                      <Text
                        style={[styles.workTitle, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {work.customerName ?? "고객 정보 미확인"}
                      </Text>
                      <Text
                        style={[styles.workDetail, { color: colors.muted }]}
                        numberOfLines={1}
                      >
                        {work.requestType === "배관청소"
                          ? "배관청소"
                          : (work.symptom ??
                            work.requestType ??
                            "작업 내용 미확인")}
                      </Text>
                    </View>
                    <Text style={[styles.workChevron, { color: colors.muted }]}>
                      ›
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryCard: {
    flexBasis: "48.4%",
    minHeight: 124,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    justifyContent: "space-between",
  },
  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 6,
  },
  summaryIcon: { fontSize: 26 },
  summaryCount: { fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  summaryTitle: { fontSize: 16, fontWeight: "800", marginTop: 6 },
  summarySubtitle: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  weeklyCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  weeklyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weeklyTitle: { fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  weeklySubtitle: { fontSize: 12, marginTop: 3 },
  weeklyIcon: { fontSize: 26 },
  weeklyState: {
    minHeight: 132,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  weeklyStateText: { fontSize: 14, textAlign: "center" },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#FF6B35",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  dateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  dateButton: {
    flexBasis: "23%",
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  dateButtonSelected: { backgroundColor: "#FFF3F0", borderWidth: 1.5 },
  dateLabel: { fontSize: 12, fontWeight: "800", lineHeight: 17 },
  dateCount: { fontSize: 11, fontWeight: "700", marginTop: 1 },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 12,
  },
  selectedTitle: { fontSize: 15, fontWeight: "800" },
  selectedCount: { fontSize: 13, fontWeight: "700" },
  emptyState: {
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  emptyIcon: { fontSize: 25 },
  emptyText: { fontSize: 14, fontWeight: "600" },
  workList: { gap: 7 },
  workItem: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  workTime: {
    minWidth: 52,
    minHeight: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF3F0",
    paddingHorizontal: 4,
  },
  workTimeText: { color: "#C2410C", fontSize: 12, fontWeight: "800" },
  workCopy: { flex: 1, gap: 2 },
  workTitle: { fontSize: 14, fontWeight: "800" },
  workDetail: { fontSize: 12 },
  workChevron: { fontSize: 24, fontWeight: "400" },
});
