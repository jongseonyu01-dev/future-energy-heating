import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { trpc } from "@/lib/trpc";

/**
 * 견적서 전송/관리 컴포넌트 (본사/지사 공용)
 * - role: "headquarters" | "branch"
 * - branchId: 지사일 경우 자기 지사 ID (본사는 null)
 */

type Role = "headquarters" | "branch";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "발송됨", color: "#2563EB", bg: "#EFF6FF" },
  viewed: { label: "고객확인", color: "#7C3AED", bg: "#F5F3FF" },
  approved: { label: "승인", color: "#16A34A", bg: "#F0FDF4" },
  rejected: { label: "거절", color: "#DC2626", bg: "#FEF2F2" },
  expired: { label: "만료", color: "#6B7280", bg: "#F3F4F6" },
};

function fmtMoney(v: any): string {
  const n = Number(v || 0);
  if (!n) return "0";
  return n.toLocaleString("ko-KR");
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

export function EstimateManager({
  role,
  branchId,
  senderId,
}: {
  role: Role;
  branchId: number | null;
  senderId?: number;
}) {
  const [tab, setTab] = useState<"send" | "list">("send");
  const utils = trpc.useUtils();

  // ── 전송 폼 상태 ──
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<{ uri: string; name: string; mimeType: string; size?: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  // ── 목록 필터 ──
  const [statusFilter, setStatusFilter] = useState<string>("전체");

  const listBranchId = role === "branch" ? branchId ?? null : null;
  const { data: estimates = [], isLoading: listLoading } = trpc.estimates.list.useQuery(
    { branchId: listBranchId, status: undefined },
    { enabled: tab === "list" },
  );

  const uploadMutation = trpc.estimates.uploadFile.useMutation();
  const sendMutation = trpc.estimates.send.useMutation();
  const resendMutation = trpc.estimates.resend.useMutation();

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setTitle("");
    setAmount("");
    setDescription("");
    setFile(null);
  };

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType || "application/pdf", size: a.size ?? undefined });
    } catch {
      Alert.alert("오류", "파일을 선택할 수 없습니다.");
    }
  };

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("권한 필요", "사진 접근 권한을 허용해주세요.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const name = a.fileName || `estimate_${Date.now()}.jpg`;
      const mime = a.mimeType || "image/jpeg";
      setFile({ uri: a.uri, name, mimeType: mime, size: a.fileSize ?? undefined });
    } catch {
      Alert.alert("오류", "이미지를 선택할 수 없습니다.");
    }
  };

  const handleSend = async () => {
    if (!customerName.trim()) return Alert.alert("입력 오류", "고객 이름을 입력하세요.");
    const phone = customerPhone.replace(/[^0-9]/g, "");
    if (phone.length < 9) return Alert.alert("입력 오류", "올바른 연락처를 입력하세요.");
    if (!file) return Alert.alert("입력 오류", "견적서 파일(PDF/이미지)을 첨부하세요.");

    try {
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const uploaded = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileType: file.mimeType,
        base64,
      });
      setUploading(false);

      setSending(true);
      const result = await sendMutation.mutateAsync({
        title: title.trim() || undefined,
        amount: amount ? Number(amount.replace(/[^0-9]/g, "")) : 0,
        description: description.trim() || undefined,
        customerName: customerName.trim(),
        customerPhone: phone,
        fileUrl: uploaded.fileUrl,
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        ownerType: role,
        branchId: role === "branch" ? branchId ?? undefined : undefined,
        sentBy: senderId,
        senderRole: role === "branch" ? "지사" : "본사",
      });
      setSending(false);

      if (result.success) {
        Alert.alert(
          "견적서 전송 완료",
          result.smsSent
            ? `${customerName.trim()} 고객님께 견적서 링크 문자를 발송했습니다.`
            : `견적서가 저장되었습니다.\n(문자 발송 실패: ${result.smsError || "알 수 없음"})\n링크: ${result.estimateUrl}`,
        );
        resetForm();
        utils.estimates.list.invalidate();
      }
    } catch (e: any) {
      setUploading(false);
      setSending(false);
      Alert.alert("전송 실패", e?.message || "견적서 전송 중 오류가 발생했습니다.");
    }
  };

  const handleResend = (id: number, name: string) => {
    Alert.alert("견적서 재전송", `${name} 고객님께 견적서를 다시 보내시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "재전송",
        onPress: async () => {
          try {
            const r = await resendMutation.mutateAsync({ id, senderId, senderRole: role === "branch" ? "지사" : "본사" });
            if (r.success) {
              Alert.alert("완료", r.smsSent ? "견적서를 다시 발송했습니다." : `발송 실패: ${r.smsError || "알 수 없음"}`);
              utils.estimates.list.invalidate();
            } else {
              Alert.alert("알림", r.message || "재전송할 수 없습니다.");
            }
          } catch (e: any) {
            Alert.alert("오류", e?.message || "재전송 중 오류가 발생했습니다.");
          }
        },
      },
    ]);
  };

  const filteredList = useMemo(() => {
    if (statusFilter === "전체") return estimates;
    return (estimates as any[]).filter((e) => e.status === statusFilter);
  }, [estimates, statusFilter]);

  const busy = uploading || sending;

  return (
    <View style={{ flex: 1 }}>
      {/* 서브 탭 */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        {([
          { key: "send", label: "✉️ 견적서 전송" },
          { key: "list", label: "📋 견적서 관리" },
        ] as { key: "send" | "list"; label: string }[]).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: active ? "#1D4ED8" : "#F3F4F6",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 14, color: active ? "#fff" : "#6B7280" }}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "send" ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 12, color: "#1D4ED8", lineHeight: 18 }}>
              견적서 파일(PDF·이미지)을 첨부하고 고객 연락처로 전송합니다. 고객이 링크에서 견적서를 확인 후 승인하면 자동으로 작업이 접수됩니다.
            </Text>
          </View>

          <Field label="고객 이름 *">
            <TextInput value={customerName} onChangeText={setCustomerName} placeholder="예: 홍길동" style={inputStyle} />
          </Field>
          <Field label="고객 연락처 *">
            <TextInput value={customerPhone} onChangeText={setCustomerPhone} placeholder="예: 01012345678" keyboardType="phone-pad" style={inputStyle} />
          </Field>
          <Field label="견적 제목 (선택)">
            <TextInput value={title} onChangeText={setTitle} placeholder="예: 보일러 교체 견적" style={inputStyle} />
          </Field>
          <Field label="견적 금액 (원, 선택)">
            <TextInput value={amount} onChangeText={setAmount} placeholder="예: 1500000" keyboardType="numeric" style={inputStyle} />
          </Field>
          <Field label="안내 메모 (선택)">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="고객에게 전달할 추가 안내"
              multiline
              numberOfLines={3}
              style={[inputStyle, { minHeight: 76, textAlignVertical: "top" }]}
            />
          </Field>

          <Field label="견적서 파일 (PDF/JPG/PNG) *">
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={pickPdf} activeOpacity={0.8} style={pickBtn}>
                <Text style={pickBtnText}>📄 문서 선택</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={pickBtn}>
                <Text style={pickBtnText}>🖼️ 사진 선택</Text>
              </TouchableOpacity>
            </View>
            {file && (
              <View style={{ marginTop: 8, backgroundColor: "#F0FDF4", borderRadius: 8, padding: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 13, color: "#166534" }} numberOfLines={1}>
                  ✓ {file.name}
                </Text>
                <TouchableOpacity onPress={() => setFile(null)} activeOpacity={0.7}>
                  <Text style={{ color: "#DC2626", fontWeight: "700", fontSize: 13 }}>제거</Text>
                </TouchableOpacity>
              </View>
            )}
          </Field>

          <TouchableOpacity
            onPress={handleSend}
            disabled={busy}
            activeOpacity={0.85}
            style={{ backgroundColor: busy ? "#93C5FD" : "#1D4ED8", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 4 }}
          >
            {busy ? (
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{uploading ? "파일 업로드 중..." : "전송 중..."}</Text>
              </View>
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>견적서 전송하기</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* 상태 필터 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 52 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            {["전체", "pending", "viewed", "approved", "rejected", "expired"].map((s) => {
              const active = statusFilter === s;
              const label = s === "전체" ? "전체" : STATUS_META[s]?.label ?? s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setStatusFilter(s)}
                  activeOpacity={0.8}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: active ? "#1D4ED8" : "#F3F4F6" }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : "#6B7280" }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {listLoading ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#1D4ED8" />
            </View>
          ) : filteredList.length === 0 ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>📭</Text>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>전송한 견적서가 없습니다.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
              {(filteredList as any[]).map((e) => {
                const meta = STATUS_META[e.status] ?? STATUS_META.pending;
                const canResend = e.status === "pending" || e.status === "viewed" || e.status === "expired";
                return (
                  <View key={e.id} style={{ backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E5E7EB", gap: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: "#111" }}>
                        {e.customerName} <Text style={{ fontSize: 13, color: "#6B7280", fontWeight: "500" }}>{e.customerPhone}</Text>
                      </Text>
                      <View style={{ backgroundColor: meta.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: meta.color }}>{meta.label}</Text>
                      </View>
                    </View>
                    {!!e.title && <Text style={{ fontSize: 13, color: "#374151" }}>📌 {e.title}</Text>}
                    {Number(e.amount) > 0 && <Text style={{ fontSize: 14, color: "#1D4ED8", fontWeight: "700" }}>💰 {fmtMoney(e.amount)}원</Text>}
                    {role === "headquarters" && !!e.branchName && (
                      <Text style={{ fontSize: 12, color: "#7C3AED" }}>🏢 {e.branchName}</Text>
                    )}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                      <Text style={{ fontSize: 11, color: "#9CA3AF" }}>전송 {fmtDate(e.sentAt)}</Text>
                      {!!e.viewedAt && <Text style={{ fontSize: 11, color: "#9CA3AF" }}>확인 {fmtDate(e.viewedAt)}</Text>}
                      {!!e.approvedAt && <Text style={{ fontSize: 11, color: "#16A34A" }}>승인 {fmtDate(e.approvedAt)}</Text>}
                      {!!e.rejectedAt && <Text style={{ fontSize: 11, color: "#DC2626" }}>거절 {fmtDate(e.rejectedAt)}</Text>}
                      {(e.resendCount ?? 0) > 0 && <Text style={{ fontSize: 11, color: "#9CA3AF" }}>재전송 {e.resendCount}회</Text>}
                    </View>
                    {e.status === "rejected" && !!e.rejectReason && (
                      <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 8 }}>
                        <Text style={{ fontSize: 12, color: "#B91C1C" }}>거절 사유: {e.rejectReason}</Text>
                      </View>
                    )}
                    {e.status === "approved" && (
                      <View style={{ backgroundColor: "#F0FDF4", borderRadius: 8, padding: 8, gap: 2 }}>
                        {!!e.addressFull && <Text style={{ fontSize: 12, color: "#166534" }}>📍 {e.addressFull}</Text>}
                        {(!!e.visitDate || !!e.visitTime) && (
                          <Text style={{ fontSize: 12, color: "#166534" }}>📅 {e.visitDate || "-"} {e.visitTime || ""}</Text>
                        )}
                      </View>
                    )}
                    {canResend && (
                      <TouchableOpacity
                        onPress={() => handleResend(e.id, e.customerName)}
                        activeOpacity={0.8}
                        style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: 2 }}
                      >
                        <Text style={{ color: "#1D4ED8", fontWeight: "700", fontSize: 13 }}>🔄 재전송</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: "#374151" }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  borderWidth: 1.5,
  borderColor: "#D1D5DB",
  borderRadius: 10,
  padding: 12,
  fontSize: 15,
  color: "#111",
} as const;

const pickBtn = {
  flex: 1,
  backgroundColor: "#F3F4F6",
  borderRadius: 10,
  paddingVertical: 14,
  alignItems: "center",
  borderWidth: 1.5,
  borderColor: "#D1D5DB",
  borderStyle: "dashed",
} as const;

const pickBtnText = { fontSize: 14, fontWeight: "700", color: "#374151" } as const;
