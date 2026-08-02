import { useState, useCallback, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, Platform, ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { LocationConsentModal } from "@/components/location-consent-modal";
import { openNavigation } from "@/lib/navigation";
import { formatFullAddress, formatNavAddress } from "@/constants/address-data";
import {
  requestLocationPermissions,
} from "@/lib/location-tracking";
import { useLocationTracking } from "@/lib/location-tracking-context";

// ─── 한국 시간(KST) 날짜 유틸 ──────────────────────────────────
function getKSTDateString(offsetDays = 0): string {
  const now = new Date();
  // KST = UTC+9
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstMs + offsetDays * 24 * 60 * 60 * 1000);
  return kstDate.toISOString().slice(0, 10);
}

// ─── 취소 상태 목록 ────────────────────────────────────────────
const CANCELLED_STATUSES = ["업무취소"];
// ─── 완료 상태 목록 ────────────────────────────────────────────
const COMPLETED_STATUSES = ["작업완료", "공사완료"];

// ─── 일정 분류 함수 ────────────────────────────────────────────
function classifyWorks(allWorks: any[]) {
  const today = getKSTDateString(0);
  const tomorrow = getKSTDateString(1);

  // 취소 제외 (isDeleted는 서버에서 이미 필터)
  const active = allWorks.filter(
    (w) => !CANCELLED_STATUSES.includes(w.status)
  );

  // 오늘 작업: scheduledDate=오늘, 취소 제외, 완료 포함
  const todayWorks = active
    .filter((w) => w.scheduledDate === today)
    .sort((a, b) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));

  // 내일 일정: scheduledDate=내일, 취소 제외
  const tomorrowWorks = active
    .filter((w) => w.scheduledDate === tomorrow && !COMPLETED_STATUSES.includes(w.status))
    .sort((a, b) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));

  // 미작업·이월: scheduledDate < 오늘 이거나 null, 완료/취소 제외
  const overdueWorks = active
    .filter((w) => {
      if (COMPLETED_STATUSES.includes(w.status)) return false;
      if (!w.scheduledDate) return true; // 일정 미정
      return w.scheduledDate < today;
    })
    .sort((a, b) => {
      // 일정 미정은 맨 뒤
      if (!a.scheduledDate && !b.scheduledDate) return 0;
      if (!a.scheduledDate) return 1;
      if (!b.scheduledDate) return -1;
      return a.scheduledDate.localeCompare(b.scheduledDate); // 오래된 것부터
    });

  // 전체: 취소 제외 전체 (완료 포함), 최신순
  const allActive = active.slice().sort((a, b) => {
    const da = a.scheduledDate ?? "";
    const db = b.scheduledDate ?? "";
    if (da !== db) return db.localeCompare(da);
    return (b.scheduledTime ?? "").localeCompare(a.scheduledTime ?? "");
  });

  return { todayWorks, tomorrowWorks, overdueWorks, allActive };
}

const STATUS_COLOR: Record<string, string> = {
  "신규접수": "#6B7280",
  "본사배정": "#6B7280",
  "지사배정": "#6B7280",
  "기사배정대기": "#F59E0B",
  "방문예정": "#3B82F6",
  "기사확인대기": "#8B5CF6",
  "기사확인완료": "#6366F1",
  "출발": "#FF6B35",
  "도착": "#F97316",
  "공사중": "#EF4444",
  "작업진행중": "#FF6B35",
  "견적승인대기": "#8B5CF6",
  "작업완료": "#22C55E",
  "공사완료": "#16A34A",
  "재방문필요": "#EF4444",
  "업무취소": "#9CA3AF",
};

type TabKey = "today" | "tomorrow" | "overdue" | "all";

export default function TechScheduleScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAppAuth();

  const technicianId = user?.technicianId;
  const userId = user?.userId;
  const today = getKSTDateString(0);

  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>((params.tab as TabKey) ?? "today");

  // 홈에서 탭 파라미터로 진입 시 탭 전환
  useEffect(() => {
    if (params.tab && ["today", "tomorrow", "overdue", "all"].includes(params.tab)) {
      setActiveTab(params.tab as TabKey);
    }
  }, [params.tab]);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingDepartRequestId, setPendingDepartRequestId] = useState<number | null>(null);
  const [isStartingTracking, setIsStartingTracking] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 전역 위치 추적 컨텍스트
  const {
    isTracking,
    trackingToken,
    trackingRequestId,
    trackingUrl,
    debugState,
    permStatus,
    startTracking,
    stopTracking,
    checkPermissions,
  } = useLocationTracking();

  // ─── 세션 기반 보안 조회 (listMySchedule) ─────────────────────
  const { data: allWorks, isLoading, error, refetch } = trpc.repair.listMySchedule.useQuery(
    { phoneNumber: user?.phoneNumber ?? undefined },
    { enabled: !!userId }
  );

  // 화면 재진입 시 자동 refetch
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        refetch();
      }
    }, [userId, refetch])
  );

  // pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // 조회된 접수건에서 기사 ID 추출
  const resolvedTechnicianId = technicianId ?? (allWorks && allWorks.length > 0 ? allWorks[0].technicianId : null);

  const consentQuery = trpc.location.getConsent.useQuery(
    { technicianId: resolvedTechnicianId ?? technicianId ?? 0 },
    { enabled: !!(resolvedTechnicianId ?? technicianId) }
  );

  const startTrackingMutation = trpc.location.startTracking.useMutation();
  const confirmJobMutation = trpc.location.confirmJobSchedule.useMutation();
  const markWorkStartedMutation = trpc.location.markWorkStarted.useMutation();
  const markWorkCompletedMutation = trpc.location.markWorkCompleted.useMutation();
  const sessionQuery = trpc.location.getSessionByRequest.useQuery(
    { requestId: trackingRequestId ?? 0 },
    { enabled: !!trackingRequestId, refetchInterval: 10000 }
  );

  // ─── 일정 분류 ────────────────────────────────────────────────
  const { todayWorks, tomorrowWorks, overdueWorks, allActive } = classifyWorks(allWorks ?? []);

  const tabData: Record<TabKey, any[]> = {
    today: todayWorks,
    tomorrow: tomorrowWorks,
    overdue: overdueWorks,
    all: allActive,
  };
  const currentWorks = tabData[activeTab];

  // ─── 일정접수 확인 ────────────────────────────────────────────
  const handleConfirmJob = async (work: any) => {
    Alert.alert(
      "일정접수 확인",
      `${work.customerName} 고객님의 일정을 확인하시겠습니까?\n\n방문일정: ${work.scheduledDate ?? "미정"} ${work.scheduledTime ?? ""}`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "확인",
          onPress: async () => {
            try {
              await confirmJobMutation.mutateAsync({ requestId: work.id });
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refetch();
              Alert.alert("확인 완료", "일정접수가 확인되었습니다.\n도착 후 '출발' 버튼을 눌러주세요.");
            } catch (e: any) {
              Alert.alert("오류", e.message || "일정 확인 중 오류가 발생했습니다.");
            }
          },
        },
      ]
    );
  };

  // ─── 공사 시작 ────────────────────────────────────────────────
  const handleWorkStarted = async (work: any) => {
    Alert.alert(
      "공사 시작",
      `${work.customerName} 고객님 댁에서 공사를 시작하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "공사 시작",
          onPress: async () => {
            try {
              await markWorkStartedMutation.mutateAsync({ requestId: work.id });
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refetch();
              Alert.alert("공사 시작", "공사가 시작되었습니다.");
            } catch (e: any) {
              Alert.alert("오류", e.message || "공사 시작 중 오류가 발생했습니다.");
            }
          },
        },
      ]
    );
  };

  // ─── 공사 완료 ────────────────────────────────────────────────
  const handleWorkCompleted = async (work: any) => {
    Alert.alert(
      "공사 완료",
      `${work.customerName} 고객님 댁에서 공사가 완료되었습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "공사 완료",
          style: "destructive",
          onPress: async () => {
            try {
              await markWorkCompletedMutation.mutateAsync({ requestId: work.id });
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refetch();
              Alert.alert("공사 완료", "공사가 완료되었습니다. 고객님께 완료 안내가 발송되었습니다.");
            } catch (e: any) {
              Alert.alert("오류", e.message || "공사 완료 중 오류가 발생했습니다.");
            }
          },
        },
      ]
    );
  };

  // ─── 출발 ─────────────────────────────────────────────────────
  const handleDepart = async (work: any) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!consentQuery.data?.hasConsented) {
      setPendingDepartRequestId(work.id);
      setShowConsentModal(true);
      return;
    }
    await doDepart(work);
  };

  const doDepart = async (work: any) => {
    setIsStartingTracking(true);
    try {
      const { granted, backgroundGranted } = await requestLocationPermissions();
      await checkPermissions();
      if (!granted && Platform.OS !== "web") {
        Alert.alert(
          "위치 권한 필요",
          "위치 공유를 위해 위치 권한이 필요합니다.\n설정 → 앱 → 퓨처에너지테크 → 위치 → 앱 사용 중 허용",
          [{ text: "확인" }]
        );
        setIsStartingTracking(false);
        return;
      }
      if (!backgroundGranted && Platform.OS !== "web") {
        Alert.alert(
          "백그라운드 위치 권한 권장",
          "화면을 끄거나 내비게이션 앱 사용 중에도 위치를 전송하려면\n위치 권한을 '항상 허용'으로 설정해 주세요.\n\n설정 → 앱 → 퓨처에너지테크 → 위치 → 항상 허용",
          [{ text: "나중에" }, { text: "설정 열기", onPress: () => Linking.openSettings() }]
        );
      }

      const destLat = work.customerLat ? Number(work.customerLat) : undefined;
      const destLng = work.customerLng ? Number(work.customerLng) : undefined;

      const result = await startTrackingMutation.mutateAsync({
        requestId: work.id,
        technicianId: (resolvedTechnicianId ?? technicianId)!,
        technicianName: user?.loginId || "기사",
        technicianPhone: user?.phoneNumber || "",
        customerName: work.customerName,
        customerPhone: work.phoneNumber,
        customerAddress: formatFullAddress(work),
        customerLat: destLat,
        customerLng: destLng,
        branchId: work.branchId ?? undefined,
        branchName: work.branchName ?? undefined,
        demoMode: false,
      });

      if (!result.success || !result.token) throw new Error("세션 시작 실패");

      const trackResult = await startTracking({
        token: result.token,
        requestId: work.id,
        trackingUrl: result.trackingUrl,
      });
      if (!trackResult.ok) {
        console.warn("[TechSchedule] 전역 추적 시작 실패:", trackResult.error);
      }

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        "출발 완료 ✅",
        result.smsSent
          ? `고객에게 위치 공유 링크 문자가 발송되었습니다.\n\n위치 공유 중 - 화면 상단에 표시됩니다.`
          : `위치 공유가 시작되었습니다.\n(SMS 미설정 - 데모 모드)`,
        [{ text: "확인" }]
      );
    } catch (e: any) {
      Alert.alert("오류", e.message || "출발 처리 중 오류가 발생했습니다.");
    } finally {
      setIsStartingTracking(false);
    }
  };

  // ─── 도착 ─────────────────────────────────────────────────────
  const handleArrive = async (work: any) => {
    if (!trackingToken || trackingRequestId !== work.id) {
      Alert.alert("알림", "이 방문 건의 위치 공유가 시작되지 않았습니다.");
      return;
    }
    Alert.alert(
      "도착 확인",
      `${work.customerName} 고객님 댁에 도착하셨나요?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "도착 완료",
          onPress: async () => {
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await stopTracking("도착완료");
            refetch();
            Alert.alert("도착 완료", "위치 공유가 종료되었습니다.\n고객용 링크가 만료됩니다.");
          },
        },
      ]
    );
  };

  // ─── 업무 취소 ────────────────────────────────────────────────
  const handleCancel = async (work: any) => {
    Alert.alert(
      "업무 취소",
      "이 방문 건을 취소하시겠습니까?\n위치 공유도 즉시 종료됩니다.",
      [
        { text: "아니오", style: "cancel" },
        {
          text: "취소 확인",
          style: "destructive",
          onPress: async () => {
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            if (trackingToken && trackingRequestId === work.id) {
              await stopTracking("업무취소");
            }
            refetch();
          },
        },
      ]
    );
  };

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${phone.replace(/[^0-9]/g, "")}`);
  };

  const handleNav = (address: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openNavigation(address);
  };

  const s = styles(colors);

  // ─── 작업 카드 렌더링 ─────────────────────────────────────────
  const renderWorkCard = (work: any) => {
    const isThisTracking = trackingRequestId === work.id && !!trackingToken;
    const isOverdue = activeTab === "overdue";
    const statusColor = STATUS_COLOR[work.status] ?? "#6B7280";

    return (
      <View
        key={work.id}
        style={[
          s.card,
          { backgroundColor: colors.surface, borderColor: isThisTracking ? "#FF6B35" : colors.border },
          isThisTracking && s.cardTracking,
        ]}
      >
        {/* 카드 헤더 */}
        <View style={s.cardHeader}>
          <View style={[s.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[s.statusText, { color: statusColor }]}>{work.status}</Text>
          </View>
          <Text style={[s.requestNum, { color: colors.muted }]}>{work.requestNumber}</Text>
        </View>

        {/* 위치 공유 중 표시 */}
        {isThisTracking && (
          <View style={s.trackingIndicator}>
            <Text style={s.trackingIndicatorText}>📍 위치 공유 중</Text>
          </View>
        )}

        {/* 미작업·이월 경고 */}
        {isOverdue && work.scheduledDate && work.scheduledDate < today && (
          <View style={s.overdueTag}>
            <Text style={s.overdueTagText}>⚠️ 이월 ({work.scheduledDate.replace(/-/g, ".")})</Text>
          </View>
        )}
        {isOverdue && !work.scheduledDate && (
          <View style={[s.overdueTag, { backgroundColor: "#FEF3C7" }]}>
            <Text style={[s.overdueTagText, { color: "#92400E" }]}>📌 일정 미정</Text>
          </View>
        )}

        {/* 방문 예정일·시간 */}
        {work.scheduledDate ? (
          <Text style={[s.time, { color: colors.foreground }]}>
            📅 {work.scheduledDate.replace(/-/g, ".")}
            {work.scheduledTime ? ` ${work.scheduledTime}` : ""}
          </Text>
        ) : (
          <Text style={[s.time, { color: colors.muted }]}>📅 방문 일정 미정</Text>
        )}

        {/* 아파트명 */}
        {work.apartmentName && (
          <Text style={[s.aptName, { color: colors.foreground }]}>🏢 {work.apartmentName}</Text>
        )}

        {/* 동·호수 */}
        <Text style={[s.address, { color: colors.muted }]}>
          {formatFullAddress(work)}
        </Text>

        {/* 고객명 */}
        <Text style={[s.customerName, { color: colors.foreground }]}>{work.customerName} 고객님</Text>

        {/* 전화번호 */}
        {work.phoneNumber ? (
          <TouchableOpacity onPress={() => handleCall(work.phoneNumber)} activeOpacity={0.7}>
            <Text style={[s.detail, { color: "#3B82F6" }]}>📞 {work.phoneNumber}</Text>
          </TouchableOpacity>
        ) : null}

        {/* 작업 내용 */}
        <Text style={[s.symptom, { color: "#FF6B35" }]}>
          {work.requestType === "배관청소" ? "🚿 배관청소" : `🔧 ${work.symptom}`}
        </Text>
        {work.detailContent ? (
          <Text style={[s.detail, { color: colors.muted }]}>📝 {work.detailContent}</Text>
        ) : null}

        {/* 고객 희망일정 vs 확정일정 */}
        {work.customerPreferredDate && (
          <Text style={[s.detail, { color: colors.muted }]}>
            🙋 고객 희망: {work.customerPreferredDate.replace(/-/g, ".")}{work.customerPreferredTime ? ` ${work.customerPreferredTime}` : ""}
          </Text>
        )}
        {work.scheduledDate && work.customerPreferredDate && work.scheduledDate !== work.customerPreferredDate && (
          <Text style={[s.detail, { color: "#22C55E" }]}>
            ✅ 확정일정: {work.scheduledDate.replace(/-/g, ".")}{work.scheduledTime ? ` ${work.scheduledTime}` : ""}
          </Text>
        )}

        {/* 견적내용 */}
        {work.estimateItems ? (
          <View style={{ marginTop: 4, padding: 8, backgroundColor: colors.background, borderRadius: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 2 }}>📋 견적내용</Text>
            <Text style={{ color: colors.foreground, fontSize: 12 }} numberOfLines={3}>{work.estimateItems}</Text>
          </View>
        ) : null}

        {/* 작업 상태별 액션 버튼 */}
        <View style={s.locationBtns}>
          {/* 기사확인대기 → 일정접수 확인 */}
          {work.status === "기사확인대기" && (
            <TouchableOpacity
              style={[s.departBtn, { backgroundColor: "#8B5CF6" }]}
              onPress={() => handleConfirmJob(work)}
              activeOpacity={0.8}
            >
              <Text style={s.departBtnText}>✅ 일정접수 확인</Text>
            </TouchableOpacity>
          )}
          {/* 도착 → 공사 시작 */}
          {work.status === "도착" && (
            <TouchableOpacity
              style={[s.departBtn, { backgroundColor: "#F97316" }]}
              onPress={() => handleWorkStarted(work)}
              activeOpacity={0.8}
            >
              <Text style={s.departBtnText}>🔧 공사 시작</Text>
            </TouchableOpacity>
          )}
          {/* 공사중 → 공사 완료 */}
          {work.status === "공사중" && (
            <TouchableOpacity
              style={[s.departBtn, { backgroundColor: "#22C55E" }]}
              onPress={() => handleWorkCompleted(work)}
              activeOpacity={0.8}
            >
              <Text style={s.departBtnText}>✅ 공사 완료</Text>
            </TouchableOpacity>
          )}
          {/* 방문예정·기사확인완료·기사배정대기·출발 등 → 출발/도착/취소 */}
          {(work.status === "방문예정" || work.status === "기사확인완료" || work.status === "기사배정대기" || work.status === "신규접수" || work.status === "출발") && (
            !isThisTracking ? (
              <TouchableOpacity
                style={[s.departBtn, isStartingTracking && s.btnDisabled]}
                onPress={() => handleDepart(work)}
                activeOpacity={0.8}
                disabled={isStartingTracking}
              >
                {isStartingTracking ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.departBtnText}>🚗 고객 집으로 출발</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={s.trackingActions}>
                <TouchableOpacity style={s.arriveBtn} onPress={() => handleArrive(work)} activeOpacity={0.8}>
                  <Text style={s.arriveBtnText}>📍 도착</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(work)} activeOpacity={0.8}>
                  <Text style={s.cancelBtnText}>❌ 취소</Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </View>

        {/* 하단 액션 버튼 */}
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: "#3B82F6" }]}
            onPress={() => handleCall(work.phoneNumber)}
            activeOpacity={0.8}
          >
            <Text style={s.actionBtnText}>📞 고객 전화</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: "#22C55E" }]}
            onPress={() => handleNav(formatNavAddress(work))}
            activeOpacity={0.8}
          >
            <Text style={s.actionBtnText}>🗺 길찾기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: "#FF6B35" }]}
            onPress={() => router.push(`/work-report?id=${work.id}` as any)}
            activeOpacity={0.8}
          >
            <Text style={s.actionBtnText}>📋 작업 상세</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── 로그인 안 된 경우 ────────────────────────────────────────
  if (!userId) {
    return (
      <ScreenContainer className="p-6">
        <Text style={[styles(colors).empty, { color: colors.muted }]}>기사 계정으로 로그인해주세요.</Text>
      </ScreenContainer>
    );
  }

  // ─── 탭 정의 ─────────────────────────────────────────────────
  const tabs: { key: TabKey; label: string; count: number; color: string }[] = [
    { key: "today", label: "오늘", count: todayWorks.length, color: "#FF6B35" },
    { key: "tomorrow", label: "내일", count: tomorrowWorks.length, color: "#3B82F6" },
    { key: "overdue", label: "미작업·이월", count: overdueWorks.length, color: "#EF4444" },
    { key: "all", label: "전체", count: allActive.length, color: "#6B7280" },
  ];

  return (
    <ScreenContainer>
      {/* 위치 공유 중 배너 */}
      {trackingToken && (
        <TouchableOpacity
          style={s.trackingBanner}
          onPress={() => setShowDebug((v) => !v)}
          activeOpacity={0.85}
        >
          <Text style={s.trackingBannerIcon}>📍</Text>
          <View style={s.trackingBannerText}>
            <Text style={s.trackingBannerTitle}>
              위치 공유 중 {debugState?.serverOk === true ? "✅" : debugState?.serverOk === false ? "⚠️" : ""}
            </Text>
            <Text style={s.trackingBannerSub}>
              {debugState?.lastSuccessAt
                ? `마지막 전송: ${Math.round((Date.now() - debugState.lastSuccessAt) / 1000)}초 전 · ${debugState.sendCount}회`
                : "전송 대기 중..."}
            </Text>
          </View>
          <Text style={{ color: "#fff", fontSize: 11 }}>{showDebug ? "▲" : "▼"}</Text>
        </TouchableOpacity>
      )}

      {/* GPS 디버그 패널 */}
      {trackingToken && showDebug && (
        <View style={s.debugPanel}>
          <Text style={s.debugTitle}>📡 GPS 디버그</Text>
          <Text style={s.debugRow}>위도: {debugState?.lat?.toFixed(6) ?? "-"}</Text>
          <Text style={s.debugRow}>경도: {debugState?.lng?.toFixed(6) ?? "-"}</Text>
          <Text style={s.debugRow}>정확도: {debugState?.accuracy != null ? `${Math.round(debugState.accuracy)}m` : "-"}</Text>
          <Text style={s.debugRow}>속도: {debugState?.speed != null ? `${(debugState.speed * 3.6).toFixed(1)} km/h` : "-"}</Text>
          <Text style={s.debugRow}>전송 횟수: {debugState?.sendCount ?? 0}회</Text>
          <Text style={[s.debugRow, { color: debugState?.serverOk === true ? "#22C55E" : debugState?.serverOk === false ? "#EF4444" : "#9BA1A6" }]}>
            서버 응답: {debugState?.serverOk === true ? "✅ 성공" : debugState?.serverOk === false ? `❌ ${debugState?.serverError}` : "대기"}
          </Text>
          <Text style={s.debugRow}>포그라운드 권한: {permStatus.fg}</Text>
          <Text style={s.debugRow}>백그라운드 권한: {permStatus.bg}</Text>
        </View>
      )}

      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>작업 일정</Text>
        <Text style={s.headerDate}>{today.replace(/-/g, ".")}</Text>
      </View>

      {/* 탭 바 */}
      <View style={s.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tabItem, activeTab === tab.key && { borderBottomColor: tab.color, borderBottomWidth: 2.5 }]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab.key);
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.tabLabel, { color: activeTab === tab.key ? tab.color : colors.muted }]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[s.tabBadge, { backgroundColor: tab.color }]}>
                <Text style={s.tabBadgeText}>{tab.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* 콘텐츠 */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color="#FF6B35" size="large" />
          <Text style={[s.empty, { color: colors.muted, marginTop: 12 }]}>일정을 불러오는 중...</Text>
        </View>
      ) : error ? (
        // 오류 표시 - 빈 배열로 숨기지 않음
        <View style={s.center}>
          <Text style={s.emptyIcon}>⚠️</Text>
          <Text style={[s.empty, { color: "#EF4444" }]}>일정을 불러오지 못했습니다.</Text>
          <Text style={[s.errorDetail, { color: colors.muted }]}>
            {(error as any)?.message || "서버 연결을 확인해주세요."}
          </Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : currentWorks.length === 0 ? (
        <ScrollView
          contentContainerStyle={s.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF6B35" />}
        >
          <Text style={s.emptyIcon}>
            {activeTab === "today" ? "☀️" : activeTab === "tomorrow" ? "🌅" : activeTab === "overdue" ? "✅" : "📋"}
          </Text>
          <Text style={[s.empty, { color: colors.muted }]}>
            {activeTab === "today" ? "오늘 배정된 작업이 없습니다." :
             activeTab === "tomorrow" ? "내일 예정된 일정이 없습니다." :
             activeTab === "overdue" ? "미작업·이월 건이 없습니다." :
             "배정된 작업이 없습니다."}
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF6B35" />}
        >
          {currentWorks.map((work) => renderWorkCard(work))}
        </ScrollView>
      )}

      {/* 위치 동의 모달 */}
      <LocationConsentModal
        visible={showConsentModal}
        onConsent={async () => {
          setShowConsentModal(false);
          const effectiveTechId = resolvedTechnicianId ?? technicianId;
          if (effectiveTechId) {
            try {
              await fetch("/api/trpc/location.saveConsent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ json: { technicianId: effectiveTechId } }),
              });
              consentQuery.refetch();
            } catch {}
          }
          if (pendingDepartRequestId !== null) {
            const work = currentWorks.find((w) => w.id === pendingDepartRequestId);
            if (work) await doDepart(work);
            setPendingDepartRequestId(null);
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
  header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerDate: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  // 탭 바
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 12, fontWeight: "700" },
  tabBadge: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: "center" },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  // 콘텐츠
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyContainer: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  emptyIcon: { fontSize: 48 },
  empty: { fontSize: 16, textAlign: "center" },
  errorDetail: { fontSize: 13, textAlign: "center", marginTop: 4 },
  retryBtn: { marginTop: 12, backgroundColor: "#FF6B35", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  list: { padding: 16, gap: 12 },
  // 카드
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 6 },
  cardTracking: { borderWidth: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  requestNum: { fontSize: 12 },
  overdueTag: {
    backgroundColor: "#FEE2E2",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  overdueTagText: { color: "#991B1B", fontSize: 11, fontWeight: "700" },
  time: { fontSize: 14, fontWeight: "600" },
  aptName: { fontSize: 15, fontWeight: "700" },
  customerName: { fontSize: 18, fontWeight: "700" },
  address: { fontSize: 14 },
  symptom: { fontSize: 14, fontWeight: "600" },
  detail: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  // 위치 추적 배너
  trackingBanner: {
    backgroundColor: "#FF6B35",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  trackingBannerIcon: { fontSize: 20 },
  trackingBannerText: { flex: 1 },
  trackingBannerTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  trackingBannerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  // 카드 내 위치 공유 표시
  trackingIndicator: {
    backgroundColor: "#FFF3E0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  trackingIndicatorText: { color: "#FF6B35", fontSize: 12, fontWeight: "700" },
  // 출발/도착/취소 버튼
  locationBtns: { marginTop: 10 },
  departBtn: {
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  departBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  btnDisabled: { backgroundColor: "#D1D5DB" },
  trackingActions: { flexDirection: "row", gap: 10 },
  arriveBtn: {
    flex: 1,
    backgroundColor: "#22C55E",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  arriveBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#EF4444",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  // GPS 디버그 패널
  debugPanel: {
    backgroundColor: "#1a1a2e",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  debugTitle: { color: "#FF6B35", fontSize: 13, fontWeight: "800", marginBottom: 4 },
  debugRow: { color: "#9BA1A6", fontSize: 12 },
});
