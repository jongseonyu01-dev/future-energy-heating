import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, Platform, ActivityIndicator, Alert, AppState,
} from "react-native";
import { useRouter } from "expo-router";
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
  startLocationTracking,
  stopLocationTracking,
  isTrackingActive,
  getActiveTrackingToken,
  getCurrentLocation,
  sendLocationToServer,
  notifySessionStop,
} from "@/lib/location-tracking";

const STATUS_COLOR: Record<string, string> = {
  "신규접수": "#6B7280",
  "기사배정대기": "#F59E0B",
  "방문예정": "#3B82F6",
  "작업진행중": "#FF6B35",
  "견적승인대기": "#8B5CF6",
  "작업완료": "#22C55E",
  "재방문필요": "#EF4444",
};

export default function TechScheduleScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAppAuth();

  const technicianId = user?.technicianId;
  const today = new Date().toISOString().slice(0, 10);

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingDepartRequestId, setPendingDepartRequestId] = useState<number | null>(null);
  const [trackingRequestId, setTrackingRequestId] = useState<number | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [isStartingTracking, setIsStartingTracking] = useState(false);
  const fgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: allWorks, isLoading, refetch } = trpc.repair.listByTechnician.useQuery(
    { technicianId: technicianId ?? 0 },
    { enabled: !!technicianId }
  );

  const consentQuery = trpc.location.getConsent.useQuery(
    { technicianId: technicianId ?? 0 },
    { enabled: !!technicianId }
  );

  const startTrackingMutation = trpc.location.startTracking.useMutation();
  const sessionQuery = trpc.location.getSessionByRequest.useQuery(
    { requestId: trackingRequestId ?? 0 },
    { enabled: !!trackingRequestId, refetchInterval: 10000 }
  );

  // 앱 시작 시 이전에 추적 중이던 세션 복구 (안전 모드: 위치 권한 요청 없이 상태만 복구)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await isTrackingActive();
        const token = await getActiveTrackingToken();
        if (!cancelled && active && token) {
          // 위치 권한 요청 없이 상태만 복구 (인터벌은 시작하지 않음)
          setTrackingToken(token);
          // 포그라운드 인터벌은 출발 버튼 클릭 시에만 시작
          // 앱 재시작 후에는 기사가 직접 재출발 버튼을 눌러야 함
        }
      } catch (e) {
        // AsyncStorage 오류 무시 - 앱 크래시 방지
        console.warn('[TechSchedule] 추적 상태 복구 실패 (무시):', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 포그라운드 위치 전송 인터벌 (앱 켜진 상태 폴백)
  const startForegroundInterval = useCallback((token: string) => {
    if (fgIntervalRef.current) clearInterval(fgIntervalRef.current);
    fgIntervalRef.current = setInterval(async () => {
      const loc = await getCurrentLocation();
      if (loc) await sendLocationToServer(token, loc.lat, loc.lng);
    }, 30000);
  }, []);

  const stopForegroundInterval = useCallback(() => {
    if (fgIntervalRef.current) {
      clearInterval(fgIntervalRef.current);
      fgIntervalRef.current = null;
    }
  }, []);

  // 출발 버튼 처리
  const handleDepart = async (work: any) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // 동의 여부 확인
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
      // 위치 권한 요청
      const { granted } = await requestLocationPermissions();
      if (!granted) {
        Alert.alert(
          "위치 권한 필요",
          "위치 공유를 위해 위치 권한이 필요합니다. 설정에서 허용해 주세요.",
          [{ text: "확인" }]
        );
        setIsStartingTracking(false);
        return;
      }

      // 서버에 세션 시작 요청
      const result = await startTrackingMutation.mutateAsync({
        requestId: work.id,
        technicianId: technicianId!,
        technicianName: user?.loginId || "기사",
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

      if (!result.success || !result.token) throw new Error("세션 시작 실패");

      // 로컬 추적 시작
      await startLocationTracking(result.token);
      setTrackingToken(result.token);
      setTrackingRequestId(work.id);
      setTrackingUrl(result.trackingUrl);
      startForegroundInterval(result.token);

      // 즉시 현재 위치 전송
      const loc = await getCurrentLocation();
      if (loc) await sendLocationToServer(result.token, loc.lat, loc.lng);

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

  // 도착 버튼 처리
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
            await notifySessionStop(trackingToken, "도착완료");
            await stopLocationTracking();
            stopForegroundInterval();
            setTrackingToken(null);
            setTrackingRequestId(null);
            setTrackingUrl(null);
            refetch();
            Alert.alert("도착 완료", "위치 공유가 종료되었습니다.\n고객용 링크가 만료됩니다.");
          },
        },
      ]
    );
  };

  // 업무 취소 버튼 처리
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
              await notifySessionStop(trackingToken, "업무취소");
              await stopLocationTracking();
              stopForegroundInterval();
              setTrackingToken(null);
              setTrackingRequestId(null);
              setTrackingUrl(null);
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

  // 오늘 방문 예정 필터
  const todayWorks = (allWorks ?? []).filter(
    (w) => w.scheduledDate === today && w.status !== "작업완료"
  );
  // 미래 예정 일정 (오늘 이후, 작업완료 제외)
  const upcomingWorks = (allWorks ?? []).filter(
    (w) => w.scheduledDate && w.scheduledDate > today && w.status !== "작업완료"
  );
  // 날짜 미지정이지만 배정된 오더 (신규접수·작업완료 제외)
  const unscheduledWorks = (allWorks ?? []).filter(
    (w) => !w.scheduledDate && w.status !== "작업완료" && w.status !== "신규접수"
  );

  // 오더 카드 렌더링 함수
  const renderWorkCard = (work: any) => {
    const isThisTracking = trackingRequestId === work.id && !!trackingToken;
    return (
      <View key={work.id} style={[s.card, { backgroundColor: colors.surface, borderColor: isThisTracking ? "#FF6B35" : colors.border }, isThisTracking && s.cardTracking]}>
        <View style={s.cardHeader}>
          <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[work.status] + "20" }]}>
            <Text style={[s.statusText, { color: STATUS_COLOR[work.status] }]}>{work.status}</Text>
          </View>
          <Text style={[s.requestNum, { color: colors.muted }]}>{work.requestNumber}</Text>
        </View>

        {isThisTracking && (
          <View style={s.trackingIndicator}>
            <Text style={s.trackingIndicatorText}>📍 위치 공유 중</Text>
          </View>
        )}

        <Text style={[s.customerName, { color: colors.foreground }]}>{work.customerName} 고객님</Text>
        <Text style={[s.address, { color: colors.muted }]}>
          {formatFullAddress(work)}
        </Text>
        <Text style={[s.symptom, { color: "#FF6B35" }]}>
          {work.requestType === "배관청소" ? "🚿 배관청소" : `🔧 ${work.symptom}`}
        </Text>

        {work.scheduledDate && (
          <Text style={[s.time, { color: colors.foreground }]}>
            📅 {work.scheduledDate.replace(/-/g, ".")}
            {work.scheduledTime ? ` ${work.scheduledTime}` : ""}
          </Text>
        )}

        {!work.scheduledDate && (
          <Text style={[s.time, { color: colors.muted }]}>📅 방문 일정 미정</Text>
        )}

        {work.detailContent ? (
          <Text style={[s.detail, { color: colors.muted }]} numberOfLines={2}>{work.detailContent}</Text>
        ) : null}

        {/* 위치 공유 링크 표시 */}
        {isThisTracking && trackingUrl && (
          <TouchableOpacity
            style={s.trackingLinkBox}
            onPress={() => Linking.openURL(trackingUrl)}
            activeOpacity={0.8}
          >
            <Text style={s.trackingLinkText}>🔗 고객 위치 확인 링크 보기</Text>
          </TouchableOpacity>
        )}

        {/* 출발/도착/취소 버튼 */}
        <View style={s.locationBtns}>
          {!isThisTracking ? (
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
              <TouchableOpacity
                style={s.arriveBtn}
                onPress={() => handleArrive(work)}
                activeOpacity={0.8}
              >
                <Text style={s.arriveBtnText}>✅ 도착</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => handleCancel(work)}
                activeOpacity={0.8}
              >
                <Text style={s.cancelBtnText}>❌ 업무 취소</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 기존 액션 버튼 */}
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
            <Text style={s.actionBtnText}>🗺 내비게이션</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: "#FF6B35" }]}
            onPress={() => router.push(`/work-report?id=${work.id}` as any)}
            activeOpacity={0.8}
          >
            <Text style={s.actionBtnText}>📋 점검표</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (!technicianId) {
    return (
      <ScreenContainer className="p-6">
        <Text style={[s.empty, { color: colors.muted }]}>기사 계정으로 로그인해주세요.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* 위치 공유 중 배너 */}
      {trackingToken && (
        <View style={s.trackingBanner}>
          <Text style={s.trackingBannerIcon}>📍</Text>
          <View style={s.trackingBannerText}>
            <Text style={s.trackingBannerTitle}>위치 공유 중</Text>
            <Text style={s.trackingBannerSub}>고객에게 실시간 위치가 전송되고 있습니다</Text>
          </View>
          <View style={s.trackingDot} />
        </View>
      )}

      <View style={s.header}>
        <Text style={s.headerTitle}>방문 일정</Text>
        <Text style={s.headerDate}>{today.replace(/-/g, ".")}</Text>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color="#FF6B35" size="large" />
        </View>
      ) : todayWorks.length === 0 && upcomingWorks.length === 0 && unscheduledWorks.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>📅</Text>
          <Text style={[s.empty, { color: colors.muted }]}>배정된 방문 일정이 없습니다.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {/* 오늘 일정 섹션 */}
          {todayWorks.length > 0 && (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>📅 오늘 방문 일정</Text>
              <Text style={[s.sectionCount, { color: colors.muted }]}>{todayWorks.length}건</Text>
            </View>
          )}
          {todayWorks.map((work) => renderWorkCard(work))}

          {/* 예정 일정 섹션 */}
          {upcomingWorks.length > 0 && (
            <View style={[s.sectionHeader, todayWorks.length > 0 && { marginTop: 8 }]}>
              <Text style={s.sectionTitle}>🗓 예정 일정</Text>
              <Text style={[s.sectionCount, { color: colors.muted }]}>{upcomingWorks.length}건</Text>
            </View>
          )}
          {upcomingWorks.map((work) => renderWorkCard(work))}

          {/* 날짜 미지정 배정 오더 섹션 */}
          {unscheduledWorks.length > 0 && (
            <View style={[s.sectionHeader, (todayWorks.length > 0 || upcomingWorks.length > 0) && { marginTop: 8 }]}>
              <Text style={s.sectionTitle}>⏳ 일정 미확정</Text>
              <Text style={[s.sectionCount, { color: colors.muted }]}>{unscheduledWorks.length}건</Text>
            </View>
          )}
          {unscheduledWorks.map((work) => renderWorkCard(work))}
        </ScrollView>
      )}

      {/* 위치 동의 모달 */}
      <LocationConsentModal
        visible={showConsentModal}
        onConsent={async () => {
          setShowConsentModal(false);
          // 동의 저장
          if (technicianId) {
            try {
              await fetch("/api/trpc/location.saveConsent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ json: { technicianId } }),
              });
              consentQuery.refetch();
            } catch {}
          }
          // 대기 중인 방문 건 출발 처리
          if (pendingDepartRequestId !== null) {
            const allDisplayWorks = [...todayWorks, ...upcomingWorks, ...unscheduledWorks];
            const work = allDisplayWorks.find((w) => w.id === pendingDepartRequestId);
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
  header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerDate: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyIcon: { fontSize: 48 },
  empty: { fontSize: 16, textAlign: "center" },
  list: { padding: 16, gap: 12 },
  // 섹션 헤더
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#374151" },
  sectionCount: { fontSize: 13, fontWeight: "600" },
  // 카드
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 6 },
  cardTracking: { borderWidth: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  requestNum: { fontSize: 12 },
  customerName: { fontSize: 18, fontWeight: "700" },
  address: { fontSize: 14 },
  symptom: { fontSize: 14, fontWeight: "600" },
  time: { fontSize: 14, fontWeight: "600" },
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
  trackingDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#fff",
    shadowColor: "#fff",
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  // 카드 내 위치 공유 표시
  trackingIndicator: {
    backgroundColor: "#FFF3E0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  trackingIndicatorText: { color: "#FF6B35", fontSize: 12, fontWeight: "700" },
  trackingLinkBox: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginTop: 4,
  },
  trackingLinkText: { color: "#3B82F6", fontSize: 13, fontWeight: "600" },
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
});
