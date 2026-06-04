import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  RefreshControl,
} from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

const CUSTOMER_CENTER = "1588-0000";

// 센서 상태별 표시 설정
const SENSOR_STATUS: Record<
  string,
  { label: string; color: string; bg: string; icon: string }
> = {
  정상: { label: "정상", color: "#16A34A", bg: "#F0FDF4", icon: "✅" },
  누수감지: { label: "누수 감지", color: "#DC2626", bg: "#FEF2F2", icon: "🚨" },
  배터리부족: { label: "배터리 부족", color: "#F59E0B", bg: "#FFFBEB", icon: "🔋" },
  통신끊김: { label: "통신 끊김", color: "#6B7280", bg: "#F3F4F6", icon: "📡" },
  점검필요: { label: "점검 필요", color: "#8B5CF6", bg: "#F5F3FF", icon: "🛠️" },
};

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function batteryColor(level: number): string {
  if (level <= 20) return "#DC2626";
  if (level <= 50) return "#F59E0B";
  return "#16A34A";
}

export default function LeakSensorScreen() {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [searchPhone, setSearchPhone] = useState("");

  const {
    data: sensors,
    isLoading,
    refetch,
    isRefetching,
  } = trpc.sensor.listByPhone.useQuery(
    { phoneNumber: searchPhone },
    { enabled: searchPhone.length > 0, refetchInterval: 30000 }
  );

  const handleSearch = () => {
    if (!query.trim()) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSearchPhone(query.trim());
  };

  const handleCall = () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    Linking.openURL(`tel:${CUSTOMER_CENTER}`);
  };

  // 누수 감지된 센서 존재 여부
  const leakingSensors = (sensors ?? []).filter(
    (s) => s.status === "누수감지"
  );
  const hasLeak = leakingSensors.length > 0;

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          searchPhone ? (
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#0284C7"
            />
          ) : undefined
        }
      >
        {/* 헤더 */}
        <View style={[styles.pageHeader, { backgroundColor: "#0284C7" }]}>
          <Text style={styles.pageHeaderTitle}>💧 우리 집 누수센서</Text>
          <Text style={styles.pageHeaderSubtitle}>
            설치된 센서의 상태를 실시간 확인
          </Text>
        </View>

        {/* 누수 긴급 알림 (최상단) */}
        {hasLeak && (
          <View style={styles.emergencyBanner}>
            <View style={styles.emergencyRow}>
              <Text style={styles.emergencyIcon}>🚨</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.emergencyTitle}>누수가 감지되었습니다!</Text>
                <Text style={styles.emergencyDesc}>
                  {leakingSensors
                    .map((s) => `${s.sensorName}(${s.installLocation})`)
                    .join(", ")}
                  에서 누수가 감지되었습니다. 즉시 확인해 주세요.
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.emergencyCallButton,
                { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={handleCall}
            >
              <Text style={styles.emergencyCallIcon}>📞</Text>
              <Text style={styles.emergencyCallText}>
                고객센터 즉시 전화 ({CUSTOMER_CENTER})
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.container}>
          {/* 검색 입력 */}
          <View
            style={[
              styles.searchBox,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.searchLabel, { color: colors.foreground }]}>
              휴대폰 번호로 내 센서 조회
            </Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[
                  styles.searchInput,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                value={query}
                onChangeText={setQuery}
                placeholder="010-0000-0000"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.searchButton,
                  { backgroundColor: "#0284C7", opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={handleSearch}
              >
                <Text style={styles.searchButtonText}>조회</Text>
              </Pressable>
            </View>
          </View>

          {/* 로딩 */}
          {isLoading && searchPhone.length > 0 && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0284C7" />
              <Text style={[styles.loadingText, { color: colors.muted }]}>
                센서 정보를 불러오는 중...
              </Text>
            </View>
          )}

          {/* 결과 없음 */}
          {!isLoading && searchPhone && sensors?.length === 0 && (
            <View
              style={[
                styles.emptyBox,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                등록된 센서가 없습니다
              </Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                휴대폰 번호를 다시 확인하시거나{"\n"}고객센터로 문의해 주세요.
              </Text>
            </View>
          )}

          {/* 센서 목록 */}
          {!isLoading && sensors && sensors.length > 0 && (
            <View style={styles.sensorList}>
              <Text style={[styles.resultCount, { color: colors.muted }]}>
                총 {sensors.length}개의 센서
              </Text>
              {sensors.map((sensor) => {
                const statusInfo =
                  SENSOR_STATUS[sensor.status] || SENSOR_STATUS["정상"];
                const isLeaking = sensor.status === "누수감지";
                return (
                  <View
                    key={sensor.id}
                    style={[
                      styles.sensorCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isLeaking ? "#DC2626" : colors.border,
                        borderWidth: isLeaking ? 2 : 1,
                      },
                    ]}
                  >
                    {/* 상태 헤더 */}
                    <View
                      style={[
                        styles.sensorStatusHeader,
                        { backgroundColor: statusInfo.bg },
                      ]}
                    >
                      <Text style={styles.sensorStatusIcon}>
                        {statusInfo.icon}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sensorName, { color: colors.foreground }]}>
                          {sensor.sensorName}
                        </Text>
                        <Text style={[styles.sensorLocation, { color: colors.muted }]}>
                          📍 {sensor.installLocation}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: statusInfo.color },
                        ]}
                      >
                        <Text style={styles.statusPillText}>
                          {statusInfo.label}
                        </Text>
                      </View>
                    </View>

                    {/* 상세 정보 */}
                    <View style={styles.sensorBody}>
                      <DetailRow
                        label="현재 상태"
                        value={statusInfo.label}
                        valueColor={statusInfo.color}
                      />
                      <DetailRow
                        label="마지막 통신"
                        value={formatDateTime(sensor.lastCommAt)}
                      />
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>배터리 잔량</Text>
                        <View style={styles.batteryWrap}>
                          <View style={styles.batteryBarBg}>
                            <View
                              style={[
                                styles.batteryBarFill,
                                {
                                  width: `${Math.max(0, Math.min(100, sensor.batteryLevel))}%`,
                                  backgroundColor: batteryColor(sensor.batteryLevel),
                                },
                              ]}
                            />
                          </View>
                          <Text
                            style={[
                              styles.batteryText,
                              { color: batteryColor(sensor.batteryLevel) },
                            ]}
                          >
                            {sensor.batteryLevel}%
                          </Text>
                        </View>
                      </View>
                      {sensor.leakDetectedAt && (
                        <DetailRow
                          label="누수 감지 시간"
                          value={formatDateTime(sensor.leakDetectedAt)}
                          valueColor="#DC2626"
                        />
                      )}
                    </View>

                    {/* 고객센터 전화 버튼 */}
                    <Pressable
                      style={({ pressed }) => [
                        styles.callButton,
                        {
                          backgroundColor: isLeaking ? "#DC2626" : "#0284C7",
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      onPress={handleCall}
                    >
                      <Text style={styles.callButtonIcon}>📞</Text>
                      <Text style={styles.callButtonText}>고객센터 전화</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* 초기 안내 */}
          {!searchPhone && (
            <View
              style={[
                styles.guideBox,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={styles.guideIcon}>💡</Text>
              <Text style={[styles.guideTitle, { color: colors.foreground }]}>
                누수센서 안내
              </Text>
              <Text style={[styles.guideText, { color: colors.muted }]}>
                댁내에 설치된 누수센서의 상태를 휴대폰 번호로 조회하실 수 있습니다. 누수가 감지되면 화면 상단에 긴급 알림과 함께 문자 메시지가 발송됩니다.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.guideCallButton,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={handleCall}
              >
                <Text style={styles.guideCallText}>
                  📞 고객센터 {CUSTOMER_CENTER}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          valueColor ? { color: valueColor, fontWeight: "700" } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  pageHeader: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  pageHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  pageHeaderSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    marginTop: 4,
  },
  emergencyBanner: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#DC2626",
    padding: 16,
    gap: 14,
  },
  emergencyRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  emergencyIcon: {
    fontSize: 32,
  },
  emergencyTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#DC2626",
    marginBottom: 4,
  },
  emergencyDesc: {
    fontSize: 14,
    color: "#991B1B",
    lineHeight: 20,
  },
  emergencyCallButton: {
    backgroundColor: "#DC2626",
    borderRadius: 12,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emergencyCallIcon: {
    fontSize: 22,
  },
  emergencyCallText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  container: {
    padding: 16,
    gap: 16,
  },
  searchBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  searchLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  searchButton: {
    width: 72,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  loadingContainer: {
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  emptyBox: {
    padding: 32,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  sensorList: {
    gap: 14,
  },
  resultCount: {
    fontSize: 14,
    fontWeight: "500",
  },
  sensorCard: {
    borderRadius: 16,
    overflow: "hidden",
  },
  sensorStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  sensorStatusIcon: {
    fontSize: 28,
  },
  sensorName: {
    fontSize: 18,
    fontWeight: "700",
  },
  sensorLocation: {
    fontSize: 14,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  sensorBody: {
    padding: 14,
    gap: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 15,
    color: "#6B7280",
    flex: 1,
  },
  detailValue: {
    fontSize: 16,
    color: "#1A1A1A",
    fontWeight: "600",
    flex: 2,
    textAlign: "right",
  },
  batteryWrap: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  batteryBarBg: {
    width: 80,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  batteryBarFill: {
    height: "100%",
    borderRadius: 6,
  },
  batteryText: {
    fontSize: 16,
    fontWeight: "700",
    width: 48,
    textAlign: "right",
  },
  callButton: {
    margin: 14,
    marginTop: 0,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  callButtonIcon: {
    fontSize: 20,
  },
  callButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  guideBox: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  guideIcon: {
    fontSize: 36,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  guideText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  guideCallButton: {
    marginTop: 6,
    backgroundColor: "#0284C7",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  guideCallText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
