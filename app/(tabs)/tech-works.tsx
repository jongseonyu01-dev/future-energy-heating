import React, { useState, useCallback, useRef } from "react";
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
  "출발": "#F97316", "도착": "#0F766E", "공사중": "#FF6B35", "공사완료": "#22C55E",
  "작업진행중": "#FF6B35", "견적승인대기": "#8B5CF6", "작업완료": "#22C55E", "재방문필요": "#EF4444",
};

const FILTER_TABS = ["전체", "방문예정", "작업진행중", "작업완료", "재방문필요"];

const WORKSPACE_STATUSES = new Set([
  "기사도착", "도착", "작업진행중", "공사중", "작업완료", "공사완료", "결제완료", "후기요청", "재방문필요",
]);

const canOpenWorkspace = (work: any) =>
  Boolean(work?.arrivedAt) ||
  WORKSPACE_STATUSES.has(work?.status) ||
  WORKSPACE_STATUSES.has(work?.workflowStage);

const friendlyDepartError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : "";
  const knownMessages = [
    "고객이 견적을 아직 승인하지 않았습니다. 견적 승인 후 출발 처리할 수 있습니다.",
    "접수 배정 정보가 변경되었습니다.",
    "본인에게 배정된 접수만 출발 처리할 수 있습니다.",
    "현재 진행 중인 방문을 먼저 도착 또는 취소 처리해 주세요.",
    "이미 도착 또는 완료 처리된 방문입니다. 일정을 새로고침해 주세요.",
    "다른 방문 건의 위치 공유가 진행 중입니다. 먼저 도착 또는 업무 취소 처리해 주세요.",
    "위치 공유 세션을 시작하지 못했습니다.",
    "위치 전송을 시작하지 못했습니다.",
  ];
  return knownMessages.find((message) => raw.includes(message))
    ?? "출발 처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요. 계속되면 본사에 문의해 주세요.";
};

const LOCAL_TRACKING_RECOVERY_MESSAGE =
  "서버의 출발 처리는 완료됐지만 이 휴대폰의 위치 전송이 시작되지 않았습니다. 출발 버튼을 다시 누르지 마세요. 앱을 완전히 종료했다가 다시 실행하고 위치 권한을 확인해 주세요.";

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
  const startingTrackingRequestIdRef = useRef<number | null>(null);

  const userId = user?.userId;
  const technicianId = user?.technicianId;
  const now = new Date();
  const collectionMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };

  const {
    trackingRequestId,
    trackingRecoveryRequestId,
    departureLockRequestId,
    isTrackingHydrated,
    startTracking,
    checkPermissions,
    isTrackingRecoveryLocked,
    tryBeginDeparture,
    releaseDeparture,
  } = useLocationTracking();

  // 세션 기반 보안 조회 - 서버에서 기사 ID를 확인하므로 클라이언트에서 technicianId를 전달하지 않음
  const { data: works = [], isLoading, error, refetch } = trpc.repair.listMySchedule.useQuery(
    undefined,
    { enabled: !!userId }
  );
  const { data: monthlyCollections, refetch: refetchMonthlyCollections } = (trpc.workReport as any).monthlySummary.useQuery(collectionMonth, { enabled: !!userId });
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
      if (userId) { refetch(); refetchMonthlyCollections(); }
    }, [userId, refetch, refetchMonthlyCollections])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([refetch(), refetchMonthlyCollections()]); } finally { setRefreshing(false); }
  }, [refetch, refetchMonthlyCollections]);

  const filtered = works.filter((w) => {
    const matchFilter = activeFilter === "전체" || w.status === activeFilter;
    const matchSearch = !search || w.customerName.includes(search) || w.apartmentName.includes(search) || w.requestNumber.includes(search);
    return matchFilter && matchSearch;
  });

  const doDepart = async (work: any, lockAlreadyHeld = false) => {
    if (!resolvedTechnicianId) {
      if (lockAlreadyHeld && startingTrackingRequestIdRef.current === work.id) {
        startingTrackingRequestIdRef.current = null;
        setStartingTrackingRequestId(null);
      }
      Alert.alert("기사 정보 오류", "기사 계정 연결 정보를 찾을 수 없습니다. 본사에 문의해주세요.");
      return;
    }
    if (!lockAlreadyHeld) {
      if (trackingRequestId !== null && trackingRequestId !== work.id) {
        Alert.alert("다른 방문 이동 중", "현재 이동 중인 방문을 먼저 도착 또는 취소 처리해 주세요.");
        return;
      }
      if (trackingRequestId === work.id || startingTrackingRequestIdRef.current !== null) return;
      startingTrackingRequestIdRef.current = work.id;
      setStartingTrackingRequestId(work.id);
    } else if (startingTrackingRequestIdRef.current !== work.id) {
      return;
    }
    if (isTrackingRecoveryLocked()) {
      startingTrackingRequestIdRef.current = null;
      setStartingTrackingRequestId(null);
      Alert.alert("출발 완료 · 위치 확인 필요", LOCAL_TRACKING_RECOVERY_MESSAGE);
      return;
    }
    let sharedDepartureAcquired = false;
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

      if (!tryBeginDeparture(work.id)) {
        Alert.alert(
          isTrackingRecoveryLocked() ? "출발 완료 · 위치 확인 필요" : "출발 처리 중",
          isTrackingRecoveryLocked()
            ? LOCAL_TRACKING_RECOVERY_MESSAGE
            : isTrackingHydrated
              ? "다른 방문의 출발 처리가 진행 중입니다. 잠시 후 다시 확인해 주세요."
              : "기존 위치 세션을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      sharedDepartureAcquired = true;
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
      sharedDepartureAcquired = false;
      if (!trackingResult.ok) {
        console.warn("[TechWorks] 서버 출발 완료 후 기기 위치 추적 시작 실패:", trackingResult.error);
        await refetch();
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        Alert.alert("출발 완료 · 위치 확인 필요", LOCAL_TRACKING_RECOVERY_MESSAGE);
        return;
      }

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
      Alert.alert("출발 처리 오류", friendlyDepartError(e));
    } finally {
      if (sharedDepartureAcquired) releaseDeparture(work.id);
      startingTrackingRequestIdRef.current = null;
      setStartingTrackingRequestId(null);
    }
  };

  const handleDepart = async (work: any) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (!resolvedTechnicianId) {
      Alert.alert("기사 정보 오류", "기사 계정 연결 정보를 찾을 수 없습니다. 본사에 문의해주세요.");
      return;
    }
    if (isTrackingRecoveryLocked()) {
      Alert.alert("출발 완료 · 위치 확인 필요", LOCAL_TRACKING_RECOVERY_MESSAGE);
      return;
    }
    if (trackingRequestId !== null && trackingRequestId !== work.id) {
      Alert.alert("다른 방문 이동 중", "현재 이동 중인 방문을 먼저 도착 또는 취소 처리해 주세요.");
      return;
    }
    if (trackingRequestId === work.id || startingTrackingRequestIdRef.current !== null) return;

    startingTrackingRequestIdRef.current = work.id;
    setStartingTrackingRequestId(work.id);
    if (!consentQuery.data?.hasConsented) {
      setPendingDepartRequestId(work.id);
      setShowConsentModal(true);
      return;
    }
    await doDepart(work, true);
  };

  const handleOpenWork = (work: any) => {
    if (!canOpenWorkspace(work)) {
      Alert.alert(
        "도착 완료 후 이용 가능",
        "작업 일정에서 ‘고객 집으로 출발’을 누른 뒤 현장에 도착하면 ‘도착’을 눌러주세요. 그 다음 점검표와 견적 메뉴가 열립니다.",
      );
      return;
    }
    router.push(`/job-workspace?requestId=${work.id}` as any);
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

      <View style={[s.monthlyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.monthlyTop}><Text style={[s.monthlyTitle, { color: colors.foreground }]}>{collectionMonth.month}월 완료보고 합계</Text><Text style={s.monthlyAmount}>{Number(monthlyCollections?.totals.amount || 0).toLocaleString()}원</Text></View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{monthlyCollections?.totals.count || 0}건 · 매월 1일부터 말일까지 자동 합산</Text>
        <View style={s.methodRow}>{Object.entries(monthlyCollections?.totals.byMethod || {}).map(([method, amount]) => (<View key={method} style={s.methodChip}><Text style={s.methodText}>{method} {Number(amount).toLocaleString()}원</Text></View>))}</View>
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
            const workspaceAvailable = canOpenWorkspace(work);
            const isStartingThis = startingTrackingRequestId === work.id;
            const needsLocationRecovery = trackingRecoveryRequestId === work.id;
            const isDepartBusy = startingTrackingRequestId !== null
              || departureLockRequestId !== null
              || !isTrackingHydrated
              || isThisTracking;
            const statusColor = STATUS_COLOR[work.status] ?? "#6B7280";
            return (
            <TouchableOpacity
              key={work.id}
              style={[s.card, { backgroundColor: colors.surface, borderColor: isThisTracking ? "#FF6B35" : colors.border }, isThisTracking && s.cardTracking]}
              onPress={() => handleOpenWork(work)}
              activeOpacity={0.8}
            >
              <View style={s.cardTop}>
                <View style={[s.statusBadge, { backgroundColor: statusColor + "20" }]}>
                  <Text style={[s.statusText, { color: statusColor }]}>{work.status}</Text>
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

              {!isCompleted && !workspaceAvailable && (
                <TouchableOpacity
                  style={[s.departBtn, (isStartingThis || needsLocationRecovery || isThisTracking) && s.departBtnDisabled]}
                  onPress={(event) => {
                    event.stopPropagation();
                    if (!isThisTracking) handleDepart(work);
                  }}
                  disabled={isDepartBusy}
                  activeOpacity={0.8}
                >
                  {isStartingThis ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.departBtnText}>
                      {isThisTracking
                        ? "📍 실시간 위치 공유 중"
                        : needsLocationRecovery
                          ? "⚠️ 앱 재실행·위치 권한 확인"
                          : "🚗 고객 집으로 출발"}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {workspaceAvailable && (
                <View style={s.workspaceHint}>
                  <Text style={s.workspaceHintText}>🧰 눌러서 업무공간 열기</Text>
                </View>
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
              Alert.alert("동의 저장 오류", "위치정보 이용 동의를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
              setPendingDepartRequestId(null);
              startingTrackingRequestIdRef.current = null;
              setStartingTrackingRequestId(null);
              return;
            }
          }
          if (pendingDepartRequestId !== null) {
            const work = works.find((item) => item.id === pendingDepartRequestId);
            setPendingDepartRequestId(null);
            if (work) await doDepart(work, true);
            else {
              startingTrackingRequestIdRef.current = null;
              setStartingTrackingRequestId(null);
            }
          }
        }}
        onDecline={() => {
          setShowConsentModal(false);
          setPendingDepartRequestId(null);
          startingTrackingRequestIdRef.current = null;
          setStartingTrackingRequestId(null);
        }}
      />
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  monthlyCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  monthlyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  monthlyTitle: { fontSize: 15, fontWeight: "800" }, monthlyAmount: { color: "#FF6B35", fontSize: 18, fontWeight: "900" },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 }, methodChip: { backgroundColor: "#FFF7ED", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  methodText: { color: "#C2410C", fontSize: 11, fontWeight: "700" },
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
  workspaceHint: {
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  workspaceHintText: { color: "#047857", fontSize: 13, fontWeight: "800" },
});
