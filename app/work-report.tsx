/**
 * 현장 기사 - 작업 보고서 화면
 * - 현장 점검표 작성
 * - 사용 자재 입력
 * - 작업 메모
 * - 재방문 필요 여부
 * - 작업 완료 보고
 */
import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

const CHECK_ITEMS = [
  "온도조절기 작동 확인",
  "분배기 밸브 상태 확인",
  "배관 누수 여부 확인",
  "보일러 연결 상태 확인",
  "방별 난방 균일도 확인",
  "배관 청소 상태 확인",
  "필터 교체 여부 확인",
  "전기 배선 안전 확인",
];

export default function WorkReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = parseInt(id ?? "0");
  const router = useRouter();
  const colors = useColors();
  const { user } = useAppAuth();
  const technicianId = user?.technicianId;

  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [usedMaterials, setUsedMaterials] = useState("");
  const [workMemo, setWorkMemo] = useState("");
  const [needsRevisit, setNeedsRevisit] = useState(false);
  const [revisitReason, setRevisitReason] = useState("");
  const [saved, setSaved] = useState(false);

  const utils = trpc.useUtils();

  const { data: request, isLoading: requestLoading } = trpc.repair.getById.useQuery(
    { id: requestId }, { enabled: requestId > 0 }
  );
  const { data: existingReport } = trpc.workReport.getByRequest.useQuery(
    { requestId }, { enabled: requestId > 0 }
  );

  // 기존 보고서 데이터 로드
  useEffect(() => {
    if (existingReport) {
      if (existingReport.checkItems) {
        try {
          const items = JSON.parse(existingReport.checkItems);
          setCheckedItems(new Set(items));
        } catch { /* ignore */ }
      }
      if (existingReport.usedMaterials) setUsedMaterials(existingReport.usedMaterials);
      if (existingReport.workMemo) setWorkMemo(existingReport.workMemo);
    }
  }, [existingReport]);

  const saveMutation = trpc.workReport.save.useMutation({
    onSuccess: () => {
      utils.repair.listByTechnician.invalidate();
      setSaved(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("저장 완료", "작업 보고서가 저장되었습니다.");
    },
    onError: () => Alert.alert("오류", "저장 중 문제가 발생했습니다."),
  });

  const completeMutation = trpc.workReport.save.useMutation({
    onSuccess: () => {
      utils.repair.listByTechnician.invalidate();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("완료", "작업 완료 보고가 제출되었습니다.", [
        { text: "확인", onPress: () => router.back() }
      ]);
    },
    onError: () => Alert.alert("오류", "제출 중 문제가 발생했습니다."),
  });

  const revisitMutation = trpc.repair.setRevisit.useMutation({
    onSuccess: () => utils.repair.listByTechnician.invalidate(),
  });

  const toggleCheck = (item: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const handleSave = () => {
    if (!technicianId) { Alert.alert("오류", "기사 정보를 찾을 수 없습니다."); return; }
    saveMutation.mutate({
      requestId,
      technicianId,
      checkItems: JSON.stringify(Array.from(checkedItems)),
      usedMaterials: usedMaterials || undefined,
      workMemo: workMemo || undefined,
      isCompleted: false,
    });
  };

  const handleComplete = () => {
    if (!technicianId) { Alert.alert("오류", "기사 정보를 찾을 수 없습니다."); return; }
    Alert.alert(
      "작업 완료 보고",
      "작업을 완료로 보고하시겠습니까? 완료 후에는 수정이 어렵습니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "완료 보고",
          onPress: () => {
            if (needsRevisit) {
              revisitMutation.mutate({ id: requestId, needsRevisit: true, revisitReason });
            }
            completeMutation.mutate({
              requestId,
              technicianId,
              checkItems: JSON.stringify(Array.from(checkedItems)),
              usedMaterials: usedMaterials || undefined,
              workMemo: workMemo || undefined,
              isCompleted: !needsRevisit,
            });
          }
        }
      ]
    );
  };

  const s = styles(colors);

  if (requestLoading) {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#FF6B35" size="large" />
        </View>
      </ScreenContainer>
    );
  }

  if (!request) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 16 }}>접수 정보를 찾을 수 없습니다.</Text>
      </ScreenContainer>
    );
  }

  const isCompleted = request.status === "작업완료";

  return (
    <ScreenContainer>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backBtn}>
          <Text style={s.backBtnText}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>현장 점검표</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* 고객 정보 */}
        <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.infoTitle, { color: colors.foreground }]}>{request.customerName}</Text>
          <Text style={[s.infoSub, { color: colors.muted }]}>{request.apartmentName} {request.dong}동 {request.ho}호</Text>
          <Text style={[s.infoSub, { color: "#FF6B35" }]}>
            {request.requestType === "배관청소" ? "🚿 배관청소" : `🔧 ${request.symptom}`}
          </Text>
          {request.detailContent && (
            <Text style={[s.infoDetail, { color: colors.muted }]}>{request.detailContent}</Text>
          )}
        </View>

        {/* 점검 항목 */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>✅ 점검 항목</Text>
          <Text style={[s.sectionSub, { color: colors.muted }]}>
            {checkedItems.size}/{CHECK_ITEMS.length} 완료
          </Text>
          {CHECK_ITEMS.map((item) => (
            <TouchableOpacity
              key={item}
              style={[s.checkItem, { backgroundColor: checkedItems.has(item) ? "#F0FDF4" : colors.surface, borderColor: checkedItems.has(item) ? "#22C55E" : colors.border }]}
              onPress={() => !isCompleted && toggleCheck(item)}
              activeOpacity={isCompleted ? 1 : 0.7}
            >
              <View style={[s.checkbox, { backgroundColor: checkedItems.has(item) ? "#22C55E" : "transparent", borderColor: checkedItems.has(item) ? "#22C55E" : "#D1D5DB" }]}>
                {checkedItems.has(item) && <Text style={s.checkmark}>✓</Text>}
              </View>
              <Text style={[s.checkItemText, { color: colors.foreground }]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 사용 자재 */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>🔩 사용 자재</Text>
          <TextInput
            style={[s.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={usedMaterials}
            onChangeText={setUsedMaterials}
            placeholder="예: 온도조절기 1개, 분배기 밸브 2개, 배관 테이프 1롤"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            editable={!isCompleted}
          />
        </View>

        {/* 작업 메모 */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>📝 작업 메모</Text>
          <TextInput
            style={[s.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={workMemo}
            onChangeText={setWorkMemo}
            placeholder="작업 내용, 특이사항, 고객 요청 등을 입력하세요"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isCompleted}
          />
        </View>

        {/* 재방문 필요 여부 */}
        {!isCompleted && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>🔄 재방문 필요</Text>
            <TouchableOpacity
              style={[s.revisitToggle, { backgroundColor: needsRevisit ? "#FEF2F2" : colors.surface, borderColor: needsRevisit ? "#EF4444" : colors.border }]}
              onPress={() => setNeedsRevisit(!needsRevisit)}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, { backgroundColor: needsRevisit ? "#EF4444" : "transparent", borderColor: needsRevisit ? "#EF4444" : "#D1D5DB" }]}>
                {needsRevisit && <Text style={s.checkmark}>✓</Text>}
              </View>
              <Text style={[s.checkItemText, { color: needsRevisit ? "#EF4444" : colors.foreground }]}>재방문이 필요합니다</Text>
            </TouchableOpacity>
            {needsRevisit && (
              <TextInput
                style={[s.textArea, { color: colors.foreground, borderColor: "#EF4444", backgroundColor: "#FEF2F2", marginTop: 8 }]}
                value={revisitReason}
                onChangeText={setRevisitReason}
                placeholder="재방문 사유를 입력하세요"
                placeholderTextColor="#EF4444"
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            )}
          </View>
        )}

        {/* 완료 상태 표시 */}
        {isCompleted && (
          <View style={[s.completedBanner, { backgroundColor: "#F0FDF4", borderColor: "#22C55E" }]}>
            <Text style={{ fontSize: 20 }}>✅</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#22C55E" }}>작업 완료 보고됨</Text>
          </View>
        )}

        {/* 버튼 */}
        {!isCompleted && (
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: "#6B7280" }]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={saveMutation.isPending}
            >
              <Text style={s.btnText}>{saveMutation.isPending ? "저장 중..." : "임시 저장"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: "#22C55E" }]}
              onPress={handleComplete}
              activeOpacity={0.8}
              disabled={completeMutation.isPending}
            >
              <Text style={s.btnText}>{completeMutation.isPending ? "제출 중..." : "작업 완료 보고"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { backgroundColor: "#FF6B35", padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  backBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },
  infoCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  infoTitle: { fontSize: 18, fontWeight: "700" },
  infoSub: { fontSize: 14 },
  infoDetail: { fontSize: 13, marginTop: 4 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionSub: { fontSize: 13 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 10, padding: 12, borderWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "800" },
  checkItemText: { fontSize: 14, flex: 1 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80 },
  revisitToggle: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 10, padding: 12, borderWidth: 1 },
  completedBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 16, borderWidth: 1 },
  btnRow: { flexDirection: "row", gap: 10 },
  saveBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
