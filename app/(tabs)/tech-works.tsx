import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { formatFullAddress } from "@/constants/address-data";
import { IS_REVENUE_REVIEW_MODE } from "@/constants/oauth";
import { getKstYearMonth, summarizeTechnicianCollections } from "@/lib/revenue-summary";

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
  const [refreshing, setRefreshing] = useState(false);

  const userId = user?.userId;
  const collectionMonth = getKstYearMonth();

  // 세션 기반 보안 조회 - 서버에서 기사 ID를 확인하므로 클라이언트에서 technicianId를 전달하지 않음
  const { data: productionWorks = [], isLoading, error, refetch } = trpc.repair.listMySchedule.useQuery(
    undefined,
    { enabled: !!userId && !IS_REVENUE_REVIEW_MODE }
  );
  // 운영 서버는 세션의 기사 ID를 사용하므로 클라이언트에서 다른 기사 ID를 보낼 수 없다.
  const workReportApi = trpc.workReport as any;
  const reviewRevenueApi = (trpc as any).revenueReview;
  const { data: reviewFixture } = reviewRevenueApi.fixture.useQuery(undefined, { enabled: !!userId && IS_REVENUE_REVIEW_MODE });
  const { data: monthlyCollections, refetch: refetchMonthlyCollections } = workReportApi.monthlySummary.useQuery(
    { year: collectionMonth.year, month: collectionMonth.month },
    { enabled: !!userId && !IS_REVENUE_REVIEW_MODE },
  );
  const { data: reviewCollections, refetch: refetchReviewCollections } = reviewRevenueApi.monthlySummary.useQuery(
    { year: collectionMonth.year, month: collectionMonth.month }, { enabled: !!userId && IS_REVENUE_REVIEW_MODE },
  );
  const works: any[] = IS_REVENUE_REVIEW_MODE && reviewFixture ? [{
    id: reviewFixture.requestId, requestNumber: "REVIEW-981001", customerName: "검수용 합성 고객",
    apartmentName: "검수 전용", status: "작업진행중", symptom: "결제 기록 검수", requestType: "기타",
  }] : productionWorks;
  const revenueSummary = useMemo(
    () => summarizeTechnicianCollections((IS_REVENUE_REVIEW_MODE ? reviewCollections?.rows : monthlyCollections?.rows) ?? []),
    [monthlyCollections, reviewCollections],
  );

  // 화면 재진입 시 자동 refetch
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        refetch();
        refetchMonthlyCollections();
        refetchReviewCollections();
      }
    }, [userId, refetch, refetchMonthlyCollections, refetchReviewCollections])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([refetch(), refetchMonthlyCollections(), refetchReviewCollections()]); } finally { setRefreshing(false); }
  }, [refetch, refetchMonthlyCollections, refetchReviewCollections]);

  const filtered = works.filter((w) => {
    const matchFilter = activeFilter === "전체" || (w.status ?? "") === activeFilter;
    const matchSearch = !search || String(w.customerName ?? "").includes(search) || String(w.apartmentName ?? "").includes(search) || String(w.requestNumber ?? "").includes(search);
    return matchFilter && matchSearch;
  });

  const s = styles(colors);

  if (!userId) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 16 }}>기사 계정으로 로그인해주세요.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={s.header}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={s.headerTitle}>작업 목록</Text>
            <Text style={s.headerSub}>{user?.name ? `${user.name}님 · ` : ""}소속: {user?.branchName || "미지정"} · 전체 {works.length}건{IS_REVENUE_REVIEW_MODE ? " · 검수 전용" : ""}</Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" }}
            onPress={() => router.push("/tech-estimate" as any)}
            activeOpacity={0.8}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>✏️ 견적 작성</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.revenueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.revenueTop}>
          <View>
            <Text style={[s.revenueTitle, { color: colors.foreground }]}>오늘 매출</Text>
            <Text style={[s.revenueSub, { color: colors.muted }]}>한국시간 기준 완료보고</Text>
          </View>
          <Text style={s.todayAmount}>{revenueSummary.todayAmount.toLocaleString()}원</Text>
        </View>
        <View style={s.revenueDivider} />
        <View style={s.revenueTop}>
          <View>
            <Text style={[s.revenueTitle, { color: colors.foreground }]}>{revenueSummary.month}월 매출</Text>
            <Text style={[s.revenueSub, { color: colors.muted }]}>{revenueSummary.monthCount}건 · 매월 1일부터 말일까지 자동 합산</Text>
          </View>
          <Text style={s.monthAmount}>{revenueSummary.monthAmount.toLocaleString()}원</Text>
        </View>
        <View style={s.methodRow}>
          {Object.entries(revenueSummary.byMethod).map(([method, amount]) => (
            <View key={method} style={s.methodChip}>
              <Text style={s.methodText}>{method} {Number(amount).toLocaleString()}원</Text>
            </View>
          ))}
        </View>
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
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={{ color: "#EF4444", fontSize: 15, marginTop: 8 }}>작업 목록을 불러오지 못했습니다.</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>{(error as any)?.message || "서버 연결을 확인해주세요."}</Text>
          <TouchableOpacity
            style={{ marginTop: 16, backgroundColor: "#FF6B35", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 }}
            onPress={() => refetch()}
            activeOpacity={0.8}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <ScrollView
          contentContainerStyle={s.center}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF6B35" />}
        >
          <Text style={{ fontSize: 40 }}>📋</Text>
          <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8 }}>해당 작업이 없습니다.</Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF6B35" />}
        >
          {filtered.map((work) => (
            <TouchableOpacity
              key={work.id}
              style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push(`/work-report?id=${work.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={s.cardTop}>
                <View style={[s.statusBadge, { backgroundColor: (STATUS_COLOR[work.status] ?? "#6B7280") + "20" }]}>
                  <Text style={[s.statusText, { color: STATUS_COLOR[work.status] ?? "#6B7280" }]}>{work.status ?? "상태 미확인"}</Text>
                </View>
                <Text style={[s.requestNum, { color: colors.muted }]}>{work.requestNumber}</Text>
              </View>
              <Text style={[s.customerName, { color: colors.foreground }]}>{work.customerName ?? "고객 정보 미확인"}</Text>
              <Text style={[s.address, { color: colors.muted }]}>{formatFullAddress(work)}</Text>
              {(work.preferredDate || work.preferredTime) && (
                <Text style={[s.schedLine, { color: colors.muted }]}>희망: {`${work.preferredDate || ""} ${work.preferredTime || ""}`.trim()}</Text>
              )}
              <Text style={[s.schedLine, { color: (work.scheduledDate || work.scheduledTime) ? "#0369A1" : colors.muted, fontWeight: (work.scheduledDate || work.scheduledTime) ? "700" : "400" }]}>
                확정: {(work.scheduledDate || work.scheduledTime) ? `${work.scheduledDate || ""} ${work.scheduledTime || ""}`.trim() : "일정 미확정"}
              </Text>
              <View style={s.cardBottom}>
                <Text style={[s.symptom, { color: "#FF6B35" }]}>
                  {work.requestType === "배관청소" ? "🚿 배관청소" : `🔧 ${work.symptom ?? "증상 미확인"}`}
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
  revenueCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  revenueTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  revenueTitle: { fontSize: 15, fontWeight: "800" },
  revenueSub: { fontSize: 12, marginTop: 2 },
  revenueDivider: { height: 1, backgroundColor: "#E5E7EB" },
  todayAmount: { color: "#0F766E", fontSize: 17, fontWeight: "900" },
  monthAmount: { color: "#FF6B35", fontSize: 19, fontWeight: "900" },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  methodChip: { backgroundColor: "#FFF7ED", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  methodText: { color: "#C2410C", fontSize: 11, fontWeight: "700" },
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
