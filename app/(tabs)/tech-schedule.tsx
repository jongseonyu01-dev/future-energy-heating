import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, Platform, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { LocationConsentModal } from "@/components/location-consent-modal";
import { openNavigation } from "@/lib/navigation";
import { formatFullAddress, formatNavAddress } from "@/constants/address-data";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import {
  DEPARTABLE_VISIT_STATUSES,
  useTechnicianVisitTracking,
} from "@/components/technician-visit-tracking";

const STATUS_COLOR: Record<string, string> = {
  "신규접수": "#6B7280",
  "기사배정대기": "#F59E0B",
  "방문예정": "#3B82F6",
  "기사확인대기": "#8B5CF6",
  "기사확인완료": "#2563EB",
  "기사일정확인": "#2563EB",
  "출발": "#FF6B35",
  "도착": "#16A34A",
  "공사중": "#F59E0B",
  "작업진행중": "#FF6B35",
  "견적승인대기": "#8B5CF6",
  "작업완료": "#22C55E",
  "공사완료": "#22C55E",
  "재방문필요": "#EF4444",
};

type ScheduleTab = "today" | "tomorrow" | "overdue" | "all";

interface TechScheduleScreenProps {
  defaultTab?: ScheduleTab;
}

function isScheduleTab(value: string | undefined): value is ScheduleTab {
  return value === "today" || value === "tomorrow" || value === "overdue" || value === "all";
}

export function TechScheduleScreen({ defaultTab = "today" }: TechScheduleScreenProps) {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAppAuth();

  const technicianId = user?.technicianId;
  const userId = user?.userId;
  // KST(Asia/Seoul) 기준 날짜 계산 - UTC+9 고정 (getTimezoneOffset 사용 금지)
  const getKSTDate = (offsetDays = 0) => {
    const now = new Date();
    const kstMs = now.getTime() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000;
    const d = new Date(kstMs);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  };
  const today = getKSTDate(0);
  const tomorrow = getKSTDate(1);

  // URL 파라미터로 초기 탭 설정 (홈 화면 버튼 연동)
  const params = useLocalSearchParams<{ tab?: string }>();
  const [showDebug, setShowDebug] = useState(false);
  const requestedTab = isScheduleTab(params.tab) ? params.tab : undefined;
  const [activeTab, setActiveTab] = useState<ScheduleTab>(requestedTab ?? defaultTab);
  // 유량 이상 상태 맵 (전화번호 → 알림 데이터)
  const [flowAlertMap, setFlowAlertMap] = useState<Record<string, any>>({});

  // 세션 기반 내 일정 조회 (서버에서 기사 ID 자동 판별)
  const { data: allWorks, isLoading, isError, error: scheduleError, refetch } = trpc.repair.listMySchedule.useQuery(
    undefined,
    { enabled: !!userId, retry: 1 }
  );
  // resolvedTechnicianId: 위치추적 등 기존 기능 호환용
  const resolvedTechnicianId = technicianId ?? (allWorks && allWorks.length > 0 ? allWorks[0].technicianId : null);

  const {
    trackingToken,
    trackingRequestId,
    debugState,
    permStatus,
    showConsentModal,
    handleConsent,
    handleDeclineConsent,
    handleDepart,
    handleArrive,
    handleStopSharing,
    handleResendTrackingSms,
    handleStopLegacyTracking,
    hasUnmatchedLegacyTracking,
    isLegacyStopPending,
    isConsentLoading,
    isStartingAny,
    isStartingRequest,
    isArrivingRequest,
    isResendingRequest,
  } = useTechnicianVisitTracking({
    works: allWorks ?? [],
    technicianId: resolvedTechnicianId,
    workListReady: !isLoading,
    refetch,
  });

  // 화면 진입 시 자동 재조회 (기사배정 후 즉시 반영)
  useFocusEffect(
    useCallback(() => {
      refetch();
      setActiveTab(requestedTab ?? defaultTab);
    }, [defaultTab, refetch, requestedTab])
  );

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${phone.replace(/[^0-9]/g, "")}`);
  };

  const handleNav = (address: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openNavigation(address);
  };

  const s = styles(colors);

  // 유량 이상 상태 일괄 조회 (배정된 오더의 고객 전화번호 기준)
  useEffect(() => {
    const works = allWorks ?? [];
    if (works.length === 0) return;
    const phones = [...new Set(works.map((w: any) => w.phoneNumber).filter(Boolean))];
    if (phones.length === 0) return;
    // 각 전화번호별로 유량 이상 상태 조회
    Promise.all(
      (phones as string[]).map(async (phone: string) => {
        const token = await Auth.getSessionToken();
        return fetch(`${getApiBaseUrl()}/api/trpc/flowRate.getAlertByPhone?input=${encodeURIComponent(JSON.stringify({ json: { phone } }))}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((r) => r.json())
          .then((data) => ({ phone, result: data?.result?.data?.json ?? null }))
          .catch(() => ({ phone, result: null }));
      })
    ).then((results) => {
      const map: Record<string, any> = {};
      results.forEach(({ phone, result }) => {
        if (result && result.isAlert) map[phone] = result;
      });
      setFlowAlertMap(map);
    });
  }, [allWorks]);

  const COMPLETED_STATUSES = ["작업완료", "공사완료"];
  // 오늘 작업: 방문예정일=오늘, 취소 제외, 완료 포함
  const todayWorks = (allWorks ?? []).filter(
    (w: any) => w.scheduledDate === today
  );
  // 내일 일정: 방문예정일=내일, 완료/취소 제외
  const tomorrowWorks = (allWorks ?? []).filter(
    (w: any) => w.scheduledDate === tomorrow && !COMPLETED_STATUSES.includes(w.status)
  ).sort((a: any, b: any) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));
  // 미작업·이월: 방문예정일<오늘 또는 null, 완료/취소 제외
  const overdueWorks = (allWorks ?? []).filter(
    (w: any) => (!w.scheduledDate || w.scheduledDate < today) && !COMPLETED_STATUSES.includes(w.status)
  ).sort((a: any, b: any) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""));
  // 전체: 완료/취소 제외
  const allActiveWorks = (allWorks ?? []).filter(
    (w: any) => !COMPLETED_STATUSES.includes(w.status)
  );
  // 탭 정의
  const tabs = [
    { key: "today" as const, label: "오늘", count: todayWorks.length, color: "#FF6B35" },
    { key: "tomorrow" as const, label: "내일", count: tomorrowWorks.length, color: "#3B82F6" },
    { key: "overdue" as const, label: "미작업·이월", count: overdueWorks.length, color: "#EF4444" },
    { key: "all" as const, label: "전체", count: allActiveWorks.length, color: "#6B7280" },
  ];
  const currentWorks = activeTab === "today" ? todayWorks
    : activeTab === "tomorrow" ? tomorrowWorks
    : activeTab === "overdue" ? overdueWorks
    : allActiveWorks;

  // 오더 카드 렌더링 함수
  const renderWorkCard = (work: any) => {
    const statusColor = STATUS_COLOR[work.status] ?? "#6B7280";
    const isThisTracking = trackingRequestId === work.id && !!trackingToken;
    const canDepart = DEPARTABLE_VISIT_STATUSES.has(work.status);
    const isStartingTracking = isStartingRequest(work.id);
    const isArriving = isArrivingRequest(work.id);
    const isResending = isResendingRequest(work.id);
    const isAnotherVisitTracking = !!trackingToken && trackingRequestId !== work.id;
    return (
      <View key={work.id} style={[s.card, { backgroundColor: colors.surface, borderColor: isThisTracking ? "#FF6B35" : colors.border }, isThisTracking && s.cardTracking]}>
        <View style={s.cardHeader}>
          <View style={[s.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[s.statusText, { color: statusColor }]}>{work.status}</Text>
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

        {/* 유량 이상 배지 */}
        {flowAlertMap[work.phoneNumber] && (
          <View style={s.flowAlertBadge}>
            <Text style={s.flowAlertBadgeText}>
              {flowAlertMap[work.phoneNumber].alertType === "저유량"
                ? "⚠️ 저유량 이상 감지"
                : flowAlertMap[work.phoneNumber].alertType === "고유량"
                ? "🔴 고유량 이상 감지"
                : flowAlertMap[work.phoneNumber].alertType === "통신두절"
                ? "📵 센서 통신두절"
                : "⚠️ 유량 이상 감지"}
            </Text>
            {flowAlertMap[work.phoneNumber].lastFlowRateLpm != null && (
              <Text style={s.flowAlertDetail}>
                현재 {parseFloat(flowAlertMap[work.phoneNumber].lastFlowRateLpm).toFixed(1)} L/min
                {flowAlertMap[work.phoneNumber].lowerLimitLpm != null
                  ? ` (기준 ${parseFloat(flowAlertMap[work.phoneNumber].lowerLimitLpm).toFixed(1)}~${parseFloat(flowAlertMap[work.phoneNumber].upperLimitLpm ?? 0).toFixed(1)})`
                  : ""}
              </Text>
            )}
          </View>
        )}

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

        {/* 위치 전송 상태 카드 (기사 전용 — 고객용 화면 아님) */}
        {isThisTracking && (
          <View style={s.locationStatusCard}>
            <Text style={s.locationStatusTitle}>📡 위치 전송 상태</Text>
            <View style={s.locationStatusRow}>
              <Text style={s.locationStatusLabel}>전송 상태</Text>
              <Text style={[s.locationStatusValue, { color: debugState?.serverOk === true ? '#22C55E' : debugState?.serverOk === false ? '#EF4444' : '#F59E0B' }]}>
                {debugState?.serverOk === true ? '✅ 서버 전송 성공' : debugState?.serverOk === false ? '❌ 전송 실패' : '⏳ 전송 대기 중'}
              </Text>
            </View>
            <View style={s.locationStatusRow}>
              <Text style={s.locationStatusLabel}>마지막 전송</Text>
              <Text style={s.locationStatusValue}>
                {debugState?.lastSuccessAt
                  ? `${Math.round((Date.now() - debugState.lastSuccessAt) / 1000)}초 전 (${new Date(debugState.lastSuccessAt).toLocaleTimeString('ko-KR')})`
                  : '아직 전송 없음'}
              </Text>
            </View>
            <View style={s.locationStatusRow}>
              <Text style={s.locationStatusLabel}>전송 횟수</Text>
              <Text style={s.locationStatusValue}>{debugState?.sendCount ?? 0}회</Text>
            </View>
            <View style={s.locationStatusRow}>
              <Text style={s.locationStatusLabel}>현재 좌표</Text>
              <Text style={s.locationStatusValue}>
                {debugState?.lat != null ? `${debugState.lat.toFixed(5)}, ${debugState.lng?.toFixed(5)}` : '위치 수신 중...'}
              </Text>
            </View>
            <View style={s.locationStatusRow}>
              <Text style={s.locationStatusLabel}>속도</Text>
              <Text style={s.locationStatusValue}>
                {debugState?.speed != null ? `${(debugState.speed * 3.6).toFixed(1)} km/h` : '-'}
              </Text>
            </View>
            <View style={s.locationStatusRow}>
              <Text style={s.locationStatusLabel}>위치 권한</Text>
              <Text style={s.locationStatusValue}>{permStatus.bg}</Text>
            </View>
            <Text style={s.locationStatusNote}>💡 고객은 문자로 받은 링크에서 위치를 확인합니다</Text>
          </View>
        )}

        {/* 출발/도착/취소 버튼 */}
        {!isThisTracking && work.status === "도착" ? (
          <View style={s.arrivedState}>
            <Text style={s.arrivedStateText}>✅ 도착 완료</Text>
          </View>
        ) : (isThisTracking || canDepart) && (
          <View style={s.locationBtns}>
            {isThisTracking ? (
              <View style={s.trackingActionGroup}>
                <View style={s.trackingActions}>
                  <TouchableOpacity
                    style={s.arriveBtn}
                    onPress={() => handleArrive(work)}
                    activeOpacity={0.8}
                    disabled={isArriving || isResending}
                  >
                    {isArriving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.arriveBtnText}>✅ 도착</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.cancelBtn, (isArriving || isResending) && s.btnDisabled]}
                    onPress={() => handleStopSharing(work)}
                    disabled={isArriving || isResending}
                    activeOpacity={0.8}
                  >
                    <Text style={s.cancelBtnText}>⏹ 위치 공유 종료</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[s.resendSmsBtn, (isArriving || isResending) && s.btnDisabled]}
                  onPress={() => handleResendTrackingSms(work)}
                  disabled={isArriving || isResending}
                  activeOpacity={0.8}
                >
                  {isResending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.resendSmsBtnText}>📨 고객 위치링크 재발송</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.departBtn, (isStartingAny || isAnotherVisitTracking || isConsentLoading) && s.btnDisabled]}
                onPress={() => handleDepart(work)}
                activeOpacity={0.8}
                disabled={isStartingAny || isAnotherVisitTracking || isConsentLoading}
              >
                {isStartingTracking ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.departBtnText}>
                    {isAnotherVisitTracking
                      ? "📍 다른 방문 위치 공유 중"
                      : isConsentLoading
                        ? "⏳ 위치 동의 확인 중"
                      : work.status === "출발"
                        ? "🚗 위치 공유 다시 연결"
                        : "🚗 고객 집으로 출발"}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

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

  if (!technicianId && !userId) {
    return (
      <ScreenContainer className="p-6">
        <Text style={[s.empty, { color: colors.muted }]}>기사 계정으로 로그인해주세요.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {hasUnmatchedLegacyTracking && (
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
              isLegacyStopPending && s.btnDisabled,
            ]}
            onPress={handleStopLegacyTracking}
            disabled={isLegacyStopPending}
            activeOpacity={0.8}
          >
            {isLegacyStopPending ? (
              <ActivityIndicator color="#991B1B" size="small" />
            ) : (
              <Text style={s.legacyRecoveryButtonText}>이전 공유 종료</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 위치 공유 중 배너 */}
      {trackingToken && !hasUnmatchedLegacyTracking && (
        <TouchableOpacity
          style={s.trackingBanner}
          onPress={() => setShowDebug((v) => !v)}
          activeOpacity={0.85}
        >
          <Text style={s.trackingBannerIcon}>📍</Text>
          <View style={s.trackingBannerText}>
            <Text style={s.trackingBannerTitle}>위치 공유 중 {debugState?.serverOk === true ? '✅' : debugState?.serverOk === false ? '⚠️' : ''}</Text>
            <Text style={s.trackingBannerSub}>
              {debugState?.lastSuccessAt
                ? `마지막 전송: ${Math.round((Date.now() - debugState.lastSuccessAt) / 1000)}초 전 · ${debugState.sendCount}회`
                : '전송 대기 중...'}
            </Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 11 }}>{showDebug ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      )}

      {/* GPS 디버그 패널 */}
      {trackingToken && !hasUnmatchedLegacyTracking && showDebug && (
        <View style={s.debugPanel}>
          <Text style={s.debugTitle}>📡 GPS 디버그</Text>
          <Text style={s.debugRow}>위도: {debugState?.lat?.toFixed(6) ?? '-'}</Text>
          <Text style={s.debugRow}>경도: {debugState?.lng?.toFixed(6) ?? '-'}</Text>
          <Text style={s.debugRow}>정확도: {debugState?.accuracy != null ? `${Math.round(debugState.accuracy)}m` : '-'}</Text>
          <Text style={s.debugRow}>속도: {debugState?.speed != null ? `${(debugState.speed * 3.6).toFixed(1)} km/h` : '-'}</Text>
          <Text style={s.debugRow}>방향: {debugState?.heading != null ? `${Math.round(debugState.heading)}°` : '-'}</Text>
          <Text style={s.debugRow}>전송 횟수: {debugState?.sendCount ?? 0}회</Text>
          <Text style={s.debugRow}>전송 소스: {debugState?.source || '-'}</Text>
          <Text style={[s.debugRow, { color: debugState?.serverOk === true ? '#22C55E' : debugState?.serverOk === false ? '#EF4444' : '#9BA1A6' }]}>
            서버 응답: {debugState?.serverOk === true ? '✅ 성공' : debugState?.serverOk === false ? `❌ ${debugState?.serverError}` : '대기'}
          </Text>
          <Text style={s.debugRow}>
            마지막 성공: {debugState?.lastSuccessAt ? new Date(debugState.lastSuccessAt).toLocaleTimeString('ko-KR') : '-'}
          </Text>
          <Text style={s.debugRow}>포그라운드 권한: {permStatus.fg}</Text>
          <Text style={s.debugRow}>백그라운드 권한: {permStatus.bg}</Text>
          <Text style={s.debugRow}>API 서버: {getApiBaseUrl()}</Text>
        </View>
      )}

      <View style={s.header}>
        <Text style={s.headerTitle}>작업 일정</Text>
        <Text style={s.headerDate}>{today.replace(/-/g, ".")}</Text>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color="#FF6B35" size="large" />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>⚠️</Text>
          <Text style={[s.empty, { color: '#EF4444', fontWeight: 'bold' }]}>일정 조회 실패</Text>
          <Text style={[s.empty, { color: colors.muted, fontSize: 13, marginTop: 4 }]}>
            {(scheduleError as any)?.data?.code === 'UNAUTHORIZED'
              ? '인증이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.'
              : (scheduleError as any)?.message || '서버 연결에 실패했습니다.'}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 16, backgroundColor: '#FF6B35', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
            onPress={() => refetch()}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (allWorks ?? []).length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>📅</Text>
          <Text style={[s.empty, { color: colors.muted }]}>배정된 방문 일정이 없습니다.</Text>
        </View>
      ) : (
        <>
          {/* 탭 바 */}
          <View style={s.tabBar}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[s.tabItem, activeTab === tab.key ? { borderBottomColor: tab.color, borderBottomWidth: 2.5 } : {}]}
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
          {/* 탭 콘텐츠 */}
          {currentWorks.length === 0 ? (
            <View style={s.center}>
              <Text style={s.emptyIcon}>
                {activeTab === "today" ? "☀️" : activeTab === "tomorrow" ? "🗓" : activeTab === "overdue" ? "⏰" : "📋"}
              </Text>
              <Text style={[s.empty, { color: colors.muted }]}>
                {activeTab === "today" ? "오늘 작업이 없습니다"
                  : activeTab === "tomorrow" ? "내일 일정이 없습니다"
                  : activeTab === "overdue" ? "미작업·이월 건이 없습니다"
                  : "전체 작업이 없습니다"}
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={s.list}
              refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#FF6B35" />}
            >
              {currentWorks.map((work: any) => renderWorkCard(work))}
            </ScrollView>
          )}
        </>
      )}

      {/* 위치 동의 모달 */}
      <LocationConsentModal
        visible={showConsentModal}
        onConsent={handleConsent}
        onDecline={handleDeclineConsent}
      />
    </ScreenContainer>
  );
}

export default function TechScheduleRoute() {
  return <TechScheduleScreen />;
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
  legacyRecoveryTitle: { color: "#991B1B", fontSize: 14, fontWeight: "800" },
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
  legacyRecoveryButtonText: { color: "#991B1B", fontSize: 12, fontWeight: "800" },
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
  arrivedState: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  arrivedStateText: { color: "#166534", fontSize: 14, fontWeight: "800" },
  departBtn: {
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  departBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  btnDisabled: { backgroundColor: "#D1D5DB" },
  trackingActions: { flexDirection: "row", gap: 10 },
  trackingActionGroup: { gap: 8 },
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
  resendSmsBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  resendSmsBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  // GPS 디버그 패널
  debugPanel: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  debugTitle: { color: '#FF6B35', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  debugRow: { color: '#9BA1A6', fontSize: 12, fontFamily: 'monospace' },
  locationStatusCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  locationStatusTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#166534',
    marginBottom: 8,
  },
  locationStatusRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#D1FAE5',
  },
  locationStatusLabel: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500' as const,
  },
  locationStatusValue: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600' as const,
    flex: 1,
    textAlign: 'right' as const,
  },
  locationStatusNote: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic' as const,
  },
  // 탭 바
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  tabBadge: {
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  // 유량 이상 배지
  flowAlertBadge: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 2,
  },
  flowAlertBadgeText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#DC2626',
  },
  flowAlertDetail: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 2,
  },
});
