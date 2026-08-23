import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, RefreshControl, Platform, Alert, Linking,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { formatFullAddress } from "@/constants/address-data";
import { LocationConsentModal } from "@/components/location-consent-modal";
import { requestLocationPermissions } from "@/lib/location-tracking";
import { useLocationTracking } from "@/lib/location-tracking-context";

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
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingDepartRequestId, setPendingDepartRequestId] = useState<number | null>(null);
  const [startingTrackingRequestId, setStartingTrackingRequestId] = useState<number | null>(null);

  const userId = user?.userId;
  const technicianId = user?.technicianId;

  const {
    trackingRequestId,
    startTracking,
    checkPermissions,
  } = useLocationTracking();

  // 세션 기반 보안 조회 - 서버에서 기사 ID를 확인하므로 클라이언트에서 technicianId를 전달하지 않음
  const { data: works = [], isLoading, error, refetch } = trpc.repair.listMySchedule.useQuery(
    undefined,
    { enabled: !!userId }
  );
  const resolvedTechnicianId = technicianId ?? (works.length > 0 ? works[0].technicianId : null);
  const consentQuery = trpc.location.getConsent.useQuery(
    { technicianId: resolvedTechnicianId ?? 0 },
    { enabled: !!resolvedTechnicianId }
  );
  const startTrackingMutation = trpc.location.startTracking.useMutation();
  const saveConsentMutation = trpc.location.saveConsent.useMutation();

  // 화면 재진입 시 자동 refetch
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const filtered = works.filter((w) => {
    const matchFilter = activeFilter === "전체" || w.status === activeFilter;
    const matchSearch = !search || w.customerName.includes(search) || w.apartmentName.includes(search) || w.requestNumber.includes(search);
    return matchFilter && matchSearch;
  });

  const doDepart = async (work: any) => {
    if (!resolvedTechnicianId) {
      Alert.alert("기사 정보 오류", "기사 계정 연결 정보를 찾을 수 없습니다. 본사에 문의해주세요.");
      return;
    }
    setStartingTrackingRequestId(work.id);
    try {
      const { granted, backgroundGranted } = await requestLocationPermissions();
      await checkPermissions();
      if (!granted && Platform.OS !== "web") {
        Alert.alert(
          "위치 권한 필요",
          "위치 공유를 위해 위치 권한이 필요합니다.\n설정 → 앱 → 퓨처에너지테크 → 위치 → 앱 사용 중 허용"
        );
        return;
      }
      if (!backgroundGranted && Platform.OS !== "web") {
        Alert.alert(
          "백그라운드 위치 권한 권장",
          "화면을 끄거나 내비게이션 앱 사용 중에도 위치를 전송하려면 위치 권한을 '항상 허용'으로 설정해 주세요.",
          [{ text: "나중에" }, { text: "설정 열기", onPress: () => Linking.openSettings() }]
        );
      }

      const result = await startTrackingMutation.mutateAsync({
        requestId: work.id,
        technicianId: resolvedTechnicianId,
        technicianName: user?.name || user?.loginId || "담당 기사",
        technicianPhone: user?.phoneNumber || "",
        customerName: work.customerName,
        customerPhone: work.phoneNumber,
        customerAddress: formatFullAddress(work),
        customerLat: work.customerLat ? Number(work.customerLat) : undefined,
        customerLng: work.customerLng ? Number(work.customerLng) : undefined,
        branchId: work.branchId ?? undefined,
        branchName: work.branchName ?? undefined,
        demoMode: false,
      });
      if (!result.success || !result.token) throw new Error("위치 공유 세션을 시작하지 못했습니다.");

      const trackingResult = await startTracking({
        token: result.token,
        requestId: work.id,
        trackingUrl: result.trackingUrl,
      });
      if (!trackingResult.ok) throw new Error(trackingResult.error || "위치 전송을 시작하지 못했습니다.");

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await refetch();
      Alert.alert(
        "출발 완료 ✅",
        result.smsSent
          ? "고객에게 실시간 위치 확인 링크를 문자로 보냈습니다."
          : "실시간 위치 공유를 시작했습니다."
      );
    } catch (e: any) {
      Alert.alert("출발 처리 오류", e?.message || "출발 처리 중 오류가 발생했습니다.");
    } finally {
      setStartingTrackingRequestId(null);
    }
  };

  const handleDepart = async (work: any) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (!consentQuery.data?.hasConsented) {
      setPendingDepartRequestId(work.id);
      setShowConsentModal(true);
      return;
    }
    await doDepart(work);
  };

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
            <Text style={s.headerSub}>{user?.name ? `${user.name}님 · ` : ""}소속: {user?.branchName || "미지정"} · 전체 {works.length}건</Text>
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
          {filtered.map((work) => {
            const isCompleted = ["공사완료", "작업완료"].includes(work.status);
            const isThisTracking = trackingRequestId === work.id;
            return (
            <TouchableOpacity
              key={work.id}
              style={[s.card, { backgroundColor: colors.surface, borderColor: isThisTracking ? "#FF6B35" : colors.border }, isThisTracking && s.cardTracking]}
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
              <Text style={[s.address, { color: colors.muted }]}>{formatFullAddress(work)}</Text>
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

              {!isCompleted && (
                <TouchableOpacity
                  style={[s.departBtn, (startingTrackingRequestId !== null || isThisTracking) && s.departBtnDisabled]}
                  onPress={(event) => {
                    event.stopPropagation();
                    if (!isThisTracking) handleDepart(work);
                  }}
                  disabled={startingTrackingRequestId !== null || isThisTracking}
                  activeOpacity={0.8}
                >
                  {startingTrackingRequestId === work.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.departBtnText}>
                      {isThisTracking ? "📍 실시간 위치 공유 중" : "🚗 고객 집으로 출발"}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );})}
        </ScrollView>
      )}

      <LocationConsentModal
        visible={showConsentModal}
        onConsent={async () => {
          setShowConsentModal(false);
          if (resolvedTechnicianId) {
            try {
              await saveConsentMutation.mutateAsync({ technicianId: resolvedTechnicianId });
              await consentQuery.refetch();
            } catch (e: any) {
              Alert.alert("동의 저장 오류", e?.message || "위치정보 이용 동의를 저장하지 못했습니다.");
              setPendingDepartRequestId(null);
              return;
            }
          }
          if (pendingDepartRequestId !== null) {
            const work = works.find((item) => item.id === pendingDepartRequestId);
            setPendingDepartRequestId(null);
            if (work) await doDepart(work);
          }
        }}
        onDecline={() => {
          setShowConsentModal(false);
          setPendingDepartRequestId(null);
        }}
      />
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  searchBox: { margin: 12, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { fontSize: 14, paddingVertical: 10 },
  filterRow: { height: 52 },
  filterContent: { paddingHorizontal: 12, gap: 8, alignItems: "flex-start" },
  filterTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "transparent", borderWidth: 1, borderColor: "#E5E7EB" },
  filterTabActive: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
  filterTabText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  filterTabTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  list: { padding: 12, gap: 10 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  cardTracking: { borderWidth: 2 },
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
  departBtn: {
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  departBtnDisabled: { backgroundColor: "#9CA3AF" },
  departBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
