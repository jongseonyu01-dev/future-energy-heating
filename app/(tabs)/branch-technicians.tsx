import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, Alert, Linking, Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

export default function BranchTechniciansScreen() {
  const colors = useColors();
  const { user } = useAppAuth();
  const branchId = user?.branchId;
  const [addModal, setAddModal] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");

  const utils = trpc.useUtils();

  const { data: technicians = [], isLoading } = trpc.technicians.listByBranch.useQuery(
    { branchId: branchId ?? 0 }, { enabled: !!branchId }
  );
  const { data: allRequests = [] } = trpc.repair.listByBranch.useQuery(
    { branchId: branchId ?? 0 }, { enabled: !!branchId }
  );

  const createMutation = trpc.technicians.create.useMutation({
    onSuccess: () => {
      utils.technicians.listByBranch.invalidate();
      setAddModal(false);
      setName(""); setPhone(""); setSpecialty("");
      Alert.alert("완료", "기사가 등록되었습니다.");
    },
  });

  const setActiveMutation = trpc.technicians.setActive.useMutation({
    onSuccess: () => utils.technicians.listByBranch.invalidate(),
  });

  const deleteTechMutation = trpc.technicians.softDelete.useMutation({
    onSuccess: (r: any) => {
      if (r?.success) { utils.technicians.listByBranch.invalidate(); Alert.alert("삭제 완료", "기사가 삭제되었습니다."); }
      else Alert.alert("삭제 실패", r?.error || "삭제할 수 없습니다.");
    },
    onError: () => Alert.alert("오류", "삭제 처리 중 문제가 발생했습니다."),
  });
  const confirmDeleteTech = (id: number, name: string) => {
    if (!user) return;
    Alert.alert("기사 삭제", `「${name}」 기사를 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => deleteTechMutation.mutate({ id, actorRole: (user.appRole as any), actorUserId: user.userId, actorBranchId: user.branchId ?? undefined }) },
    ]);
  };

  // 기사별 작업 통계
  const getStats = (techId: number) => {
    const works = allRequests.filter(r => r.technicianId === techId);
    return {
      total: works.length,
      completed: works.filter(r => r.status === "작업완료").length,
      inProgress: works.filter(r => r.status === "방문예정" || r.status === "작업진행중").length,
    };
  };

  const s = styles(colors);

  if (!branchId) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 16 }}>지사장 계정으로 로그인해주세요.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={s.header}>
        <Text style={s.headerTitle}>기사 관리</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setAddModal(true)} activeOpacity={0.8}>
          <Text style={s.addBtnText}>+ 기사 등록</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color="#FF6B35" size="large" /></View>
      ) : technicians.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40 }}>👷</Text>
          <Text style={{ color: colors.muted, fontSize: 15, marginTop: 8 }}>등록된 기사가 없습니다.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {technicians.map((tech) => {
            const stats = getStats(tech.id);
            return (
              <View key={tech.id} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={s.cardTop}>
                  <View style={s.nameRow}>
                    <Text style={s.techAvatar}>👷</Text>
                    <View>
                      <Text style={[s.techName, { color: colors.foreground }]}>{tech.name}</Text>
                      {tech.specialty && <Text style={[s.techSpec, { color: "#FF6B35" }]}>{tech.specialty}</Text>}
                    </View>
                  </View>
                  <View style={[s.activeBadge, { backgroundColor: tech.isActive ? "#F0FDF4" : "#FEF2F2" }]}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: tech.isActive ? "#22C55E" : "#EF4444" }}>
                      {tech.isActive ? "활성" : "비활성"}
                    </Text>
                  </View>
                </View>

                {tech.phoneNumber && (
                  <Text style={[s.phone, { color: colors.muted }]}>📞 {tech.phoneNumber}</Text>
                )}

                {/* 실적 */}
                <View style={s.statsRow}>
                  <View style={s.statItem}>
                    <Text style={[s.statNum, { color: "#6B7280" }]}>{stats.total}</Text>
                    <Text style={s.statLabel}>전체</Text>
                  </View>
                  <View style={s.statItem}>
                    <Text style={[s.statNum, { color: "#3B82F6" }]}>{stats.inProgress}</Text>
                    <Text style={s.statLabel}>진행중</Text>
                  </View>
                  <View style={s.statItem}>
                    <Text style={[s.statNum, { color: "#22C55E" }]}>{stats.completed}</Text>
                    <Text style={s.statLabel}>완료</Text>
                  </View>
                </View>

                {/* 액션 */}
                <View style={s.actions}>
                  {tech.phoneNumber && (
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: "#3B82F6" }]}
                      onPress={() => Linking.openURL(`tel:${tech.phoneNumber!.replace(/[^0-9]/g, "")}`)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.actionBtnText}>📞 전화</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: tech.isActive ? "#EF4444" : "#22C55E" }]}
                    onPress={() => setActiveMutation.mutate({ id: tech.id, isActive: !tech.isActive })}
                    activeOpacity={0.8}
                  >
                    <Text style={s.actionBtnText}>{tech.isActive ? "비활성화" : "활성화"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#F87171" }]}
                    onPress={() => confirmDeleteTech(tech.id, tech.name)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.actionBtnText, { color: "#DC2626" }]}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* 기사 등록 모달 */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.background }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>기사 등록</Text>

            <Text style={[s.modalLabel, { color: colors.foreground }]}>이름 *</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border }]}
              value={name}
              onChangeText={setName}
              placeholder="기사 이름"
              placeholderTextColor={colors.muted}
            />

            <Text style={[s.modalLabel, { color: colors.foreground }]}>전화번호</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="010-0000-0000"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
            />

            <Text style={[s.modalLabel, { color: colors.foreground }]}>전문 분야</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border }]}
              value={specialty}
              onChangeText={setSpecialty}
              placeholder="예: 난방배관, 온도조절기"
              placeholderTextColor={colors.muted}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: "#FF6B35", flex: 1 }]}
                onPress={() => {
                  if (!name.trim()) { Alert.alert("오류", "이름을 입력해주세요."); return; }
                  createMutation.mutate({ name: name.trim(), phoneNumber: phone || undefined, specialty: specialty || undefined, branchId: branchId! });
                }}
                activeOpacity={0.8}
                disabled={createMutation.isPending}
              >
                <Text style={s.modalBtnText}>{createMutation.isPending ? "등록 중..." : "등록"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: "#6B7280", flex: 1 }]}
                onPress={() => { setAddModal(false); setName(""); setPhone(""); setSpecialty(""); }}
                activeOpacity={0.8}
              >
                <Text style={s.modalBtnText}>취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  addBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  list: { padding: 12, gap: 10 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  techAvatar: { fontSize: 32 },
  techName: { fontSize: 16, fontWeight: "700" },
  techSpec: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  activeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  phone: { fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 16, paddingVertical: 8, borderTopWidth: 1, borderColor: "#E5E7EB" },
  statItem: { alignItems: "center", gap: 2 },
  statNum: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, color: "#9CA3AF" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 4 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  modalLabel: { fontSize: 14, fontWeight: "600", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  modalBtn: { borderRadius: 12, padding: 14, alignItems: "center" },
  modalBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
