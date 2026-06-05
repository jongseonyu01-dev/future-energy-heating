import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

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

  const { data: allWorks, isLoading } = trpc.repair.listByTechnician.useQuery(
    { technicianId: technicianId ?? 0 },
    { enabled: !!technicianId }
  );

  // 오늘 방문 예정 필터
  const todayWorks = (allWorks ?? []).filter(
    (w) => w.scheduledDate === today && w.status !== "작업완료"
  );

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Linking.openURL(`tel:${phone.replace(/[^0-9]/g, "")}`);
  };

  const handleNav = (address: string) => {
    const encoded = encodeURIComponent(address);
    const url = Platform.OS === "ios"
      ? `maps://?q=${encoded}`
      : `geo:0,0?q=${encoded}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://map.naver.com/search/${encoded}`);
    });
  };

  const s = styles(colors);

  if (!technicianId) {
    return (
      <ScreenContainer className="p-6">
        <Text style={[s.empty, { color: colors.muted }]}>기사 계정으로 로그인해주세요.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={s.header}>
        <Text style={s.headerTitle}>오늘 방문 일정</Text>
        <Text style={s.headerDate}>{today.replace(/-/g, ".")}</Text>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color="#FF6B35" size="large" />
        </View>
      ) : todayWorks.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>📅</Text>
          <Text style={[s.empty, { color: colors.muted }]}>오늘 예정된 방문이 없습니다.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {todayWorks.map((work) => (
            <View key={work.id} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.cardHeader}>
                <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[work.status] + "20" }]}>
                  <Text style={[s.statusText, { color: STATUS_COLOR[work.status] }]}>{work.status}</Text>
                </View>
                <Text style={[s.requestNum, { color: colors.muted }]}>{work.requestNumber}</Text>
              </View>

              <Text style={[s.customerName, { color: colors.foreground }]}>{work.customerName} 고객님</Text>
              <Text style={[s.address, { color: colors.muted }]}>
                {work.apartmentName} {work.dong}동 {work.ho}호
              </Text>
              <Text style={[s.symptom, { color: "#FF6B35" }]}>
                {work.requestType === "배관청소" ? "🚿 배관청소" : `🔧 ${work.symptom}`}
              </Text>

              {work.scheduledTime && (
                <Text style={[s.time, { color: colors.foreground }]}>⏰ {work.scheduledTime}</Text>
              )}

              {work.detailContent ? (
                <Text style={[s.detail, { color: colors.muted }]} numberOfLines={2}>{work.detailContent}</Text>
              ) : null}

              {/* 액션 버튼 */}
              <View style={s.actions}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#3B82F6" }]}
                  onPress={() => handleCall(work.phoneNumber)}
                  activeOpacity={0.8}
                >
                  <Text style={s.actionBtnText}>📞 전화</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#22C55E" }]}
                  onPress={() => handleNav(`${work.apartmentName} ${work.dong}동`)}
                  activeOpacity={0.8}
                >
                  <Text style={s.actionBtnText}>🗺 내비</Text>
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
          ))}
        </ScrollView>
      )}
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
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 6 },
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
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
