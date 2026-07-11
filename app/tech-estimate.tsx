/**
 * 기사 현장 견적서 작성 화면
 * - 단가표에서 항목 선택 → 수량 입력 → 합계 자동 계산
 * - 고객 정보 입력 후 본사/지사로 견적 보고 (SMS 알림 발송)
 * - 보고 후 내 견적 목록 조회 가능
 */
import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
  FlatList,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

type PriceItem = {
  id: number;
  category: string;
  name: string;
  stdPrice: number;
  discPrice: number;
  isActive: boolean;
};

type EstimateLineItem = {
  priceItemId: number;
  name: string;
  category: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "보고완료·검토중", color: "#D97706", bg: "#FFFBEB" },
  viewed: { label: "본사확인", color: "#7C3AED", bg: "#F5F3FF" },
  approved: { label: "고객승인", color: "#16A34A", bg: "#F0FDF4" },
  rejected: { label: "고객거절", color: "#DC2626", bg: "#FEF2F2" },
  expired: { label: "만료", color: "#6B7280", bg: "#F3F4F6" },
};

function fmtMoney(v: number): string {
  if (!v) return "0";
  return v.toLocaleString("ko-KR");
}

function fmtDate(d: any): string {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "-";
  }
}

export default function TechEstimateScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string; customerName?: string; customerPhone?: string }>();
  const { user } = useAppAuth();

  const [tab, setTab] = useState<"write" | "history">("write");

  // ── 견적서 작성 상태 ──
  const [customerName, setCustomerName] = useState(params.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(params.customerPhone ?? "");
  const [memo, setMemo] = useState("");
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [submitting, setSubmitting] = useState(false);

  // ── 단가표 조회 ──
  const { data: priceItems = [], isLoading: priceLoading } = trpc.prices.listActive.useQuery();

  // ── 내 견적 보고 목록 ──
  const technicianId = user?.technicianId ?? 0;
  const { data: myEstimates = [], isLoading: histLoading, refetch: refetchHistory } = trpc.estimates.listMyTechRequests.useQuery(
    { technicianId },
    { enabled: tab === "history" && !!technicianId },
  );

  const techRequestMutation = trpc.estimates.techRequest.useMutation();

  // ── 합계 계산 ──
  const totalAmount = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.subtotal, 0),
    [lineItems],
  );

  // ── 카테고리 목록 ──
  const categories = useMemo(() => {
    const cats = Array.from(new Set((priceItems as PriceItem[]).map((p) => p.category)));
    return ["전체", ...cats];
  }, [priceItems]);

  const filteredPrices = useMemo(() => {
    if (categoryFilter === "전체") return priceItems as PriceItem[];
    return (priceItems as PriceItem[]).filter((p) => p.category === categoryFilter);
  }, [priceItems, categoryFilter]);

  // ── 항목 추가 ──
  const addItem = (price: PriceItem) => {
    const existing = lineItems.findIndex((l) => l.priceItemId === price.id);
    if (existing >= 0) {
      const updated = [...lineItems];
      updated[existing] = {
        ...updated[existing],
        qty: updated[existing].qty + 1,
        subtotal: (updated[existing].qty + 1) * updated[existing].unitPrice,
      };
      setLineItems(updated);
    } else {
      setLineItems([
        ...lineItems,
        {
          priceItemId: price.id,
          name: price.name,
          category: price.category,
          unitPrice: price.discPrice > 0 ? price.discPrice : price.stdPrice,
          qty: 1,
          subtotal: price.discPrice > 0 ? price.discPrice : price.stdPrice,
        },
      ]);
    }
    setShowPriceModal(false);
  };

  // ── 수량 변경 ──
  const changeQty = (idx: number, val: string) => {
    const qty = Math.max(1, parseInt(val.replace(/[^0-9]/g, "") || "1", 10));
    const updated = [...lineItems];
    updated[idx] = { ...updated[idx], qty, subtotal: qty * updated[idx].unitPrice };
    setLineItems(updated);
  };

  // ── 항목 삭제 ──
  const removeItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  // ── 견적 보고 제출 ──
  const handleSubmit = async () => {
    if (!customerName.trim()) return Alert.alert("입력 오류", "고객 이름을 입력하세요.");
    const phone = customerPhone.replace(/[^0-9]/g, "");
    if (phone.length < 9) return Alert.alert("입력 오류", "올바른 고객 연락처를 입력하세요.");
    if (lineItems.length === 0) return Alert.alert("입력 오류", "견적 항목을 1개 이상 추가하세요.");
    if (!user?.technicianId) return Alert.alert("오류", "기사 계정으로 로그인해주세요.");

    Alert.alert(
      "견적 보고",
      `총 ${fmtMoney(totalAmount)}원 견적을 본사/지사에 보고하시겠습니까?\n검토 후 고객에게 발송됩니다.`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "보고하기",
          onPress: async () => {
            try {
              setSubmitting(true);
              const estimateItems = JSON.stringify(
                lineItems.map((l) => ({
                  name: l.name,
                  category: l.category,
                  qty: l.qty,
                  unitPrice: l.unitPrice,
                  subtotal: l.subtotal,
                })),
              );
              await techRequestMutation.mutateAsync({
                customerName: customerName.trim(),
                customerPhone: phone,
                title: `현장견적 - ${customerName.trim()}`,
                amount: totalAmount,
                estimateItems,
                memo: memo.trim() || undefined,
                branchId: user.branchId ?? null,
                technicianId: user.technicianId!,
                technicianName: user.name ?? "기사",
                requestId: params.requestId ? parseInt(params.requestId) : null,
              });
              setSubmitting(false);
              Alert.alert(
                "✅ 보고 완료",
                "견적이 본사/지사에 보고되었습니다.\n검토 후 고객에게 발송됩니다.",
                [
                  {
                    text: "확인",
                    onPress: () => {
                      // 폼 초기화
                      if (!params.customerName) setCustomerName("");
                      if (!params.customerPhone) setCustomerPhone("");
                      setMemo("");
                      setLineItems([]);
                      setTab("history");
                      refetchHistory();
                    },
                  },
                ],
              );
            } catch (e: any) {
              setSubmitting(false);
              Alert.alert("보고 실패", e?.message || "견적 보고 중 오류가 발생했습니다.");
            }
          },
        },
      ],
    );
  };

  const s = styles(colors);

  if (!user || user.appRole !== "technician") {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <Stack.Screen options={{ headerShown: true, title: "견적서 작성" }} />
        <Text style={{ fontSize: 44, marginBottom: 14 }}>🔒</Text>
        <Text style={{ fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 6 }}>기사 전용 화면입니다</Text>
        <TouchableOpacity
          style={{ backgroundColor: "#FF6B35", paddingHorizontal: 26, paddingVertical: 13, borderRadius: 12, marginTop: 8 }}
          onPress={() => router.replace("/login")}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>로그인 화면으로</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["left", "right"]}>
      <Stack.Screen options={{ headerShown: true, title: "현장 견적서 작성" }} />

      {/* 탭 */}
      <View style={s.tabRow}>
        {([
          { key: "write", label: "✏️ 견적 작성" },
          { key: "history", label: "📋 보고 내역" },
        ] as { key: "write" | "history"; label: string }[]).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabBtnText, tab === t.key && s.tabBtnTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "write" ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          {/* 안내 배너 */}
          <View style={s.infoBanner}>
            <Text style={s.infoBannerText}>
              📌 단가표에서 항목을 선택해 견적을 작성하고, 본사/지사에 보고하세요.{"\n"}
              검토 후 고객에게 견적서 링크가 발송됩니다.
            </Text>
          </View>

          {/* 고객 정보 */}
          <Text style={s.sectionTitle}>고객 정보</Text>
          <View style={s.card}>
            <Text style={s.fieldLabel}>고객 이름 *</Text>
            <TextInput
              style={s.input}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="예: 홍길동"
              placeholderTextColor={colors.muted}
            />
            <Text style={[s.fieldLabel, { marginTop: 12 }]}>고객 연락처 *</Text>
            <TextInput
              style={s.input}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="예: 01012345678"
              keyboardType="phone-pad"
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* 견적 항목 */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 8 }}>
            <Text style={s.sectionTitle}>견적 항목</Text>
            <TouchableOpacity
              style={s.addItemBtn}
              onPress={() => setShowPriceModal(true)}
              activeOpacity={0.8}
            >
              <Text style={s.addItemBtnText}>+ 항목 추가</Text>
            </TouchableOpacity>
          </View>

          {lineItems.length === 0 ? (
            <TouchableOpacity
              style={s.emptyItemBox}
              onPress={() => setShowPriceModal(true)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
              <Text style={{ color: colors.muted, fontSize: 14 }}>단가표에서 항목을 선택하세요</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.card}>
              {lineItems.map((item, idx) => (
                <View key={idx} style={[s.lineItemRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.lineItemName}>{item.name}</Text>
                    <Text style={s.lineItemCat}>{item.category}</Text>
                    <Text style={s.lineItemUnit}>단가: {fmtMoney(item.unitPrice)}원</Text>
                  </View>
                  <View style={s.lineItemRight}>
                    <View style={s.qtyRow}>
                      <TouchableOpacity
                        style={s.qtyBtn}
                        onPress={() => changeQty(idx, String(Math.max(1, item.qty - 1)))}
                        activeOpacity={0.7}
                      >
                        <Text style={s.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={s.qtyInput}
                        value={String(item.qty)}
                        onChangeText={(v) => changeQty(idx, v)}
                        keyboardType="numeric"
                        textAlign="center"
                      />
                      <TouchableOpacity
                        style={s.qtyBtn}
                        onPress={() => changeQty(idx, String(item.qty + 1))}
                        activeOpacity={0.7}
                      >
                        <Text style={s.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={s.lineItemSubtotal}>{fmtMoney(item.subtotal)}원</Text>
                    <TouchableOpacity onPress={() => removeItem(idx)} activeOpacity={0.7} style={{ marginTop: 4 }}>
                      <Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "600" }}>삭제</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {/* 합계 */}
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>합계</Text>
                <Text style={s.totalAmount}>{fmtMoney(totalAmount)}원</Text>
              </View>
            </View>
          )}

          {/* 메모 */}
          <Text style={[s.sectionTitle, { marginTop: 20 }]}>현장 메모 (선택)</Text>
          <View style={s.card}>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
              value={memo}
              onChangeText={setMemo}
              placeholder="현장 상황, 특이사항 등 메모"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* 제출 버튼 */}
          <TouchableOpacity
            style={[s.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={s.submitBtnText}>보고 중...</Text>
              </View>
            ) : (
              <Text style={s.submitBtnText}>
                {totalAmount > 0 ? `${fmtMoney(totalAmount)}원 · ` : ""}본사/지사에 견적 보고하기 →
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* 보고 내역 탭 */
        <View style={{ flex: 1 }}>
          {histLoading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color="#FF6B35" />
            </View>
          ) : (myEstimates as any[]).length === 0 ? (
            <View style={s.center}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>📭</Text>
              <Text style={{ color: colors.muted, fontSize: 15 }}>보고한 견적이 없습니다.</Text>
              <TouchableOpacity
                style={[s.addItemBtn, { marginTop: 16 }]}
                onPress={() => setTab("write")}
                activeOpacity={0.8}
              >
                <Text style={s.addItemBtnText}>견적 작성하기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={myEstimates as any[]}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 12 }}
              renderItem={({ item }) => {
                const meta = STATUS_META[item.status] ?? STATUS_META.pending;
                let parsedItems: any[] = [];
                try { parsedItems = JSON.parse(item.description || "[]"); } catch {}
                return (
                  <View style={s.histCard}>
                    <View style={s.histCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.histCardName}>{item.customerName}</Text>
                        <Text style={s.histCardPhone}>{item.customerPhone}</Text>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                        <Text style={[s.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    {!!item.amount && Number(item.amount) > 0 && (
                      <Text style={s.histCardAmount}>
                        💰 {fmtMoney(Number(item.amount))}원
                      </Text>
                    )}
                    {parsedItems.length > 0 && (
                      <View style={s.histItemList}>
                        {parsedItems.slice(0, 3).map((pi: any, i: number) => (
                          <Text key={i} style={s.histItemText}>
                            · {pi.name} × {pi.qty} = {fmtMoney(pi.subtotal)}원
                          </Text>
                        ))}
                        {parsedItems.length > 3 && (
                          <Text style={s.histItemText}>· 외 {parsedItems.length - 3}개 항목</Text>
                        )}
                      </View>
                    )}
                    {!!item.requestMemo && (
                      <Text style={s.histMemo}>📝 {item.requestMemo}</Text>
                    )}
                    <Text style={s.histDate}>보고: {fmtDate(item.sentAt)}</Text>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* 단가표 선택 모달 */}
      <Modal visible={showPriceModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>단가표에서 항목 선택</Text>
            <TouchableOpacity onPress={() => setShowPriceModal(false)} activeOpacity={0.7}>
              <Text style={{ fontSize: 16, color: "#6B7280", fontWeight: "600" }}>닫기</Text>
            </TouchableOpacity>
          </View>

          {/* 카테고리 필터 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 52 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[s.catChip, categoryFilter === cat && s.catChipActive]}
                onPress={() => setCategoryFilter(cat)}
                activeOpacity={0.8}
              >
                <Text style={[s.catChipText, categoryFilter === cat && s.catChipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {priceLoading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color="#FF6B35" />
            </View>
          ) : filteredPrices.length === 0 ? (
            <View style={s.center}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>등록된 단가 항목이 없습니다.</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>홈페이지 관리자에게 단가 등록을 요청하세요.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredPrices}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
              renderItem={({ item }) => {
                const inCart = lineItems.find((l) => l.priceItemId === item.id);
                return (
                  <TouchableOpacity
                    style={[s.priceCard, inCart && { borderColor: "#FF6B35", borderWidth: 2 }]}
                    onPress={() => addItem(item)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.priceCardName}>{item.name}</Text>
                      <Text style={s.priceCardCat}>{item.category}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {item.discPrice > 0 && item.discPrice < item.stdPrice ? (
                        <>
                          <Text style={s.priceCardDisc}>{fmtMoney(item.discPrice)}원</Text>
                          <Text style={s.priceCardStd}>{fmtMoney(item.stdPrice)}원</Text>
                        </>
                      ) : (
                        <Text style={s.priceCardDisc}>{fmtMoney(item.stdPrice)}원</Text>
                      )}
                      {inCart && (
                        <Text style={{ color: "#FF6B35", fontSize: 11, fontWeight: "700", marginTop: 2 }}>
                          ✓ {inCart.qty}개 추가됨
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function styles(colors: any) {
  return StyleSheet.create({
    tabRow: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 8,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: "center",
      backgroundColor: "#F3F4F6",
    },
    tabBtnActive: { backgroundColor: "#FF6B35" },
    tabBtnText: { fontWeight: "700", fontSize: 14, color: "#6B7280" },
    tabBtnTextActive: { color: "#fff" },
    infoBanner: {
      backgroundColor: "#FFF7ED",
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      borderLeftWidth: 3,
      borderLeftColor: "#FF6B35",
    },
    infoBannerText: { fontSize: 12, color: "#92400E", lineHeight: 18 },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 8 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: "600" },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.foreground,
    },
    addItemBtn: {
      backgroundColor: "#FF6B35",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    addItemBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    emptyItemBox: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 32,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
    lineItemRow: {
      flexDirection: "row",
      paddingVertical: 12,
      gap: 12,
    },
    lineItemName: { fontSize: 14, fontWeight: "700", color: colors.foreground },
    lineItemCat: { fontSize: 11, color: colors.muted, marginTop: 2 },
    lineItemUnit: { fontSize: 12, color: colors.muted, marginTop: 2 },
    lineItemRight: { alignItems: "flex-end", justifyContent: "center" },
    qtyRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    qtyBtn: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
    },
    qtyBtnText: { fontSize: 16, fontWeight: "700", color: "#374151" },
    qtyInput: {
      width: 40,
      height: 28,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      fontSize: 14,
      fontWeight: "700",
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    lineItemSubtotal: { fontSize: 14, fontWeight: "800", color: "#FF6B35", marginTop: 6 },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 12,
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    totalLabel: { fontSize: 15, fontWeight: "700", color: colors.foreground },
    totalAmount: { fontSize: 20, fontWeight: "900", color: "#FF6B35" },
    submitBtn: {
      backgroundColor: "#FF6B35",
      borderRadius: 14,
      padding: 18,
      alignItems: "center",
      marginTop: 24,
    },
    submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
    histCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    histCardTop: { flexDirection: "row", alignItems: "center" },
    histCardName: { fontSize: 15, fontWeight: "800", color: colors.foreground },
    histCardPhone: { fontSize: 12, color: colors.muted, marginTop: 2 },
    histCardAmount: { fontSize: 16, fontWeight: "800", color: "#FF6B35" },
    histItemList: { backgroundColor: colors.background, borderRadius: 8, padding: 10, gap: 3 },
    histItemText: { fontSize: 12, color: colors.muted },
    histMemo: { fontSize: 12, color: colors.muted, fontStyle: "italic" },
    histDate: { fontSize: 11, color: colors.muted, marginTop: 2 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    statusBadgeText: { fontSize: 12, fontWeight: "700" },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 17, fontWeight: "800", color: colors.foreground },
    catChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: "#F3F4F6",
    },
    catChipActive: { backgroundColor: "#FF6B35" },
    catChipText: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
    catChipTextActive: { color: "#fff" },
    priceCard: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    priceCardName: { fontSize: 14, fontWeight: "700", color: colors.foreground },
    priceCardCat: { fontSize: 11, color: colors.muted, marginTop: 2 },
    priceCardDisc: { fontSize: 15, fontWeight: "800", color: "#FF6B35" },
    priceCardStd: { fontSize: 11, color: colors.muted, textDecorationLine: "line-through" },
  });
}
