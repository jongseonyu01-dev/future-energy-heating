import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { LocationConsentModal } from "@/components/location-consent-modal";
import { ScreenContainer } from "@/components/screen-container";
import {
  DEPARTABLE_VISIT_STATUSES,
  useTechnicianVisitTracking,
} from "@/components/technician-visit-tracking";
import { formatFullAddress } from "@/constants/address-data";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

const STATUS_COLOR: Record<string, string> = {
  신규접수: "#6B7280",
  기사배정대기: "#F59E0B",
  방문예정: "#3B82F6",
  기사확인대기: "#8B5CF6",
  기사확인완료: "#2563EB",
  기사일정확인: "#2563EB",
  출발: "#FF6B35",
  도착: "#16A34A",
  공사중: "#F59E0B",
  작업진행중: "#FF6B35",
  견적승인대기: "#8B5CF6",
  작업완료: "#22C55E",
  공사완료: "#22C55E",
  재방문필요: "#EF4444",
};

const FILTER_TABS = [
  "전체",
  "방문예정",
  "작업진행중",
  "작업완료",
  "재방문필요",
] as const;
const COMPLETED_STATUSES = new Set(["작업완료", "공사완료"]);
const IN_PROGRESS_STATUSES = new Set(["작업진행중", "공사중"]);

function matchesStatusFilter(status: string, activeFilter: string) {
  if (activeFilter === "전체") return true;
  if (activeFilter === "작업완료") return COMPLETED_STATUSES.has(status);
  if (activeFilter === "작업진행중") return IN_PROGRESS_STATUSES.has(status);
  return status === activeFilter;
}

export default function TechWorksScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAppAuth();
  const [activeFilter, setActiveFilter] =
    useState<(typeof FILTER_TABS)[number]>("전체");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const userId = user?.userId;

  const {
    data: works = [],
    isLoading,
    error,
    refetch,
  } = trpc.repair.listMySchedule.useQuery(undefined, { enabled: !!userId });
  const resolvedTechnicianId =
    user?.technicianId ?? (works.length > 0 ? works[0].technicianId : null);

  const tracking = useTechnicianVisitTracking({
    works,
    technicianId: resolvedTechnicianId,
    workListReady: !isLoading,
    refetch,
  });

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const normalizedSearch = search.trim().toLocaleLowerCase("ko-KR");
  const filtered = works.filter((work) => {
    const matchFilter = matchesStatusFilter(work.status, activeFilter);
    if (!normalizedSearch) return matchFilter;
    const searchable = [
      work.customerName,
      work.apartmentName,
      work.requestNumber,
      formatFullAddress(work),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    return matchFilter && searchable.includes(normalizedSearch);
  });

  const s = styles(colors);

  if (!userId) {
    return (
      <ScreenContainer className="p-6">
        <Text
          style={{
            color: colors.muted,
            textAlign: "center",
            marginTop: 40,
            fontSize: 16,
          }}
        >
          기사 계정으로 로그인해주세요.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {tracking.hasUnmatchedLegacyTracking && (
        <View style={s.legacyRecoveryBanner}>
          <View style={s.legacyRecoveryCopy}>
            <Text style={s.legacyRecoveryTitle}>⚠️ 이전 위치 공유 확인 필요</Text>
            <Text style={s.legacyRecoveryText}>
              방문 건을 찾지 못한 이전 공유가 남아 있습니다. 종료 후 새 출발이 가능합니다.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              s.legacyRecoveryButton,
              tracking.isLegacyStopPending && s.disabledButton,
            ]}
            onPress={tracking.handleStopLegacyTracking}
            disabled={tracking.isLegacyStopPending}
            activeOpacity={0.8}
          >
            {tracking.isLegacyStopPending ? (
              <ActivityIndicator color="#991B1B" size="small" />
            ) : (
              <Text style={s.legacyRecoveryButtonText}>이전 공유 종료</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {tracking.trackingToken && !tracking.hasUnmatchedLegacyTracking && (
        <View style={s.trackingBanner}>
          <Text style={s.trackingBannerText}>
            📍 고객에게 실시간 위치 공유 중
          </Text>
        </View>
      )}

      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={s.headerCopy}>
            <Text style={s.headerTitle}>작업 목록</Text>
            <Text style={s.headerSub} numberOfLines={1}>
              {user?.name ? `${user.name}님 · ` : ""}소속:{" "}
              {user?.branchName || "미지정"} · 전체 {works.length}건
            </Text>
          </View>
          <TouchableOpacity
            style={s.estimateButton}
            onPress={() => router.push("/tech-estimate" as any)}
            activeOpacity={0.8}
          >
            <Text style={s.estimateButtonText}>✏️ 견적 작성</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          s.searchBox,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <TextInput
          style={[s.searchInput, { color: colors.foreground }]}
          value={search}
          onChangeText={setSearch}
          placeholder="고객명·아파트명·접수번호 검색"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterRow}
        contentContainerStyle={s.filterContent}
      >
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.filterTab, activeFilter === tab && s.filterTabActive]}
            onPress={() => setActiveFilter(tab)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                s.filterTabText,
                activeFilter === tab && s.filterTabTextActive,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color="#FF6B35" size="large" />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={{ color: "#EF4444", fontSize: 15, marginTop: 8 }}>
            작업 목록을 불러오지 못했습니다.
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
            {(error as any)?.message || "서버 연결을 확인해주세요."}
          </Text>
          <TouchableOpacity
            style={s.retryButton}
            onPress={() => refetch()}
            activeOpacity={0.8}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <ScrollView
          contentContainerStyle={s.center}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF6B35"
            />
          }
        >
          <Text style={{ fontSize: 40 }}>📋</Text>
          <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8 }}>
            해당 작업이 없습니다.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF6B35"
            />
          }
        >
          {filtered.map((work) => {
            const statusColor = STATUS_COLOR[work.status] ?? "#6B7280";
            const isThisTracking =
              tracking.trackingRequestId === work.id &&
              !!tracking.trackingToken;
            const isAnotherVisitTracking =
              !!tracking.trackingToken &&
              tracking.trackingRequestId !== work.id;
            const canDepart = DEPARTABLE_VISIT_STATUSES.has(work.status);
            const isStarting = tracking.isStartingRequest(work.id);
            const isArriving = tracking.isArrivingRequest(work.id);
            const isResending = tracking.isResendingRequest(work.id);

            return (
              <View
                key={work.id}
                style={[
                  s.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isThisTracking ? "#FF6B35" : colors.border,
                  },
                  isThisTracking && s.cardTracking,
                ]}
              >
                <TouchableOpacity
                  style={s.cardDetails}
                  onPress={() =>
                    router.push(`/work-report?id=${work.id}` as any)
                  }
                  activeOpacity={0.8}
                >
                  <View style={s.cardTop}>
                    <View
                      style={[
                        s.statusBadge,
                        { backgroundColor: `${statusColor}20` },
                      ]}
                    >
                      <Text style={[s.statusText, { color: statusColor }]}>
                        {work.status}
                      </Text>
                    </View>
                    <Text style={[s.requestNum, { color: colors.muted }]}>
                      {work.requestNumber}
                    </Text>
                  </View>
                  {isThisTracking && (
                    <Text style={s.trackingIndicator}>📍 위치 공유 중</Text>
                  )}
                  <Text style={[s.customerName, { color: colors.foreground }]}>
                    {work.customerName}
                  </Text>
                  <Text style={[s.address, { color: colors.muted }]}>
                    {formatFullAddress(work)}
                  </Text>
                  {(work.preferredDate || work.preferredTime) && (
                    <Text style={[s.schedLine, { color: colors.muted }]}>
                      희망:{" "}
                      {`${work.preferredDate || ""} ${work.preferredTime || ""}`.trim()}
                    </Text>
                  )}
                  <Text
                    style={[
                      s.schedLine,
                      {
                        color:
                          work.scheduledDate || work.scheduledTime
                            ? "#0369A1"
                            : colors.muted,
                        fontWeight:
                          work.scheduledDate || work.scheduledTime
                            ? "700"
                            : "400",
                      },
                    ]}
                  >
                    확정:{" "}
                    {work.scheduledDate || work.scheduledTime
                      ? `${work.scheduledDate || ""} ${work.scheduledTime || ""}`.trim()
                      : "일정 미확정"}
                  </Text>
                  <View style={s.cardBottom}>
                    <Text style={[s.symptom, { color: "#FF6B35" }]}>
                      {work.requestType === "배관청소"
                        ? "🚿 배관청소"
                        : `🔧 ${work.symptom}`}
                    </Text>
                    <Text style={[s.openReport, { color: colors.muted }]}>
                      상세·점검표 ›
                    </Text>
                  </View>
                </TouchableOpacity>

                {!isThisTracking && work.status === "도착" ? (
                  <View style={s.arrivedState}>
                    <Text style={s.arrivedStateText}>✅ 도착 완료</Text>
                  </View>
                ) : (
                  (isThisTracking || canDepart) && (
                    <View style={s.locationButtons}>
                      {isThisTracking ? (
                        <View style={s.trackingActionGroup}>
                          <View style={s.trackingActions}>
                            <TouchableOpacity
                              style={[
                                s.arriveButton,
                                (isArriving || isResending) && s.disabledButton,
                              ]}
                              onPress={() => tracking.handleArrive(work)}
                              disabled={isArriving || isResending}
                              activeOpacity={0.8}
                            >
                              {isArriving ? (
                                <ActivityIndicator color="#fff" size="small" />
                              ) : (
                                <Text style={s.locationButtonText}>✅ 도착</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                s.cancelButton,
                                (isArriving || isResending) && s.disabledButton,
                              ]}
                              onPress={() => tracking.handleStopSharing(work)}
                              disabled={isArriving || isResending}
                              activeOpacity={0.8}
                            >
                              <Text style={s.locationButtonText}>
                                ⏹ 위치 공유 종료
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            style={[
                              s.resendSmsButton,
                              (isArriving || isResending) && s.disabledButton,
                            ]}
                            onPress={() => tracking.handleResendTrackingSms(work)}
                            disabled={isArriving || isResending}
                            activeOpacity={0.8}
                          >
                            {isResending ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Text style={s.locationButtonText}>
                                📨 고객 위치링크 재발송
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            s.departButton,
                            (tracking.isStartingAny ||
                              isAnotherVisitTracking ||
                              tracking.isConsentLoading) &&
                              s.disabledButton,
                          ]}
                          onPress={() => tracking.handleDepart(work)}
                          disabled={
                            tracking.isStartingAny ||
                            isAnotherVisitTracking ||
                            tracking.isConsentLoading
                          }
                          activeOpacity={0.8}
                        >
                          {isStarting ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={s.locationButtonText}>
                              {isAnotherVisitTracking
                                ? "📍 다른 방문 위치 공유 중"
                                : tracking.isConsentLoading
                                  ? "⏳ 위치 동의 확인 중"
                                  : work.status === "출발"
                                    ? "🚗 위치 공유 다시 연결"
                                    : "🚗 고객 집으로 출발"}
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <LocationConsentModal
        visible={tracking.showConsentModal}
        onConsent={tracking.handleConsent}
        onDecline={tracking.handleDeclineConsent}
      />
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    trackingBanner: {
      backgroundColor: "#C2410C",
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    trackingBannerText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
    },
    legacyRecoveryBanner: {
      backgroundColor: "#FEF2F2",
      borderBottomWidth: 1,
      borderBottomColor: "#FCA5A5",
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    legacyRecoveryCopy: { flex: 1 },
    legacyRecoveryTitle: {
      color: "#991B1B",
      fontSize: 14,
      fontWeight: "800",
    },
    legacyRecoveryText: { color: "#7F1D1D", fontSize: 11, marginTop: 3 },
    legacyRecoveryButton: {
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#EF4444",
      borderRadius: 9,
      paddingHorizontal: 11,
      paddingVertical: 9,
      minWidth: 92,
      alignItems: "center",
    },
    legacyRecoveryButtonText: {
      color: "#991B1B",
      fontSize: 12,
      fontWeight: "800",
    },
    header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 16 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
    },
    headerCopy: { flex: 1 },
    headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
    headerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
    estimateButton: {
      backgroundColor: "rgba(255,255,255,0.2)",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.4)",
    },
    estimateButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    searchBox: {
      margin: 12,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
    },
    searchInput: { fontSize: 14, paddingVertical: 10 },
    filterRow: { height: 52 },
    filterContent: { paddingHorizontal: 12, gap: 8, alignItems: "flex-start" },
    filterTab: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    filterTabActive: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
    filterTabText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
    filterTabTextActive: { color: "#fff" },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingTop: 60,
    },
    retryButton: {
      marginTop: 16,
      backgroundColor: "#FF6B35",
      borderRadius: 10,
      paddingHorizontal: 24,
      paddingVertical: 10,
    },
    list: { padding: 12, gap: 10 },
    card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
    cardTracking: { borderWidth: 2 },
    cardDetails: { padding: 14, gap: 4 },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
    statusText: { fontSize: 12, fontWeight: "700" },
    requestNum: { fontSize: 12 },
    trackingIndicator: {
      color: "#FF6B35",
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 2,
    },
    customerName: { fontSize: 16, fontWeight: "700" },
    address: { fontSize: 13 },
    cardBottom: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 4,
      gap: 8,
    },
    symptom: { fontSize: 13, fontWeight: "600", flex: 1 },
    openReport: { fontSize: 12, fontWeight: "600" },
    schedLine: { fontSize: 12, marginTop: 2 },
    locationButtons: {
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
      padding: 10,
    },
    departButton: {
      backgroundColor: "#FF6B35",
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    trackingActions: { flexDirection: "row", gap: 8 },
    trackingActionGroup: { gap: 8 },
    arriveButton: {
      flex: 1,
      backgroundColor: "#22C55E",
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    cancelButton: {
      flex: 1,
      backgroundColor: "#EF4444",
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    resendSmsButton: {
      backgroundColor: "#2563EB",
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
    },
    disabledButton: { backgroundColor: "#9CA3AF" },
    locationButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    arrivedState: {
      borderTopWidth: 1,
      borderTopColor: "#BBF7D0",
      backgroundColor: "#DCFCE7",
      paddingVertical: 10,
      alignItems: "center",
    },
    arrivedStateText: { color: "#166534", fontSize: 13, fontWeight: "800" },
  });
