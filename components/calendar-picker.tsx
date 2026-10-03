import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Platform,
} from "react-native";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

interface CalendarPickerProps {
  value: string; // "YYYY-MM-DD" 형식
  onChange: (date: string) => void;
  placeholder?: string;
  minDate?: Date;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseDate(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10) - 1,
    day: parseInt(parts[2], 10),
  };
}

function formatDisplayDate(dateStr: string): string {
  const parsed = parseDate(dateStr);
  if (!parsed) return "";
  return `${parsed.year}년 ${parsed.month + 1}월 ${parsed.day}일`;
}

export function CalendarPicker({
  value,
  onChange,
  placeholder = "날짜를 선택하세요",
  minDate,
}: CalendarPickerProps) {
  const colors = useColors();
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const parsed = parseDate(value);
  const [viewYear, setViewYear] = useState(parsed?.year ?? todayYear);
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? todayMonth);
  const [visible, setVisible] = useState(false);

  const minYear = minDate ? minDate.getFullYear() : todayYear;
  const minMonth = minDate ? minDate.getMonth() : todayMonth;
  const minDay = minDate ? minDate.getDate() : todayDay;

  function isDisabled(year: number, month: number, day: number): boolean {
    if (year < minYear) return true;
    if (year === minYear && month < minMonth) return true;
    if (year === minYear && month === minMonth && day < minDay) return true;
    return false;
  }

  function isToday(year: number, month: number, day: number): boolean {
    return year === todayYear && month === todayMonth && day === todayDay;
  }

  function isSelected(year: number, month: number, day: number): boolean {
    if (!parsed) return false;
    return year === parsed.year && month === parsed.month && day === parsed.day;
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function handleSelectDay(day: number) {
    if (isDisabled(viewYear, viewMonth, day)) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onChange(formatDate(viewYear, viewMonth, day));
    setVisible(false);
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  // 달력 셀 배열 생성 (앞 빈칸 + 날짜)
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // 6행 채우기
  while (cells.length % 7 !== 0) cells.push(null);

  const canGoPrev =
    viewYear > minYear || (viewYear === minYear && viewMonth > minMonth);

  return (
    <>
      {/* 날짜 선택 버튼 */}
      <Pressable
        style={[
          styles.trigger,
          {
            backgroundColor: colors.surface,
            borderColor: value ? "#E84B2F" : colors.border,
          },
        ]}
        onPress={() => setVisible(true)}
      >
        <Text style={styles.calendarIcon}>📅</Text>
        <Text
          style={[
            styles.triggerText,
            { color: value ? colors.foreground : colors.muted },
          ]}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </Text>
        {value ? (
          <Pressable
            style={styles.clearButton}
            onPress={(e) => {
              e.stopPropagation?.();
              onChange("");
            }}
          >
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : (
          <Text style={[styles.chevron, { color: colors.muted }]}>▼</Text>
        )}
      </Pressable>

      {/* 달력 모달 */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setVisible(false)}
        >
          <Pressable
            style={[
              styles.calendarContainer,
              { backgroundColor: colors.background },
            ]}
            onPress={(e) => e.stopPropagation?.()}
          >
            {/* 월 네비게이션 */}
            <View style={styles.header}>
              <Pressable
                style={[
                  styles.navButton,
                  !canGoPrev && styles.navButtonDisabled,
                ]}
                onPress={canGoPrev ? prevMonth : undefined}
              >
                <Text
                  style={[
                    styles.navArrow,
                    { color: canGoPrev ? "#E84B2F" : colors.muted },
                  ]}
                >
                  ‹
                </Text>
              </Pressable>

              <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                {viewYear}년 {MONTHS[viewMonth]}
              </Text>

              <Pressable style={styles.navButton} onPress={nextMonth}>
                <Text style={[styles.navArrow, { color: "#E84B2F" }]}>›</Text>
              </Pressable>
            </View>

            {/* 요일 헤더 */}
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((wd, i) => (
                <Text
                  key={wd}
                  style={[
                    styles.weekdayText,
                    {
                      color:
                        i === 0
                          ? "#E84B2F"
                          : i === 6
                          ? "#2563EB"
                          : colors.muted,
                    },
                  ]}
                >
                  {wd}
                </Text>
              ))}
            </View>

            {/* 날짜 그리드 */}
            <View style={styles.grid}>
              {cells.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.cell} />;
                }

                const disabled = isDisabled(viewYear, viewMonth, day);
                const selected = isSelected(viewYear, viewMonth, day);
                const todayMark = isToday(viewYear, viewMonth, day);
                const isSunday = (firstDay + day - 1) % 7 === 0;
                const isSaturday = (firstDay + day - 1) % 7 === 6;

                return (
                  <Pressable
                    key={day}
                    style={[
                      styles.cell,
                      selected && styles.selectedCell,
                      todayMark && !selected && styles.todayCell,
                    ]}
                    onPress={() => handleSelectDay(day)}
                    disabled={disabled}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selected && styles.selectedDayText,
                        todayMark && !selected && styles.todayDayText,
                        disabled && styles.disabledDayText,
                        !selected &&
                          !disabled &&
                          isSunday && { color: "#E84B2F" },
                        !selected &&
                          !disabled &&
                          isSaturday && { color: "#2563EB" },
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 닫기 버튼 */}
            <Pressable
              style={styles.closeButton}
              onPress={() => setVisible(false)}
            >
              <Text style={styles.closeButtonText}>닫기</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  calendarIcon: {
    fontSize: 20,
  },
  triggerText: {
    flex: 1,
    fontSize: 16,
  },
  chevron: {
    fontSize: 14,
  },
  clearButton: {
    padding: 4,
  },
  clearText: {
    fontSize: 14,
    color: "#999",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  calendarContainer: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navArrow: {
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
  },
  selectedCell: {
    backgroundColor: "#E84B2F",
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: "#E84B2F",
  },
  dayText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  selectedDayText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  todayDayText: {
    color: "#E84B2F",
    fontWeight: "700",
  },
  disabledDayText: {
    color: "#CCCCCC",
  },
  closeButton: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
});
