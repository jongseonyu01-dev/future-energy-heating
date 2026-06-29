/**
 * 우리 집 난방 상태 화면
 * 고객이 자신의 세대 유량·압력·난방 상태를 확인하는 화면
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, RefreshControl, Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/lib/auth-context";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const MAIN_PHONE_TEL = "tel:031-8042-7310";

// ─── 상태별 색상 ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string; desc: string }> = {
  "정상": { color: "#16A34A", bg: "#F0FDF4", icon: "✅", label: "정상", desc: "난방 상태가 양호합니다." },
  "주의": { color: "#D97706", bg: "#FFFBEB", icon: "⚠️", label: "주의", desc: "유량이 기준에서 다소 벗어났습니다." },
  "경고": { color: "#DC2626", bg: "#FEF2F2", icon: "🚨", label: "점검 필요", desc: "유량 이상이 감지되었습니다. 점검을 요청해 주세요." },
};

function formatDate(val: string | Date | null | undefined): string {
  if (!val) return "측정 이력 없음";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "측정 이력 없음";
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatLpm(val: string | null | undefined): string {
  if (!val) return "-";
  return parseFloat(val).toFixed(2) + " LPM";
}

function formatPressure(val: string | null | undefined): string {
  if (!val) return "-";
  return parseFloat(val).toFixed(3) + " bar";
}

// ─── 센서 미설치 안내 ─────────────────────────────────────────────
function NoSensorView({ colors }: { colors: any }) {
  return (
    <View style={[styles.noSensorBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={styles.noSensorIcon}>🌡️</Text>
      <Text style={[styles.noSensorTitle, { color: colors.foreground }]}>
        아직 설치된 난방 상태 센서가 없습니다.
      </Text>
      <Text style={[styles.noSensorDesc, { color: colors.muted }]}>
        설치를 원하시면 상담을 신청해 주세요.
      </Text>
      <TouchableOpacity
        style={styles.consultBtn}
        onPress={() => Linking.openURL(MAIN_PHONE_TEL)}
        activeOpacity={0.8}
      >
        <Text style={styles.consultBtnText}>📞 설치 상담 신청</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 세대 상태 카드 ───────────────────────────────────────────────
function SensorCard({ item, colors, onRequestInspection, showTechnical = false }: {
  item: any;
  colors: any;
  onRequestInspection: (sensorId: string) => void;
  showTechnical?: boolean;
}) {
  const status = item.lastStatus ?? "정상";
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["정상"];

  // 통신 상태: 마지막 측정이 30분 이내면 정상
  const lastMeasured = item.lastMeasuredAt ? new Date(item.lastMeasuredAt) : null;
  const minutesSince = lastMeasured ? (Date.now() - lastMeasured.getTime()) / 60000 : null;
  const commOk = minutesSince !== null && minutesSince < 30;
  const commLabel = minutesSince === null ? "미연결" : commOk ? "정상" : "통신 지연";
  const commColor = minutesSince === null ? "#9CA3AF" : commOk ? "#16A34A" : "#D97706";

  return (
    <View style={[styles.sensorCard, { backgroundColor: cfg.bg, borderColor: cfg.color + "40" }]}>
      {/* 상단: 상태 배지 + 세대 정보 */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardIcon}>{cfg.icon}</Text>
          <View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              {item.apartmentName} {item.buildingNumber}동 {item.roomNumber}호
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
              {cfg.desc}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.color }]}>
          <Text style={styles.statusBadgeText}>{cfg.label}</Text>
        </View>
      </View>

      {/* 핵심 지표 - 기술 수치는 관리자/지사장만 표시 */}
      {showTechnical ? (
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={[styles.metricLabel, { color: colors.muted }]}>현재 유량</Text>
            <Text style={[styles.metricValue, { color: cfg.color }]}>
              {formatLpm(item.lastFlowRateLpm)}
            </Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metricBox}>
            <Text style={[styles.metricLabel, { color: colors.muted }]}>기준 유량</Text>
            <Text style={[styles.metricValue, { color: colors.foreground }]}>
              {formatLpm(item.baseFlowRateLpm)}
            </Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metricBox}>
            <Text style={[styles.metricLabel, { color: colors.muted }]}>난방 압력</Text>
            <Text style={[styles.metricValue, { color: colors.foreground }]}>
              {formatPressure(item.lastSupplyPressure)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.metricsRow, { justifyContent: "center", paddingVertical: 8 }]}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.color, paddingHorizontal: 24, paddingVertical: 10 }]}>
            <Text style={[styles.statusBadgeText, { fontSize: 16 }]}>{cfg.icon} {cfg.label}</Text>
          </View>
        </View>
      )}

      {/* 통신 상태 + 측정 시간 */}
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>통신 상태</Text>
          <Text style={[styles.infoValue, { color: commColor, fontWeight: "600" }]}>{commLabel}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>마지막 측정</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]}>{formatDate(item.lastMeasuredAt)}</Text>
        </View>
      </View>

      {/* 점검 요청 버튼 (경고/주의 상태일 때 강조) */}
      {(status === "경고" || status === "주의") && (
        <TouchableOpacity
          style={[styles.inspectBtn, { backgroundColor: cfg.color }]}
          onPress={() => onRequestInspection(item.sensorId)}
          activeOpacity={0.8}
        >
          <Text style={styles.inspectBtnText}>🔧 점검 요청</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── 메인 화면 ────────────────────────────────────────────────────
export default function HeatStatusScreen() {
  const colors = useColors();
  const { user } = useAppAuth();
  const showTechnical = user?.appRole === "hq_admin" || user?.appRole === "branch_manager";
  const [phone, setPhone] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data: sensors = [], isLoading, refetch } = trpc.flowRate.getByCustomerPhone.useQuery(
    { phone: searchPhone, appRole: user?.appRole ?? "customer" },
    { enabled: searchPhone.length >= 9 }
  );

  // 전체 목록 (전화번호 미입력 시 모든 센서 표시 - role 기반 필터링)
  const { data: allSensors = [], isLoading: allLoading, refetch: refetchAll } = trpc.flowRate.listSettings.useQuery(
    { appRole: user?.appRole ?? "customer", branchId: user?.branchId ?? undefined },
    { enabled: searchPhone.length < 9 }
  );

  const requestMutation = trpc.flowRate.requestInspection.useMutation({
    onSuccess: () => {
      Alert.alert("점검 요청 완료", "점검 요청이 접수되었습니다.\n담당 기사가 연락드릴 예정입니다.");
      refetch();
      refetchAll();
    },
    onError: (e) => Alert.alert("오류", e.message),
  });

  const displaySensors = searchPhone.length >= 9 ? sensors : allSensors;
  const loading = searchPhone.length >= 9 ? isLoading : allLoading;

  const handleSearch = () => {
    const cleaned = phone.replace(/[^0-9]/g, "");
    setSearchPhone(cleaned);
  };

  const handleRequestInspection = useCallback((sensorId: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Alert.alert(
      "점검 요청",
      "담당 기사에게 점검 요청을 보내시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "요청",
          onPress: () => requestMutation.mutate({ sensorId }),
        },
      ]
    );
  }, [requestMutation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchAll()]);
    setRefreshing(false);
  }, [refetch, refetchAll]);

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: "#FF6B35" }]}>
          <Text style={styles.headerIcon}>🌡️</Text>
          <Text style={styles.headerTitle}>우리 집 난방 상태</Text>
          <Text style={styles.headerSubtitle}>유량·압력·난방 상태 확인</Text>
        </View>

        {/* 전화번호 검색 */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.searchLabel, { color: colors.foreground }]}>전화번호로 내 세대 찾기</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="전화번호 입력 (예: 01012345678)"
              placeholderTextColor={colors.muted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} activeOpacity={0.8}>
              <Text style={styles.searchBtnText}>조회</Text>
            </TouchableOpacity>
          </View>
          {searchPhone.length >= 9 && (
            <TouchableOpacity onPress={() => { setSearchPhone(""); setPhone(""); }}>
              <Text style={[styles.clearText, { color: colors.muted }]}>전체 보기</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 센서 목록 */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={[styles.loadingText, { color: colors.muted }]}>데이터를 불러오는 중...</Text>
          </View>
        ) : displaySensors.length === 0 ? (
          <NoSensorView colors={colors} />
        ) : (
          <View style={styles.sensorList}>
            {displaySensors.map((item: any) => (
              <SensorCard
                key={item.id}
                item={item}
                colors={colors}
                onRequestInspection={handleRequestInspection}
                showTechnical={showTechnical}
              />
            ))}
          </View>
        )}

        {/* 안내 */}
        <View style={[styles.guideBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.guideTitle, { color: colors.foreground }]}>📌 이용 안내</Text>
          <Text style={[styles.guideText, { color: colors.muted }]}>
            • 정상: 유량이 기준 범위 내에 있습니다.{"\n"}
            • 주의: 유량이 기준에서 다소 벗어났습니다.{"\n"}
            • 점검 필요: 유량 이상이 감지되었습니다.{"\n"}
            • 이상 발생 시 점검 요청 버튼을 눌러 주세요.
          </Text>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => Linking.openURL(MAIN_PHONE_TEL)}
            activeOpacity={0.8}
          >
            <Text style={styles.callBtnText}>📞 긴급 상담: 031-8042-7310</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  header: { paddingTop: 24, paddingBottom: 24, paddingHorizontal: 20, alignItems: "center", gap: 4 },
  headerIcon: { fontSize: 48 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.85)" },

  searchBox: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, gap: 10 },
  searchLabel: { fontSize: 15, fontWeight: "600" },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInput: { flex: 1, height: 44, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  searchBtn: { backgroundColor: "#FF6B35", borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  clearText: { fontSize: 13, textAlign: "right" },

  loadingBox: { alignItems: "center", paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 14 },

  noSensorBox: { margin: 16, padding: 28, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 12 },
  noSensorIcon: { fontSize: 56 },
  noSensorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center", lineHeight: 26 },
  noSensorDesc: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  consultBtn: { backgroundColor: "#FF6B35", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  consultBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  sensorList: { paddingHorizontal: 16, gap: 12 },
  sensorCard: { borderRadius: 16, padding: 16, borderWidth: 1.5, gap: 12 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  cardHeaderLeft: { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1 },
  cardIcon: { fontSize: 28, marginTop: 2 },
  cardTitle: { fontSize: 16, fontWeight: "700", lineHeight: 22 },
  cardSubtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  statusBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  metricsRow: { flexDirection: "row", alignItems: "center" },
  metricBox: { flex: 1, alignItems: "center", gap: 4 },
  metricLabel: { fontSize: 11, textAlign: "center" },
  metricValue: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  metricDivider: { width: 1, height: 36, marginHorizontal: 4 },

  infoRow: { flexDirection: "row", gap: 16 },
  infoItem: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 11 },
  infoValue: { fontSize: 13 },

  inspectBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  inspectBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  guideBox: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, gap: 10 },
  guideTitle: { fontSize: 15, fontWeight: "700" },
  guideText: { fontSize: 13, lineHeight: 22 },
  callBtn: { backgroundColor: "#FF6B35", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  callBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
