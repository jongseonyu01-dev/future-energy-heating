import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

const STATUS_COLOR: Record<string, string> = {
  "신규접수": "#6B7280", "기사배정대기": "#F59E0B", "방문예정": "#3B82F6",
  "작업진행중": "#FF6B35", "견적승인대기": "#8B5CF6", "작업완료": "#22C55E", "재방문필요": "#EF4444",
};

const FILTER_TABS = ["전체", "방문예정", "작업진행중", "작업완료", "재방문필요"];

export default function TechWorksScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAppAuth();
  const [activeFilter, setActiveFilter] = useState("전체");
  const [search, setSearch] = useState("");

  const technicianId = user?.technicianId;

  const { data: works = [], isLoading } = trpc.repair.listByTechnician.useQuery(
    { technicianId: technicianId ?? 0 },
    { enabled: !!technicianId }
  );

  const filtered = works.filter((w) => {
    const matchFilter = activeFilter === "전체" || w.status === activeFilter;
    const matchSearch = !search || w.customerName.includes(search) || w.apartmentName.includes(search) || w.requestNumber.includes(search);
    return matchFilter && matchSearch;
  });

  const s = styles(colors);

  if (!technicianId) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 16 }}>기사 계정으로 로그인해주세요.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={s.header}>
        <Text style={s.headerTitle}>작업 목록</Text>
        <Text style={s.headerSub}>{user?.name ? `${user.name}님 · ` : ""}소속: {user?.branchName || "미지정"} · 전체 {works.length}건</Text>
      </View>

      {/* 검색 */}
      <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          style={[s.searchInput, { color: colors.foreground }]}
          value={search}
          onChangeText={setSearch}
          placeholder="고객명·아파트명·접수번호 검색"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
        />
      </View>

      {/* 필터 탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={s.filterContent}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.filterTab, activeFilter === tab && s.filterTabActive]}
            onPress={() => setActiveFilter(tab)}
            activeOpacity={0.7}
          >
            <Text style={[s.filterTabText, activeFilter === tab && s.filterTabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color="#FF6B35" size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40 }}>📋</Text>
          <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8 }}>해당 작업이 없습니다.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {filtered.map((work) => (
            <TouchableOpacity
              key={work.id}
              style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push(`/work-report?id=${work.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={s.cardTop}>
                <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[work.status] + "20" }]}>
                  <Text style={[s.statusText, { color: STATUS_COLOR[work.status] }]}>{work.status}</Text>
                </View>
                <Text style={[s.requestNum, { color: colors.muted }]}>{work.requestNumber}</Text>
              </View>
              <Text style={[s.customerName, { color: colors.foreground }]}>{work.customerName}</Text>
              <Text style={[s.address, { color: colors.muted }]}>{work.apartmentName} {work.dong}동 {work.ho}호</Text>
              {(work.preferredDate || work.preferredTime) && (
                <Text style={[s.schedLine, { color: colors.muted }]}>희망: {`${work.preferredDate || ""} ${work.preferredTime || ""}`.trim()}</Text>
              )}
              <Text style={[s.schedLine, { color: (work.scheduledDate || work.scheduledTime) ? "#0369A1" : colors.muted, fontWeight: (work.scheduledDate || work.scheduledTime) ? "700" : "400" }]}>
                확정: {(work.scheduledDate || work.scheduledTime) ? `${work.scheduledDate || ""} ${work.scheduledTime || ""}`.trim() : "일정 미확정"}
              </Text>
              <View style={s.cardBottom}>
                <Text style={[s.symptom, { color: "#FF6B35" }]}>
                  {work.requestType === "배관청소" ? "🚿 배관청소" : `🔧 ${work.symptom}`}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  searchBox: { margin: 12, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { fontSize: 14, paddingVertical: 10 },
  filterRow: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 12, gap: 8, alignItems: "center" },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "transparent", borderWidth: 1, borderColor: "#E5E7EB" },
  filterTabActive: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
  filterTabText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  filterTabTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  list: { padding: 12, gap: 10 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: "700" },
  requestNum: { fontSize: 12 },
  customerName: { fontSize: 16, fontWeight: "700" },
  address: { fontSize: 13 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  symptom: { fontSize: 13, fontWeight: "600" },
  date: { fontSize: 12 },
  schedLine: { fontSize: 12, marginTop: 2 },
});
