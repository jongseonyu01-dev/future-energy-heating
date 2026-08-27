import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { formatFullAddress } from "@/constants/address-data";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const WORKSPACE_STATUSES = new Set([
  "기사도착", "도착", "작업진행중", "공사중", "작업완료", "공사완료", "결제완료", "후기요청", "재방문필요",
]);

const canOpenWorkspace = (work: any) =>
  Boolean(work?.arrivedAt) ||
  WORKSPACE_STATUSES.has(work?.status) ||
  WORKSPACE_STATUSES.has(work?.workflowStage);

export default function JobWorkspaceScreen() {
  const { requestId: requestIdParam } = useLocalSearchParams<{ requestId?: string }>();
  const requestId = Number.parseInt(requestIdParam ?? "0", 10);
  const router = useRouter();
  const colors = useColors();
  const s = styles(colors);

  const { data: request, isLoading, error, refetch } = trpc.repair.getById.useQuery(
    { id: requestId },
    { enabled: requestId > 0 },
  );

  const openEstimate = (mode: "draft" | "send") => {
    if (!request) return;
    const query = [
      `requestId=${request.id}`,
      `mode=${mode}`,
    ].join("&");
    router.push(`/tech-estimate?${query}` as any);
  };

  if (!Number.isFinite(requestId) || requestId <= 0) {
    return (
      <ScreenContainer className="p-6">
        <View style={s.center}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={[s.errorTitle, { color: colors.foreground }]}>잘못된 작업 정보입니다.</Text>
          <TouchableOpacity style={s.backAction} onPress={() => router.back()}>
            <Text style={s.backActionText}>작업 목록으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={s.center}><ActivityIndicator color="#FF6B35" size="large" /></View>
      </ScreenContainer>
    );
  }

  if (error || !request) {
    return (
      <ScreenContainer className="p-6">
        <View style={s.center}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={[s.errorTitle, { color: colors.foreground }]}>작업 정보를 불러오지 못했습니다.</Text>
          <TouchableOpacity style={s.backAction} onPress={() => refetch()}>
            <Text style={s.backActionText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (!canOpenWorkspace(request)) {
    return (
      <ScreenContainer>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.backBtnText}>← 뒤로</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>현장 업무공간</Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.center}>
          <Text style={s.lockIcon}>🔒</Text>
          <Text style={[s.lockTitle, { color: colors.foreground }]}>도착 완료 후 열립니다</Text>
          <Text style={[s.lockDescription, { color: colors.muted }]}>작업 일정에서 출발한 뒤 현장에 도착하면{`\n`}‘도착’을 눌러주세요.</Text>
          <TouchableOpacity style={s.backAction} onPress={() => router.back()}>
            <Text style={s.backActionText}>작업 일정으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={s.backBtnText}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>현장 업무공간</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.infoTop}>
            <Text style={[s.customerName, { color: colors.foreground }]}>{request.customerName} 고객님</Text>
            <View style={s.arrivedBadge}><Text style={s.arrivedBadgeText}>도착 완료</Text></View>
          </View>
          <Text style={[s.infoText, { color: colors.muted }]}>{formatFullAddress(request)}</Text>
          <Text style={s.requestType}>
            {request.requestType === "배관청소" ? "🚿 배관청소" : `🔧 ${request.symptom ?? "현장 작업"}`}
          </Text>
          {!!request.requestNumber && (
            <Text style={[s.requestNumber, { color: colors.muted }]}>접수번호 {request.requestNumber}</Text>
          )}
        </View>

        <Text style={[s.guide, { color: colors.muted }]}>현장에서 필요한 업무를 순서대로 선택하세요.</Text>

        <TouchableOpacity
          style={[s.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push(`/work-report?id=${request.id}` as any)}
          activeOpacity={0.8}
        >
          <View style={[s.menuIcon, { backgroundColor: "#ECFDF5" }]}><Text style={s.menuEmoji}>📋</Text></View>
          <View style={s.menuCopy}>
            <Text style={[s.menuTitle, { color: colors.foreground }]}>현장 점검표</Text>
            <Text style={[s.menuDescription, { color: colors.muted }]}>현장사진 · 사용 자재 · 작업 메모 · 결제방법 기록</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => openEstimate("draft")}
          activeOpacity={0.8}
        >
          <View style={[s.menuIcon, { backgroundColor: "#EFF6FF" }]}><Text style={s.menuEmoji}>🧾</Text></View>
          <View style={s.menuCopy}>
            <Text style={[s.menuTitle, { color: colors.foreground }]}>견적서 만들기</Text>
            <Text style={[s.menuDescription, { color: colors.muted }]}>단가표로 견적을 작성해 이 기기에 임시 저장</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.menuCard, { backgroundColor: colors.surface, borderColor: "#FDBA74" }]}
          onPress={() => openEstimate("send")}
          activeOpacity={0.8}
        >
          <View style={[s.menuIcon, { backgroundColor: "#FFF7ED" }]}><Text style={s.menuEmoji}>📤</Text></View>
          <View style={s.menuCopy}>
            <Text style={[s.menuTitle, { color: colors.foreground }]}>견적서 송출하기</Text>
            <Text style={[s.menuDescription, { color: colors.muted }]}>본사/지사 검토를 요청합니다. 고객에게 직접 발송되지 않습니다.</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <View style={s.notice}>
          <Text style={s.noticeText}>견적서는 본사/지사 승인 후 고객에게 발송됩니다.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  header: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { paddingVertical: 6, paddingRight: 8 },
  backBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  headerTitle: { color: "#fff", fontSize: 19, fontWeight: "900" },
  headerSpacer: { width: 48 },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  errorIcon: { fontSize: 42, marginBottom: 8 },
  errorTitle: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  lockIcon: { fontSize: 44, marginBottom: 10 },
  lockTitle: { fontSize: 19, fontWeight: "900", textAlign: "center" },
  lockDescription: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  backAction: { backgroundColor: "#FF6B35", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  backActionText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 5 },
  infoTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  customerName: { fontSize: 19, fontWeight: "900", flex: 1 },
  arrivedBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: "#DCFCE7" },
  arrivedBadgeText: { color: "#15803D", fontSize: 11, fontWeight: "800" },
  infoText: { fontSize: 13, lineHeight: 19 },
  requestType: { color: "#FF6B35", fontSize: 14, fontWeight: "800", marginTop: 2 },
  requestNumber: { fontSize: 12 },
  guide: { fontSize: 13, marginTop: 4, marginBottom: 2 },
  menuCard: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  menuIcon: { width: 50, height: 50, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  menuEmoji: { fontSize: 25 },
  menuCopy: { flex: 1, gap: 3 },
  menuTitle: { fontSize: 17, fontWeight: "900" },
  menuDescription: { fontSize: 12, lineHeight: 18 },
  chevron: { color: "#9CA3AF", fontSize: 28, fontWeight: "400" },
  notice: { backgroundColor: "#FFF7ED", borderRadius: 12, padding: 12, marginTop: 2 },
  noticeText: { color: "#9A3412", fontSize: 12, lineHeight: 18, textAlign: "center", fontWeight: "600" },
});
