/**
 * HQFlowRate - 세대별 난방 유량 관리 컴포넌트
 * 본사 관리자 앱 hq-admin.tsx의 "유량 관리" 탭에서 사용
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, Alert, RefreshControl,
} from "react-native";
import { trpc } from "@/lib/trpc";

const FLOW_STATUS_COLOR: Record<string, string> = {
  "정상": "#22C55E",
  "주의": "#F59E0B",
  "경고": "#EF4444",
};

const FLOW_STATUS_BG: Record<string, string> = {
  "정상": "#F0FDF4",
  "주의": "#FFFBEB",
  "경고": "#FEF2F2",
};

interface FlowRateSetting {
  id: number;
  sensorId: string;
  branchId?: number | null;
  apartmentName: string;
  buildingNumber: string;
  roomNumber: string;
  baseFlowRateLpm: string;
  warningRangePercent: number;
  cautionRangePercent: number;
  alertDurationMinutes: number;
  lastFlowRateLpm?: string | null;
  lastSupplyPressure?: string | null;
  lastReturnPressure?: string | null;
  lastDifferentialPressure?: string | null;
  lastMeasuredAt?: string | Date | null;
  lastStatus?: string | null;
  alertStartedAt?: string | Date | null;
  alertSentAt?: string | Date | null;
}

export function HQFlowRate({ colors }: { colors: any }) {
  const utils = trpc.useUtils();
  const { data: settings = [], isLoading, refetch } = trpc.flowRate.listSettings.useQuery();
  const updateMutation = trpc.flowRate.updateSetting.useMutation({
    onSuccess: () => { utils.flowRate.listSettings.invalidate(); setEditModal(null); },
    onError: (e) => Alert.alert("오류", e.message),
  });
  const deleteMutation = trpc.flowRate.deleteSetting.useMutation({
    onSuccess: () => utils.flowRate.listSettings.invalidate(),
    onError: (e) => Alert.alert("오류", e.message),
  });
  const demoMutation = trpc.flowRate.demoUpdate.useMutation({
    onSuccess: () => { utils.flowRate.listSettings.invalidate(); Alert.alert("완료", "데모 유량 값이 변경되었습니다."); },
    onError: (e) => Alert.alert("오류", e.message),
  });
  const addMutation = trpc.flowRate.addSetting.useMutation({
    onSuccess: () => { utils.flowRate.listSettings.invalidate(); setAddModal(false); resetAddForm(); },
    onError: (e) => Alert.alert("오류", e.message),
  });

  const [editModal, setEditModal] = useState<FlowRateSetting | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [demoModal, setDemoModal] = useState<FlowRateSetting | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 편집 폼 상태
  const [editBase, setEditBase] = useState("");
  const [editWarn, setEditWarn] = useState("");
  const [editCaution, setEditCaution] = useState("");
  const [editAlertMin, setEditAlertMin] = useState("");

  // 추가 폼 상태
  const [addSensorId, setAddSensorId] = useState("");
  const [addAptName, setAddAptName] = useState("");
  const [addBuilding, setAddBuilding] = useState("");
  const [addRoom, setAddRoom] = useState("");
  const [addBase, setAddBase] = useState("5.50");
  const [addWarn, setAddWarn] = useState("30");
  const [addCaution, setAddCaution] = useState("15");
  const [addAlertMin, setAddAlertMin] = useState("10");

  // 데모 유량 값
  const [demoFlow, setDemoFlow] = useState("");

  const resetAddForm = () => {
    setAddSensorId(""); setAddAptName(""); setAddBuilding(""); setAddRoom("");
    setAddBase("5.50"); setAddWarn("30"); setAddCaution("15"); setAddAlertMin("10");
  };

  const openEdit = (s: FlowRateSetting) => {
    setEditBase(s.baseFlowRateLpm);
    setEditWarn(String(s.warningRangePercent));
    setEditCaution(String(s.cautionRangePercent));
    setEditAlertMin(String(s.alertDurationMinutes));
    setEditModal(s);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleSaveEdit = () => {
    if (!editModal) return;
    const base = parseFloat(editBase);
    const warn = parseInt(editWarn);
    const caution = parseInt(editCaution);
    const alertMin = parseInt(editAlertMin);
    if (isNaN(base) || base <= 0) return Alert.alert("오류", "기준 유량은 0보다 큰 숫자여야 합니다.");
    if (isNaN(warn) || warn <= 0 || warn > 100) return Alert.alert("오류", "경고 범위는 1~100% 사이여야 합니다.");
    if (isNaN(caution) || caution <= 0 || caution >= warn) return Alert.alert("오류", "주의 범위는 경고 범위보다 작아야 합니다.");
    if (isNaN(alertMin) || alertMin <= 0) return Alert.alert("오류", "알림 지속 시간은 1분 이상이어야 합니다.");
    updateMutation.mutate({ id: editModal.id, baseFlowRateLpm: base, warningRangePercent: warn, cautionRangePercent: caution, alertDurationMinutes: alertMin });
  };

  const handleDelete = (s: FlowRateSetting) => {
    Alert.alert("삭제 확인", `${s.apartmentName} ${s.buildingNumber}동 ${s.roomNumber}호 설정을 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => deleteMutation.mutate({ id: s.id }) },
    ]);
  };

  const handleAdd = () => {
    if (!addSensorId.trim()) return Alert.alert("오류", "센서 ID를 입력하세요.");
    if (!addAptName.trim()) return Alert.alert("오류", "아파트명을 입력하세요.");
    if (!addBuilding.trim()) return Alert.alert("오류", "동을 입력하세요.");
    if (!addRoom.trim()) return Alert.alert("오류", "호수를 입력하세요.");
    const base = parseFloat(addBase);
    if (isNaN(base) || base <= 0) return Alert.alert("오류", "기준 유량을 올바르게 입력하세요.");
    addMutation.mutate({
      sensorId: addSensorId.trim(),
      apartmentName: addAptName.trim(),
      buildingNumber: addBuilding.trim(),
      roomNumber: addRoom.trim(),
      baseFlowRateLpm: base,
      warningRangePercent: parseInt(addWarn) || 30,
      cautionRangePercent: parseInt(addCaution) || 15,
      alertDurationMinutes: parseInt(addAlertMin) || 10,
    });
  };

  const handleDemo = () => {
    if (!demoModal) return;
    const flow = parseFloat(demoFlow);
    if (isNaN(flow) || flow < 0) return Alert.alert("오류", "유효한 유량 값을 입력하세요.");
    demoMutation.mutate({ sensorId: demoModal.sensorId, flowRateLpm: flow });
    setDemoModal(null);
    setDemoFlow("");
  };

  const formatTime = (t: string | Date | null | undefined) => {
    if (!t) return "-";
    const d = new Date(t);
    return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const getDeviation = (current: string | null | undefined, base: string) => {
    if (!current) return null;
    const cur = parseFloat(current);
    const bas = parseFloat(base);
    if (isNaN(cur) || isNaN(bas) || bas === 0) return null;
    const pct = ((cur - bas) / bas) * 100;
    return pct;
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* 헤더 */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>🌡️ 세대별 난방 유량 관리</Text>
        <TouchableOpacity
          style={{ backgroundColor: "#FF6B35", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
          onPress={() => setAddModal(true)}
          activeOpacity={0.8}
        >
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>+ 세대 추가</Text>
        </TouchableOpacity>
      </View>

      {/* 요약 통계 */}
      {settings.length > 0 && (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {["정상", "주의", "경고"].map(status => {
            const count = settings.filter(s => (s.lastStatus ?? "정상") === status).length;
            return (
              <View key={status} style={{ flex: 1, minWidth: 80, backgroundColor: FLOW_STATUS_BG[status], borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: FLOW_STATUS_COLOR[status] + "40" }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: FLOW_STATUS_COLOR[status] }}>{count}</Text>
                <Text style={{ fontSize: 12, color: FLOW_STATUS_COLOR[status], fontWeight: "600" }}>{status}</Text>
              </View>
            );
          })}
          <View style={{ flex: 1, minWidth: 80, backgroundColor: colors.surface, borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{settings.length}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "600" }}>전체</Text>
          </View>
        </View>
      )}

      {/* 로딩 */}
      {isLoading && <ActivityIndicator color="#FF6B35" style={{ marginTop: 32 }} />}

      {/* 세대 목록 */}
      {!isLoading && settings.length === 0 && (
        <View style={{ alignItems: "center", padding: 40, gap: 12 }}>
          <Text style={{ fontSize: 40 }}>🌡️</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>등록된 세대가 없습니다</Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>ESP32 센서 웹훅이 수신되면 자동으로 등록되거나{"\n"}위 '세대 추가' 버튼으로 직접 등록할 수 있습니다.</Text>
        </View>
      )}

      {settings.map((s) => {
        const status = (s.lastStatus ?? "정상") as string;
        const statusColor = FLOW_STATUS_COLOR[status] ?? "#6B7280";
        const statusBg = FLOW_STATUS_BG[status] ?? "#F9FAFB";
        const deviation = getDeviation(s.lastFlowRateLpm, s.baseFlowRateLpm);

        return (
          <View key={s.id} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: statusColor + "60", overflow: "hidden" }}>
            {/* 상단 헤더 */}
            <View style={{ backgroundColor: statusBg, flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, paddingBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{s.apartmentName} {s.buildingNumber}동 {s.roomNumber}호</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>센서 ID: {s.sensorId}</Text>
              </View>
              <View style={{ backgroundColor: statusColor, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{status}</Text>
              </View>
            </View>

            {/* 데이터 그리드 */}
            <View style={{ padding: 12, gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <DataCell label="기준 유량" value={`${parseFloat(s.baseFlowRateLpm).toFixed(2)} LPM`} colors={colors} />
                <DataCell
                  label="현재 유량"
                  value={s.lastFlowRateLpm ? `${parseFloat(s.lastFlowRateLpm).toFixed(2)} LPM` : "-"}
                  sub={deviation !== null ? `(${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}%)` : undefined}
                  subColor={deviation !== null ? (Math.abs(deviation) >= s.warningRangePercent ? "#EF4444" : Math.abs(deviation) >= s.cautionRangePercent ? "#F59E0B" : "#22C55E") : undefined}
                  colors={colors}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <DataCell label="공급측 압력" value={s.lastSupplyPressure ? `${parseFloat(s.lastSupplyPressure).toFixed(3)} MPa` : "-"} colors={colors} />
                <DataCell label="환수측 압력" value={s.lastReturnPressure ? `${parseFloat(s.lastReturnPressure).toFixed(3)} MPa` : "-"} colors={colors} />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <DataCell label="차압" value={s.lastDifferentialPressure ? `${parseFloat(s.lastDifferentialPressure).toFixed(3)} MPa` : "-"} colors={colors} />
                <DataCell label="마지막 측정" value={formatTime(s.lastMeasuredAt)} colors={colors} />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <DataCell label="경고 범위" value={`±${s.warningRangePercent}%`} colors={colors} />
                <DataCell label="주의 범위" value={`±${s.cautionRangePercent}%`} colors={colors} />
              </View>
              {s.alertStartedAt && status !== "정상" && (
                <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#FCA5A5" }}>
                  <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>
                    ⚠️ 이탈 시작: {formatTime(s.alertStartedAt)} {s.alertSentAt ? `| 알림 발송: ${formatTime(s.alertSentAt)}` : "| 알림 대기 중"}
                  </Text>
                </View>
              )}
            </View>

            {/* 액션 버튼 */}
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderColor: colors.border }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 10, alignItems: "center", borderRightWidth: 1, borderColor: colors.border }}
                onPress={() => openEdit(s)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#3B82F6" }}>⚙️ 기준 수정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 10, alignItems: "center", borderRightWidth: 1, borderColor: colors.border }}
                onPress={() => { setDemoModal(s); setDemoFlow(s.lastFlowRateLpm ?? s.baseFlowRateLpm); }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#8B5CF6" }}>🎮 데모 테스트</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 10, alignItems: "center" }}
                onPress={() => handleDelete(s)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>🗑️ 삭제</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {/* 편집 모달 */}
      <Modal visible={!!editModal} transparent animationType="slide" onRequestClose={() => setEditModal(null)}>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.foreground }]}>기준 유량 및 경고 범위 수정</Text>
            {editModal && (
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>
                {editModal.apartmentName} {editModal.buildingNumber}동 {editModal.roomNumber}호
              </Text>
            )}
            <ModalField label="기준 유량 (LPM)" value={editBase} onChangeText={setEditBase} keyboardType="decimal-pad" placeholder="예: 5.50" colors={colors} />
            <ModalField label="경고 범위 (%)" value={editWarn} onChangeText={setEditWarn} keyboardType="number-pad" placeholder="예: 30" colors={colors} hint="기준 유량 대비 이탈 시 경고 발생 (기본 30%)" />
            <ModalField label="주의 범위 (%)" value={editCaution} onChangeText={setEditCaution} keyboardType="number-pad" placeholder="예: 15" colors={colors} hint="기준 유량 대비 이탈 시 주의 발생 (기본 15%)" />
            <ModalField label="알림 지속 시간 (분)" value={editAlertMin} onChangeText={setEditAlertMin} keyboardType="number-pad" placeholder="예: 10" colors={colors} hint="이탈 상태가 이 시간 이상 지속되면 SMS 발송" />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[modalStyles.btn, { backgroundColor: colors.border, flex: 1 }]} onPress={() => setEditModal(null)}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalStyles.btn, { backgroundColor: "#FF6B35", flex: 2 }]} onPress={handleSaveEdit} activeOpacity={0.8}>
                {updateMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>저장</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 세대 추가 모달 */}
      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <View style={modalStyles.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
            <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
              <Text style={[modalStyles.title, { color: colors.foreground }]}>새 세대 등록</Text>
              <ModalField label="센서 ID" value={addSensorId} onChangeText={setAddSensorId} placeholder="ESP32 센서 ID" colors={colors} />
              <ModalField label="아파트명" value={addAptName} onChangeText={setAddAptName} placeholder="예: 래미안아파트" colors={colors} />
              <ModalField label="동" value={addBuilding} onChangeText={setAddBuilding} placeholder="예: 101" keyboardType="number-pad" colors={colors} />
              <ModalField label="호수" value={addRoom} onChangeText={setAddRoom} placeholder="예: 1201" keyboardType="number-pad" colors={colors} />
              <ModalField label="기준 유량 (LPM)" value={addBase} onChangeText={setAddBase} keyboardType="decimal-pad" placeholder="예: 5.50" colors={colors} />
              <ModalField label="경고 범위 (%)" value={addWarn} onChangeText={setAddWarn} keyboardType="number-pad" placeholder="30" colors={colors} />
              <ModalField label="주의 범위 (%)" value={addCaution} onChangeText={setAddCaution} keyboardType="number-pad" placeholder="15" colors={colors} />
              <ModalField label="알림 지속 시간 (분)" value={addAlertMin} onChangeText={setAddAlertMin} keyboardType="number-pad" placeholder="10" colors={colors} />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity style={[modalStyles.btn, { backgroundColor: colors.border, flex: 1 }]} onPress={() => { setAddModal(false); resetAddForm(); }}>
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[modalStyles.btn, { backgroundColor: "#FF6B35", flex: 2 }]} onPress={handleAdd} activeOpacity={0.8}>
                  {addMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>등록</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* 데모 테스트 모달 */}
      <Modal visible={!!demoModal} transparent animationType="fade" onRequestClose={() => setDemoModal(null)}>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.foreground }]}>🎮 데모 유량 값 변경</Text>
            {demoModal && (
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
                {demoModal.apartmentName} {demoModal.buildingNumber}동 {demoModal.roomNumber}호{"\n"}
                기준 유량: {parseFloat(demoModal.baseFlowRateLpm).toFixed(2)} LPM
              </Text>
            )}
            <View style={{ gap: 4, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>테스트 유량 값 (LPM)</Text>
              <TextInput
                value={demoFlow}
                onChangeText={setDemoFlow}
                keyboardType="decimal-pad"
                placeholder="예: 3.50"
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, backgroundColor: colors.background }}
                placeholderTextColor={colors.muted}
              />
              {demoModal && demoFlow && !isNaN(parseFloat(demoFlow)) && (
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  이탈률: {(Math.abs((parseFloat(demoFlow) - parseFloat(demoModal.baseFlowRateLpm)) / parseFloat(demoModal.baseFlowRateLpm)) * 100).toFixed(1)}%
                  {" → "}
                  {Math.abs((parseFloat(demoFlow) - parseFloat(demoModal.baseFlowRateLpm)) / parseFloat(demoModal.baseFlowRateLpm)) * 100 >= demoModal.warningRangePercent
                    ? "경고 🔴"
                    : Math.abs((parseFloat(demoFlow) - parseFloat(demoModal.baseFlowRateLpm)) / parseFloat(demoModal.baseFlowRateLpm)) * 100 >= demoModal.cautionRangePercent
                    ? "주의 🟡"
                    : "정상 🟢"}
                </Text>
              )}
            </View>
            {/* 빠른 선택 버튼 */}
            {demoModal && (
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {[
                  { label: "정상 (기준)", pct: 0 },
                  { label: "+20% 주의", pct: 20 },
                  { label: "+35% 경고", pct: 35 },
                  { label: "-20% 주의", pct: -20 },
                  { label: "-35% 경고", pct: -35 },
                ].map(({ label, pct }) => {
                  const base = parseFloat(demoModal.baseFlowRateLpm);
                  const val = (base * (1 + pct / 100)).toFixed(2);
                  return (
                    <TouchableOpacity
                      key={label}
                      style={{ backgroundColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                      onPress={() => setDemoFlow(val)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 11, color: colors.foreground, fontWeight: "600" }}>{label}</Text>
                      <Text style={{ fontSize: 10, color: colors.muted }}>{val} LPM</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[modalStyles.btn, { backgroundColor: colors.border, flex: 1 }]} onPress={() => { setDemoModal(null); setDemoFlow(""); }}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalStyles.btn, { backgroundColor: "#8B5CF6", flex: 2 }]} onPress={handleDemo} activeOpacity={0.8}>
                {demoMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>적용</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function DataCell({ label, value, sub, subColor, colors }: { label: string; value: string; sub?: string; subColor?: string; colors: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{value}</Text>
      {sub && <Text style={{ fontSize: 11, fontWeight: "600", color: subColor ?? colors.muted, marginTop: 1 }}>{sub}</Text>}
    </View>
  );
}

function ModalField({
  label, value, onChangeText, placeholder, keyboardType, hint, colors,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; hint?: string; colors: any;
}) {
  return (
    <View style={{ gap: 4, marginBottom: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        placeholder={placeholder}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, backgroundColor: colors.background }}
        placeholderTextColor={colors.muted}
        returnKeyType="done"
      />
      {hint && <Text style={{ fontSize: 11, color: colors.muted }}>{hint}</Text>}
    </View>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  btn: { borderRadius: 12, padding: 14, alignItems: "center" },
});
