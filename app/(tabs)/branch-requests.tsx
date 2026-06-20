import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { CalendarPicker } from "@/components/calendar-picker";
import { formatFullAddress } from "@/constants/address-data";

const STATUS_COLOR: Record<string, string> = {
  "신규접수": "#6B7280", "기사배정대기": "#F59E0B", "방문예정": "#3B82F6",
  "작업진행중": "#FF6B35", "견적승인대기": "#8B5CF6", "작업완료": "#22C55E", "재방문필요": "#EF4444",
};

const FILTER_TABS = ["전체", "신규접수", "기사배정대기", "방문예정", "작업진행중", "재방문필요", "작업완료"];
const TIME_OPTIONS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

export default function BranchRequestsScreen() {
  const colors = useColors();
  const { user } = useAppAuth();
  const branchId = user?.branchId;
  const [activeFilter, setActiveFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [assignModal, setAssignModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);
  const [selectedTechName, setSelectedTechName] = useState("");

  const utils = trpc.useUtils();

  const { data: requests = [], isLoading } = trpc.repair.listByBranch.useQuery(
    { branchId: branchId ?? 0 }, { enabled: !!branchId }
  );
  const { data: technicians = [] } = trpc.technicians.listByBranch.useQuery(
    { branchId: branchId ?? 0 }, { enabled: !!branchId }
  );

  const assignMutation = trpc.repair.assignTechnician.useMutation({
    onSuccess: () => {
      utils.repair.listByBranch.invalidate();
      setAssignModal(false);
      Alert.alert("완료", "기사가 배정되었습니다.");
    },
  });

  const estimateMutation = trpc.repair.updateEstimate.useMutation({
    onSuccess: () => {
      utils.repair.listByBranch.invalidate();
      setEstimateAmount("");
      Alert.alert("완료", "견적이 등록되었습니다.");
    },
  });

  const statusMutation = trpc.repair.updateStatus.useMutation({
    onSuccess: () => utils.repair.listByBranch.invalidate(),
  });

  const filtered = requests.filter((r) => {
    const matchFilter = activeFilter === "전체" || r.status === activeFilter;
    const matchSearch = !search || r.customerName.includes(search) || r.apartmentName.includes(search) || r.requestNumber.includes(search);
    return matchFilter && matchSearch;
  });

  const selectedRequest = requests.find(r => r.id === selectedId);

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
        <Text style={s.headerTitle}>접수 관리</Text>
        <Text style={s.headerSub}>전체 {requests.length}건</Text>
      </View>

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
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {filtered.map((r) => (
            <View key={r.id} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.cardTop}>
                <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[r.status] + "20" }]}>
                  <Text style={[s.statusText, { color: STATUS_COLOR[r.status] }]}>{r.status}</Text>
                </View>
                <Text style={[s.requestNum, { color: colors.muted }]}>{r.requestNumber}</Text>
              </View>
              <Text style={[s.customerName, { color: colors.foreground }]}>{r.customerName}</Text>
              <Text style={[s.address, { color: colors.muted }]}>{formatFullAddress(r)}</Text>
              <Text style={[s.symptom, { color: "#FF6B35" }]}>
                {r.requestType === "배관청소" ? "🚿 배관청소" : `🔧 ${r.symptom}`}
              </Text>
              {r.technicianName && (
                <Text style={[s.techName, { color: "#3B82F6" }]}>👷 {r.technicianName}</Text>
              )}
              {r.scheduledDate && (
                <Text style={[s.scheduleInfo, { color: colors.muted }]}>
                  📅 {r.scheduledDate} {r.scheduledTime ?? ""}
                </Text>
              )}

              {/* 액션 버튼 */}
              <View style={s.actions}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#3B82F6" }]}
                  onPress={() => { setSelectedId(r.id); setAssignModal(true); }}
                  activeOpacity={0.8}
                >
                  <Text style={s.actionBtnText}>기사 배정</Text>
                </TouchableOpacity>
                {(r.status === "방문예정" || r.status === "작업진행중") && (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: "#8B5CF6" }]}
                    onPress={() => {
                      setSelectedId(r.id);
                      setEstimateAmount("");
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.actionBtnText}>견적 등록</Text>
                  </TouchableOpacity>
                )}
                {r.status === "재방문필요" && (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: "#22C55E" }]}
                    onPress={() => statusMutation.mutate({ id: r.id, status: "기사배정대기", notify: false })}
                    activeOpacity={0.8}
                  >
                    <Text style={s.actionBtnText}>재배정</Text>
                  </TouchableOpacity>
                )}
                {r.status === "작업진행중" && (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: "#22C55E" }]}
                    onPress={() => statusMutation.mutate({ id: r.id, status: "작업완료" })}
                    activeOpacity={0.8}
                  >
                    <Text style={s.actionBtnText}>완료 승인</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 견적 입력 (선택된 항목) */}
              {selectedId === r.id && !assignModal && (
                <View style={[s.estimateBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[s.estimateLabel, { color: colors.foreground }]}>견적 금액 (원)</Text>
                  <TextInput
                    style={[s.estimateInput, { color: colors.foreground, borderColor: colors.border }]}
                    value={estimateAmount}
                    onChangeText={setEstimateAmount}
                    placeholder="예: 150000"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[s.estimateBtn, { backgroundColor: "#8B5CF6" }]}
                      onPress={() => {
                        const amount = parseInt(estimateAmount);
                        if (isNaN(amount) || amount <= 0) { Alert.alert("오류", "올바른 금액을 입력해주세요."); return; }
                        estimateMutation.mutate({ id: r.id, estimateAmount: amount });
                        setSelectedId(null);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={s.estimateBtnText}>등록</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.estimateBtn, { backgroundColor: "#6B7280" }]}
                      onPress={() => setSelectedId(null)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.estimateBtnText}>취소</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* 기사 배정 모달 */}
      <Modal visible={assignModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.background }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>기사 배정</Text>
            {selectedRequest && (
              <Text style={[s.modalSub, { color: colors.muted }]}>
                {selectedRequest.customerName} · {selectedRequest.apartmentName}
              </Text>
            )}

            <Text style={[s.modalLabel, { color: colors.foreground }]}>기사 선택</Text>
            <ScrollView style={{ maxHeight: 160 }}>
              {technicians.map((tech) => (
                <TouchableOpacity
                  key={tech.id}
                  style={[s.techItem, selectedTechId === tech.id && s.techItemSelected, { borderColor: colors.border }]}
                  onPress={() => { setSelectedTechId(tech.id); setSelectedTechName(tech.name); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.techItemText, { color: colors.foreground }]}>👷 {tech.name}</Text>
                  {tech.specialty && <Text style={[s.techSpec, { color: colors.muted }]}>{tech.specialty}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.modalLabel, { color: colors.foreground }]}>방문 날짜</Text>
            <CalendarPicker value={scheduleDate} onChange={setScheduleDate} placeholder="날짜 선택" />

            <Text style={[s.modalLabel, { color: colors.foreground }]}>방문 시간</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {TIME_OPTIONS.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.timeChip, scheduleTime === t && s.timeChipActive]}
                  onPress={() => setScheduleTime(t)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.timeChipText, scheduleTime === t && s.timeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: "#3B82F6", flex: 1 }]}
                onPress={() => {
                  if (!selectedTechId) { Alert.alert("오류", "기사를 선택해주세요."); return; }
                  if (!selectedId) return;
                  assignMutation.mutate({
                    id: selectedId,
                    technicianId: selectedTechId,
                    technicianName: selectedTechName,
                    scheduledDate: scheduleDate || undefined,
                    scheduledTime: scheduleTime || undefined,
                  });
                }}
                activeOpacity={0.8}
                disabled={assignMutation.isPending}
              >
                <Text style={s.modalBtnText}>{assignMutation.isPending ? "처리 중..." : "배정 완료"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: "#6B7280", flex: 1 }]}
                onPress={() => { setAssignModal(false); setSelectedTechId(null); setScheduleDate(""); setScheduleTime(""); }}
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
  header: { backgroundColor: "#FF6B35", padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  searchBox: { margin: 12, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { fontSize: 14, paddingVertical: 10 },
  filterRow: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 12, gap: 8, alignItems: "center" },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB" },
  filterTabActive: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
  filterTabText: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  filterTabTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  list: { padding: 12, gap: 10 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: "700" },
  requestNum: { fontSize: 12 },
  customerName: { fontSize: 16, fontWeight: "700" },
  address: { fontSize: 13 },
  symptom: { fontSize: 13, fontWeight: "600" },
  techName: { fontSize: 12, fontWeight: "600" },
  scheduleInfo: { fontSize: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  actionBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  estimateBox: { marginTop: 8, borderRadius: 10, padding: 12, borderWidth: 1, gap: 8 },
  estimateLabel: { fontSize: 13, fontWeight: "600" },
  estimateInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15 },
  estimateBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: "center" },
  estimateBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8, maxHeight: "90%" },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  modalSub: { fontSize: 13, marginBottom: 8 },
  modalLabel: { fontSize: 14, fontWeight: "600", marginTop: 8 },
  techItem: { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 6 },
  techItemSelected: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  techItemText: { fontSize: 14, fontWeight: "600" },
  techSpec: { fontSize: 12, marginTop: 2 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB", marginRight: 8 },
  timeChipActive: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
  timeChipText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  timeChipTextActive: { color: "#fff" },
  modalBtn: { borderRadius: 12, padding: 14, alignItems: "center" },
  modalBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
