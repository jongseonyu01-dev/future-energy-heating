import React from "react";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { formatFullAddress } from "@/constants/address-data";

export default function BranchDashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAppAuth();
  const branchId = user?.branchId;

  const { data: branch } = trpc.branch.getById.useQuery(
    { id: branchId ?? 0 }, { enabled: !!branchId }
  );
  const { data: requests = [], isLoading } = trpc.repair.listByBranch.useQuery(
    { branchId: branchId ?? 0 }, { enabled: !!branchId }
  );
  const { data: sensors = [] } = trpc.sensor.listByBranch.useQuery(
    { branchId: branchId ?? 0 }, { enabled: !!branchId }
  );

  // 통계 계산
  const total = requests.length;
  const pending = requests.filter(r => r.status === "신규접수" || r.status === "기사배정대기").length;
  const inProgress = requests.filter(r => r.status === "방문예정" || r.status === "작업진행중").length;
  const completed = requests.filter(r => r.status === "작업완료").length;
  const revisit = requests.filter(r => r.status === "재방문필요").length;
  const leakAlert = sensors.filter(s => s.status === "누수감지").length;

  const today = new Date().toISOString().slice(0, 10);
  const todayRequests = requests.filter(r => r.scheduledDate === today);

  const s = styles(colors);

  if (!branchId) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 16 }}>지사장 계정으로 로그인해주세요.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* 헤더 */}
        <View style={s.header}>
          <Text style={s.headerTitle}>{branch?.name ?? "지사"} 현황</Text>
          <Text style={s.headerSub}>{branch?.region ?? ""}</Text>
        </View>

        {/* 통계 카드 */}
        <View style={s.statsGrid}>
          {[
            { label: "전체 접수", value: total, color: "#6B7280", bg: "#F9FAFB" },
            { label: "대기 중", value: pending, color: "#F59E0B", bg: "#FFFBEB" },
            { label: "진행 중", value: inProgress, color: "#3B82F6", bg: "#EFF6FF" },
            { label: "완료", value: completed, color: "#22C55E", bg: "#F0FDF4" },
            { label: "재방문", value: revisit, color: "#EF4444", bg: "#FEF2F2" },
            { label: "누수 경보", value: leakAlert, color: "#0284C7", bg: "#EFF6FF" },
          ].map((stat) => (
            <View key={stat.label} style={[s.statCard, { backgroundColor: stat.bg, borderColor: stat.color + "30" }]}>
              <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[s.statLabel, { color: stat.color }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* 오늘 방문 일정 */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>📅 오늘 방문 일정</Text>
            <TouchableOpacity onPress={() => router.push("/branch-requests" as any)} activeOpacity={0.7}>
              <Text style={s.seeAll}>전체 보기 →</Text>
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator color="#FF6B35" />
          ) : todayRequests.length === 0 ? (
            <Text style={[s.emptyText, { color: colors.muted }]}>오늘 예정된 방문이 없습니다.</Text>
          ) : (
            todayRequests.slice(0, 5).map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[s.requestItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/branch-requests?id=${r.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={s.requestRow}>
                  <Text style={[s.requestCustomer, { color: colors.foreground }]}>{r.customerName}</Text>
                  <Text style={[s.requestTime, { color: "#FF6B35" }]}>{r.scheduledTime ?? "시간 미정"}</Text>
                </View>
                <Text style={[s.requestAddress, { color: colors.muted }]}>
                  {formatFullAddress(r)}
                </Text>
                {r.technicianName && (
                  <Text style={[s.requestTech, { color: "#3B82F6" }]}>👷 {r.technicianName}</Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* 누수 경보 */}
        {leakAlert > 0 && (
          <View style={s.alertSection}>
            <Text style={s.alertTitle}>🚨 누수 경보 {leakAlert}건</Text>
            <Text style={s.alertDesc}>즉시 확인이 필요한 누수 감지 센서가 있습니다.</Text>
            <TouchableOpacity style={s.alertBtn} onPress={() => router.push("/leak-sensor" as any)} activeOpacity={0.8}>
              <Text style={s.alertBtnText}>센서 확인하기 →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  scroll: { paddingBottom: 32 },
  header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 8 },
  statCard: { width: "30%", flex: 1, minWidth: 90, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, gap: 4 },
  statValue: { fontSize: 28, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  section: { padding: 16, gap: 8 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  seeAll: { fontSize: 13, color: "#FF6B35", fontWeight: "600" },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 8 },
  requestItem: { borderRadius: 12, padding: 12, borderWidth: 1, gap: 4 },
  requestRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  requestCustomer: { fontSize: 15, fontWeight: "700" },
  requestTime: { fontSize: 13, fontWeight: "600" },
  requestAddress: { fontSize: 13 },
  requestTech: { fontSize: 12, fontWeight: "600" },
  alertSection: { margin: 16, backgroundColor: "#FEF2F2", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#FECACA", gap: 6 },
  alertTitle: { fontSize: 16, fontWeight: "800", color: "#DC2626" },
  alertDesc: { fontSize: 13, color: "#EF4444" },
  alertBtn: { backgroundColor: "#DC2626", borderRadius: 10, padding: 10, alignItems: "center", marginTop: 4 },
  alertBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
