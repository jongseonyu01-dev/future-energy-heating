import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  신규접수: { label: "신규 접수", color: "#3B82F6", bg: "#EFF6FF", icon: "📋" },
  기사배정대기: { label: "기사 배정 대기", color: "#F59E0B", bg: "#FFFBEB", icon: "⏳" },
  방문예정: { label: "방문 예정", color: "#8B5CF6", bg: "#F5F3FF", icon: "📅" },
  작업진행중: { label: "작업 진행 중", color: "#0EA5E9", bg: "#F0F9FF", icon: "🔧" },
  견적승인대기: { label: "견적 승인 대기", color: "#EAB308", bg: "#FEFCE8", icon: "💬" },
  작업완료: { label: "작업 완료", color: "#16A34A", bg: "#F0FDF4", icon: "✅" },
  재방문필요: { label: "재방문 필요", color: "#DC2626", bg: "#FEF2F2", icon: "🔄" },
};

export default function ReservationScreen() {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionItemId, setActionItemId] = useState<number | null>(null);

  const { data: results, isLoading, refetch } = trpc.repair.find.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0 }
  );

  const approveMutation = trpc.repair.approveEstimate.useMutation({
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setActionItemId(null);
      refetch();
      Alert.alert("승인 완료", "견적이 승인되었습니다. 곧 기사가 배정됩니다.");
    },
    onError: () => {
      setActionItemId(null);
      Alert.alert("오류", "처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    },
  });

  const rejectMutation = trpc.repair.updateStatus.useMutation({
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      setActionItemId(null);
      refetch();
      Alert.alert("거절 완료", "견적을 거절하였습니다. 담당자가 다시 연락드리겠습니다.");
    },
    onError: () => {
      setActionItemId(null);
      Alert.alert("오류", "처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    },
  });

  const handleApprove = (id: number) => {
    Alert.alert(
      "견적 승인",
      "견적을 승인하시겠습니까? 승인 후 기사가 배정됩니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "승인",
          style: "default",
          onPress: () => {
            setActionItemId(id);
            approveMutation.mutate({ id });
          },
        },
      ]
    );
  };

  const handleReject = (id: number) => {
    Alert.alert(
      "견적 거절",
      "견적을 거절하시겠습니까? 담당자가 다시 연락드립니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "거절",
          style: "destructive",
          onPress: () => {
            setActionItemId(id);
            rejectMutation.mutate({ id, status: "신규접수", adminMemo: "고객 견적 거절 → 재접수", notify: false });
          },
        },
      ]
    );
  };

  const handleSearch = () => {
    if (!query.trim()) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSearchQuery(query.trim());
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 헤더 */}
        <View style={[styles.pageHeader, { backgroundColor: "#8B5CF6" }]}>
          <Text style={styles.pageHeaderTitle}>📅 방문 예약 확인</Text>
          <Text style={styles.pageHeaderSubtitle}>
            접수번호 또는 휴대폰 번호로 조회
          </Text>
        </View>

        <View style={styles.container}>
          {/* 검색 입력 */}
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.searchLabel, { color: colors.foreground }]}>
              접수번호 또는 휴대폰 번호
            </Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[
                  styles.searchInput,
                  { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
                ]}
                value={query}
                onChangeText={setQuery}
                placeholder="FE-20240604-1234 또는 010-0000-0000"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.searchButton,
                  { backgroundColor: "#8B5CF6", opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={handleSearch}
              >
                <Text style={styles.searchButtonText}>조회</Text>
              </Pressable>
            </View>
          </View>

          {/* 로딩 */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8B5CF6" />
              <Text style={[styles.loadingText, { color: colors.muted }]}>
                조회 중...
              </Text>
            </View>
          )}

          {/* 결과 없음 */}
          {!isLoading && searchQuery && results?.length === 0 && (
            <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                조회 결과가 없습니다
              </Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                접수번호 또는 휴대폰 번호를 다시 확인해주세요
              </Text>
            </View>
          )}

          {/* 결과 목록 */}
          {!isLoading && results && results.length > 0 && (
            <View style={styles.resultList}>
              <Text style={[styles.resultCount, { color: colors.muted }]}>
                {results.length}건 조회됨
              </Text>
              {results.map((item) => {
                const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG["신규접수"];
                const isEstimatePending = item.status === "견적승인대기";
                const estimateAmount = item.estimateAmount ? Number(item.estimateAmount) : null;
                const isActioning = actionItemId === item.id;

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.resultCard,
                      { backgroundColor: colors.surface, borderColor: isEstimatePending ? "#EAB308" : colors.border },
                      isEstimatePending && styles.estimateCard,
                    ]}
                  >
                    {/* 상태 배지 */}
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                      <Text style={styles.statusIcon}>{statusInfo.icon}</Text>
                      <Text style={[styles.statusLabel, { color: statusInfo.color }]}>
                        {statusInfo.label}
                      </Text>
                    </View>

                    {/* 접수 정보 */}
                    <View style={styles.cardSection}>
                      <InfoRow label="접수번호" value={item.requestNumber} highlight />
                      <InfoRow label="접수 유형" value={item.requestType} />
                      <InfoRow
                        label="증상"
                        value={item.symptom.replace(/([가-힣])/g, "$1 ").trim()}
                      />
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    {/* 주소 정보 */}
                    <View style={styles.cardSection}>
                      <InfoRow
                        label="주소"
                        value={`${item.apartmentName} ${item.dong}동 ${item.ho}호`}
                      />
                    </View>

                    {/* 견적 금액 및 승인/거절 버튼 (견적승인대기 상태일 때만 표시) */}
                    {isEstimatePending && estimateAmount !== null && (
                      <>
                        <View style={[styles.divider, { backgroundColor: "#EAB308" }]} />
                        <View style={[styles.estimateSection, { backgroundColor: "#FFFBEB" }]}>
                          <Text style={styles.estimateTitle}>💰 견적 안내</Text>
                          <Text style={styles.estimateAmount}>
                            {estimateAmount.toLocaleString("ko-KR")}원
                          </Text>
                          <Text style={styles.estimateDesc}>
                            위 금액으로 작업을 진행합니다. 승인하시면 기사가 배정됩니다.
                          </Text>
                          <View style={styles.estimateButtons}>
                            <Pressable
                              style={({ pressed }) => [
                                styles.rejectButton,
                                { opacity: pressed || isActioning ? 0.7 : 1 },
                              ]}
                              onPress={() => handleReject(item.id)}
                              disabled={isActioning}
                            >
                              <Text style={styles.rejectButtonText}>거절</Text>
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [
                                styles.approveButton,
                                { opacity: pressed || isActioning ? 0.7 : 1 },
                              ]}
                              onPress={() => handleApprove(item.id)}
                              disabled={isActioning}
                            >
                              {isActioning ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.approveButtonText}>✅ 견적 승인</Text>
                              )}
                            </Pressable>
                          </View>
                        </View>
                      </>
                    )}

                    {/* 방문 일정 */}
                    {(item.scheduledDate || item.preferredDate) && (
                      <>
                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                        <View style={styles.cardSection}>
                          {item.scheduledDate ? (
                            <>
                              <InfoRow
                                label="방문 확정일"
                                value={item.scheduledDate}
                                highlight
                              />
                              {item.scheduledTime && (
                                <InfoRow label="방문 시간" value={item.scheduledTime} />
                              )}
                            </>
                          ) : (
                            <>
                              <InfoRow
                                label="방문 희망일"
                                value={item.preferredDate || "-"}
                              />
                              {item.preferredTime && (
                                <InfoRow label="희망 시간" value={item.preferredTime} />
                              )}
                            </>
                          )}
                          {item.technicianName && (
                            <InfoRow label="담당 기사" value={item.technicianName} />
                          )}
                        </View>
                      </>
                    )}

                    {/* 기사 위치 확인 버튼 (방문예정/이동중 상태에서만 표시) */}
                    {(item.status === "방문예정" || item.status === "작업진행중") && (
                      <TrackingButton requestId={item.id} />
                    )}

                    {/* 접수일 */}
                    <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                      <Text style={[styles.cardFooterText, { color: colors.muted }]}>
                        접수일: {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* 초기 안내 */}
          {!searchQuery && (
            <View style={[styles.guideBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.guideIcon}>💡</Text>
              <Text style={[styles.guideTitle, { color: colors.foreground }]}>
                조회 방법
              </Text>
              <Text style={[styles.guideText, { color: colors.muted }]}>
                접수 완료 후 받으신 접수번호(예: FE-20240604-1234) 또는 등록하신 휴대폰 번호로 조회하실 수 있습니다.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function TrackingButton({ requestId }: { requestId: number }) {
  const { data: session, isLoading } = trpc.location.getSessionByRequest.useQuery(
    { requestId },
    { refetchInterval: 30000 } // 30초마다 자동 갱신
  );

  const handlePress = () => {
    if (session?.trackingUrl) {
      Linking.openURL(session.trackingUrl);
    } else {
      // 세션이 없어도 위치 확인 페이지를 열어줄 수 없으므로 안내
      Alert.alert(
        "기사 출발 전",
        "담당 기사가 아직 출발하지 않았습니다.\n기사가 출발하면 실시간 위치를 확인하실 수 있습니다.",
        [{ text: "확인" }]
      );
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const isMoving = session?.status === "이동중";

  return (
    <View style={styles.trackingSection}>
      <View style={[styles.divider, { backgroundColor: isMoving ? "#FF6B35" : "#E5E7EB" }]} />
      <View style={[styles.trackingBox, { backgroundColor: isMoving ? "#FFF3E0" : "#F9FAFB" }]}>
        <View style={styles.trackingRow}>
          <View style={styles.trackingStatus}>
            {isMoving && <View style={styles.trackingPulse} />}
            <Text style={[styles.trackingStatusText, { color: isMoving ? "#FF6B35" : "#6B7280" }]}>
              {isLoading ? "조회 중..." : isMoving ? "기사 이동 중" : "기사 출발 전"}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.trackingButton,
              { backgroundColor: isMoving ? "#FF6B35" : "#8B5CF6", opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handlePress}
          >
            <Text style={styles.trackingButtonText}>
              {isMoving ? "📍 실시간 위치 확인" : "🚗 기사 위치 확인"}
            </Text>
          </Pressable>
        </View>
        {isMoving && (
          <Text style={styles.trackingHint}>
            10초마다 자동 갱신 · 실시간 지도 표시
          </Text>
        )}
      </View>
    </View>
  );
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          highlight && { color: "#E84B2F", fontWeight: "700" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  pageHeader: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  pageHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  pageHeaderSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    marginTop: 4,
  },
  container: {
    padding: 16,
    gap: 16,
  },
  searchBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  searchLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  searchButton: {
    width: 72,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  loadingContainer: {
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  emptyBox: {
    padding: 32,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  resultList: {
    gap: 12,
  },
  resultCount: {
    fontSize: 14,
    fontWeight: "500",
  },
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  estimateCard: {
    borderWidth: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 8,
  },
  statusIcon: {
    fontSize: 18,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardSection: {
    padding: 12,
    gap: 6,
  },
  divider: {
    height: 1,
    marginHorizontal: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  infoLabel: {
    fontSize: 14,
    color: "#6B7280",
    flex: 1,
  },
  infoValue: {
    fontSize: 15,
    color: "#1A1A1A",
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },
  cardFooter: {
    padding: 10,
    borderTopWidth: 1,
    alignItems: "flex-end",
  },
  cardFooterText: {
    fontSize: 12,
  },
  guideBox: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  guideIcon: {
    fontSize: 36,
  },
  guideTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  guideText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  // 견적 섹션
  estimateSection: {
    padding: 16,
    gap: 8,
  },
  estimateTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#92400E",
  },
  estimateAmount: {
    fontSize: 26,
    fontWeight: "800",
    color: "#B45309",
  },
  estimateDesc: {
    fontSize: 13,
    color: "#78350F",
    lineHeight: 20,
  },
  estimateButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  rejectButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  rejectButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#DC2626",
  },
  approveButton: {
    flex: 2,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16A34A",
  },
  approveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // 기사 위치 확인 섹션
  trackingSection: {
    // 래퍼만
  },
  trackingBox: {
    padding: 12,
    gap: 6,
  },
  trackingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trackingStatus: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trackingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B35",
  },
  trackingStatusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  trackingButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  trackingHint: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
