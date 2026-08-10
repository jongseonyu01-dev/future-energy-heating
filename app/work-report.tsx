/**
 * 현장 기사 - 작업 보고서 화면
 * - 현장 점검표 작성
 * - 사용 자재 입력
 * - 작업 전/후 사진 촬영
 * - 작업 메모
 * - 재방문 필요 여부
 * - 작업 완료 보고
 */
import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Platform, Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { formatFullAddress } from "@/constants/address-data";
import * as Haptics from "expo-haptics";
import { WorkReportErrorBoundary } from "@/components/work-report-error-boundary";

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

function WorkReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = parseInt(id ?? "0");
  const router = useRouter();
  const colors = useColors();
  const { user } = useAppAuth();
  const technicianId = user?.technicianId;
  // styles를 최상위에서 호출 (React Compiler 호환성 및 크래시 방지)
  const s = styles(colors);

  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [usedMaterials, setUsedMaterials] = useState("");
  const [workMemo, setWorkMemo] = useState("");
  const [needsRevisit, setNeedsRevisit] = useState(false);
  const [revisitReason, setRevisitReason] = useState("");
  const [saved, setSaved] = useState(false);

  // 사진 상태
  const [beforePhotoUri, setBeforePhotoUri] = useState<string | null>(null);
  const [afterPhotoUri, setAfterPhotoUri] = useState<string | null>(null);
  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | undefined>(undefined);
  const [afterPhotoUrl, setAfterPhotoUrl] = useState<string | undefined>(undefined);
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter] = useState(false);

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
      if (existingReport.beforePhotoUrl) {
        setBeforePhotoUrl(existingReport.beforePhotoUrl);
        setBeforePhotoUri(existingReport.beforePhotoUrl);
      }
      if (existingReport.afterPhotoUrl) {
        setAfterPhotoUrl(existingReport.afterPhotoUrl);
        setAfterPhotoUri(existingReport.afterPhotoUrl);
      }
    }
  }, [existingReport]);

  const uploadPhotoMutation = trpc.workReport.uploadPhoto.useMutation();

  const pickPhoto = async (type: "before" | "after") => {
    // dynamic import: 모듈 로딩 실패 시 화면 전체가 종료되지 않도록 방어
    let ImagePicker: typeof import("expo-image-picker") | null = null;
    try {
      ImagePicker = await import("expo-image-picker");
    } catch {
      Alert.alert("사진 기능 오류", "이 기기에서 사진 기능을 사용할 수 없습니다.");
      return;
    }

    if (Platform.OS !== "web") {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("권한 필요", "카메라 사용 권한이 필요합니다.");
          return;
        }
      } catch {
        Alert.alert("권한 오류", "카메라 권한을 확인할 수 없습니다.");
        return;
      }
    }

    Alert.alert(
      "사진 선택",
      "사진을 어떻게 추가하시겠습니까?",
      [
        {
          text: "카메라 촬영",
          onPress: async () => {
            if (!ImagePicker) return;
            try {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: "images",
                quality: 0.7,
                allowsEditing: false,
              });
              if (!result.canceled && result.assets[0]) {
                await handlePhotoSelected(result.assets[0].uri, type);
              }
            } catch {
              Alert.alert("오류", "카메라를 열 수 없습니다.");
            }
          },
        },
        {
          text: "갤러리에서 선택",
          onPress: async () => {
            if (!ImagePicker) return;
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: "images",
                quality: 0.7,
                allowsEditing: false,
              });
              if (!result.canceled && result.assets[0]) {
                await handlePhotoSelected(result.assets[0].uri, type);
              }
            } catch {
              Alert.alert("오류", "갤러리를 열 수 없습니다.");
            }
          },
        },
        { text: "취소", style: "cancel" },
      ]
    );
  };

  const handlePhotoSelected = async (uri: string, type: "before" | "after") => {
    if (type === "before") {
      setBeforePhotoUri(uri);
      setUploadingBefore(true);
    } else {
      setAfterPhotoUri(uri);
      setUploadingAfter(true);
    }

    try {
      // URI → base64
      let base64: string;
      if (Platform.OS === "web") {
        // 웹: fetch로 base64 변환
        const response = await fetch(uri);
        const blob = await response.blob();
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } else {
        // dynamic import: 모듈 로딩 실패 시 업로드 건너뜀
        try {
          const FileSystem = await import("expo-file-system/legacy");
          const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          base64 = `data:image/jpeg;base64,${b64}`;
        } catch {
          Alert.alert("파일 오류", "사진 파일을 읽을 수 없습니다.");
          if (type === "before") setBeforePhotoUri(null);
          else setAfterPhotoUri(null);
          return;
        }
      }

      const result = await uploadPhotoMutation.mutateAsync({
        requestId,
        photoType: type,
        base64,
        mimeType: "image/jpeg",
      });

      if (type === "before") {
        setBeforePhotoUrl(result.url);
      } else {
        setAfterPhotoUrl(result.url);
      }
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert("업로드 실패", "사진 업로드 중 오류가 발생했습니다.");
      if (type === "before") setBeforePhotoUri(null);
      else setAfterPhotoUri(null);
    } finally {
      if (type === "before") setUploadingBefore(false);
      else setUploadingAfter(false);
    }
  };

  const saveMutation = trpc.workReport.save.useMutation({
    onSuccess: () => {
      utils.repair.listMySchedule.invalidate();
      setSaved(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("저장 완료", "작업 보고서가 저장되었습니다.");
    },
    onError: () => Alert.alert("오류", "저장 중 문제가 발생했습니다."),
  });

  const completeMutation = trpc.workReport.save.useMutation({
    onSuccess: () => {
      utils.repair.listMySchedule.invalidate();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("완료", "작업 완료 보고가 제출되었습니다.", [
        { text: "확인", onPress: () => router.back() }
      ]);
    },
    onError: () => Alert.alert("오류", "제출 중 문제가 발생했습니다."),
  });

  const revisitMutation = trpc.repair.setRevisit.useMutation({
    onSuccess: () => utils.repair.listMySchedule.invalidate(),
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
      beforePhotoUrl,
      afterPhotoUrl,
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
              beforePhotoUrl,
              afterPhotoUrl,
            });
          }
        }
      ]
    );
  };

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
        <TouchableOpacity
          style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" }}
          onPress={() => router.push(`/tech-estimate?requestId=${request.id}&customerName=${encodeURIComponent(request.customerName)}&customerPhone=${encodeURIComponent(request.phoneNumber)}` as any)}
          activeOpacity={0.8}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>현장견적</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* 고객 정보 */}
        <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.infoTitle, { color: colors.foreground }]}>{request.customerName}</Text>
          <Text style={[s.infoSub, { color: colors.muted }]}>{formatFullAddress(request)}</Text>
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

        {/* 현장 사진 */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>📸 현장 사진</Text>
          <View style={s.photoRow}>
            {/* 작업 전 사진 */}
            <View style={s.photoBox}>
              <Text style={[s.photoLabel, { color: colors.muted }]}>작업 전</Text>
              {beforePhotoUri ? (
                <View>
                  <Image source={{ uri: beforePhotoUri }} style={s.photoPreview} resizeMode="cover" />
                  {uploadingBefore && (
                    <View style={s.photoOverlay}>
                      <ActivityIndicator color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 12, marginTop: 4 }}>업로드 중...</Text>
                    </View>
                  )}
                  {beforePhotoUrl && !uploadingBefore && (
                    <View style={s.photoSuccess}>
                      <Text style={{ color: "#fff", fontSize: 11 }}>✓ 저장됨</Text>
                    </View>
                  )}
                  {!isCompleted && (
                    <TouchableOpacity style={s.photoRetake} onPress={() => pickPhoto("before")} activeOpacity={0.8}>
                      <Text style={{ color: "#fff", fontSize: 12 }}>다시 찍기</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={[s.photoPlaceholder, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => !isCompleted && pickPhoto("before")}
                  activeOpacity={isCompleted ? 1 : 0.7}
                  disabled={isCompleted}
                >
                  <Text style={{ fontSize: 28 }}>📷</Text>
                  <Text style={[s.photoPlaceholderText, { color: colors.muted }]}>
                    {isCompleted ? "사진 없음" : "사진 추가"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 작업 후 사진 */}
            <View style={s.photoBox}>
              <Text style={[s.photoLabel, { color: colors.muted }]}>작업 후</Text>
              {afterPhotoUri ? (
                <View>
                  <Image source={{ uri: afterPhotoUri }} style={s.photoPreview} resizeMode="cover" />
                  {uploadingAfter && (
                    <View style={s.photoOverlay}>
                      <ActivityIndicator color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 12, marginTop: 4 }}>업로드 중...</Text>
                    </View>
                  )}
                  {afterPhotoUrl && !uploadingAfter && (
                    <View style={s.photoSuccess}>
                      <Text style={{ color: "#fff", fontSize: 11 }}>✓ 저장됨</Text>
                    </View>
                  )}
                  {!isCompleted && (
                    <TouchableOpacity style={s.photoRetake} onPress={() => pickPhoto("after")} activeOpacity={0.8}>
                      <Text style={{ color: "#fff", fontSize: 12 }}>다시 찍기</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={[s.photoPlaceholder, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => !isCompleted && pickPhoto("after")}
                  activeOpacity={isCompleted ? 1 : 0.7}
                  disabled={isCompleted}
                >
                  <Text style={{ fontSize: 28 }}>📷</Text>
                  <Text style={[s.photoPlaceholderText, { color: colors.muted }]}>
                    {isCompleted ? "사진 없음" : "사진 추가"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
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
              disabled={saveMutation.isPending || uploadingBefore || uploadingAfter}
            >
              <Text style={s.btnText}>{saveMutation.isPending ? "저장 중..." : "임시 저장"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: "#22C55E" }]}
              onPress={handleComplete}
              activeOpacity={0.8}
              disabled={completeMutation.isPending || uploadingBefore || uploadingAfter}
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
  // 사진 관련
  photoRow: { flexDirection: "row", gap: 12 },
  photoBox: { flex: 1, gap: 6 },
  photoLabel: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  photoPlaceholder: { borderWidth: 2, borderStyle: "dashed", borderRadius: 12, height: 130, alignItems: "center", justifyContent: "center", gap: 6 },
  photoPlaceholderText: { fontSize: 13 },
  photoPreview: { width: "100%", height: 130, borderRadius: 12 },
  photoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  photoSuccess: { position: "absolute", top: 6, right: 6, backgroundColor: "#22C55E", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  photoRetake: { marginTop: 4, backgroundColor: "#6B7280", borderRadius: 8, padding: 6, alignItems: "center" },
});

// ErrorBoundary로 래핑하여 예외 발생 시 앱 전체 종료 방지 (Android/iOS 공통)
export default function WorkReportScreenWithBoundary() {
  const router = useRouter();
  return (
    <WorkReportErrorBoundary onBack={() => router.back()}>
      <WorkReportScreen />
    </WorkReportErrorBoundary>
  );
}
