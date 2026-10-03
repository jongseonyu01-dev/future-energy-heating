import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth, getRoleLabel } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

type Section = "main" | "changePassword" | "changePhone";

export default function MyProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, logout } = useAppAuth();
  const [section, setSection] = useState<Section>("main");

  // 비밀번호 변경 상태
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  // 전화번호 변경 상태
  const [newPhone, setNewPhone] = useState(user?.phoneNumber ?? "");
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState(false);

  const { data: notices = [] } = trpc.notice.list.useQuery(
    { branchId: user?.branchId ?? undefined },
    { enabled: !!user && section === "main" }
  );
  const { data: trainings = [] } = trpc.training.list.useQuery(undefined, {
    enabled: !!user && section === "main",
  });

  const updateProfile = trpc.auth.updateMyProfile.useMutation();

  const handleLogout = () => {
    Alert.alert("로그아웃", "로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const handleChangePassword = async () => {
    setPwError("");
    setPwSuccess(false);
    if (!currentPw) { setPwError("현재 비밀번호를 입력해주세요."); return; }
    if (newPw.length < 6) { setPwError("새 비밀번호는 6자 이상이어야 합니다."); return; }
    if (newPw !== confirmPw) { setPwError("새 비밀번호가 일치하지 않습니다."); return; }
    try {
      const res = await updateProfile.mutateAsync({ currentPassword: currentPw, newPassword: newPw });
      if (res.success) {
        setPwSuccess(true);
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
        Alert.alert("완료", "비밀번호가 변경됐습니다.", [
          { text: "확인", onPress: () => setSection("main") },
        ]);
      } else {
        setPwError(res.error ?? "비밀번호 변경에 실패했습니다.");
      }
    } catch (e: any) {
      setPwError(e?.message ?? "서버 오류가 발생했습니다.");
    }
  };

  const handleChangePhone = async () => {
    setPhoneError("");
    setPhoneSuccess(false);
    const normalized = newPhone.replace(/[^0-9]/g, "");
    if (normalized.length < 10) { setPhoneError("올바른 전화번호를 입력해주세요."); return; }
    try {
      const res = await updateProfile.mutateAsync({ phoneNumber: normalized });
      if (res.success) {
        setPhoneSuccess(true);
        Alert.alert("완료", "전화번호가 변경됐습니다.", [
          { text: "확인", onPress: () => setSection("main") },
        ]);
      } else {
        setPhoneError(res.error ?? "전화번호 변경에 실패했습니다.");
      }
    } catch (e: any) {
      setPhoneError(e?.message ?? "서버 오류가 발생했습니다.");
    }
  };

  const s = styles(colors);

  if (!user) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 16 }}>
          로그인이 필요합니다.
        </Text>
        <TouchableOpacity style={s.loginBtn} onPress={() => router.push("/login")} activeOpacity={0.8}>
          <Text style={s.loginBtnText}>로그인하기</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  // ── 비밀번호 변경 화면 ──
  if (section === "changePassword") {
    return (
      <ScreenContainer>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll}>
            <View style={s.sectionHeader}>
              <TouchableOpacity onPress={() => { setSection("main"); setPwError(""); }} style={s.backBtn}>
                <Text style={s.backBtnText}>← 뒤로</Text>
              </TouchableOpacity>
              <Text style={[s.sectionTitle2, { color: colors.foreground }]}>비밀번호 변경</Text>
            </View>

            <View style={[s.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.label, { color: colors.muted }]}>현재 비밀번호</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                secureTextEntry
                value={currentPw}
                onChangeText={setCurrentPw}
                placeholder="현재 비밀번호"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />
              <Text style={[s.label, { color: colors.muted }]}>새 비밀번호 (6자 이상)</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                secureTextEntry
                value={newPw}
                onChangeText={setNewPw}
                placeholder="새 비밀번호"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />
              <Text style={[s.label, { color: colors.muted }]}>새 비밀번호 확인</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                secureTextEntry
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="새 비밀번호 재입력"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                onSubmitEditing={handleChangePassword}
              />
              {!!pwError && <Text style={s.errorText}>{pwError}</Text>}
              {pwSuccess && <Text style={s.successText}>비밀번호가 변경됐습니다.</Text>}
            </View>

            <TouchableOpacity
              style={[s.submitBtn, updateProfile.isPending && s.disabledBtn]}
              onPress={handleChangePassword}
              activeOpacity={0.8}
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>비밀번호 변경</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  // ── 전화번호 변경 화면 ──
  if (section === "changePhone") {
    return (
      <ScreenContainer>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll}>
            <View style={s.sectionHeader}>
              <TouchableOpacity onPress={() => { setSection("main"); setPhoneError(""); }} style={s.backBtn}>
                <Text style={s.backBtnText}>← 뒤로</Text>
              </TouchableOpacity>
              <Text style={[s.sectionTitle2, { color: colors.foreground }]}>전화번호 변경</Text>
            </View>

            <View style={[s.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.label, { color: colors.muted }]}>새 전화번호</Text>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                keyboardType="phone-pad"
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="01012345678"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                onSubmitEditing={handleChangePhone}
              />
              {!!phoneError && <Text style={s.errorText}>{phoneError}</Text>}
              {phoneSuccess && <Text style={s.successText}>전화번호가 변경됐습니다.</Text>}
            </View>

            <TouchableOpacity
              style={[s.submitBtn, updateProfile.isPending && s.disabledBtn]}
              onPress={handleChangePhone}
              activeOpacity={0.8}
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>전화번호 변경</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  // ── 메인 내 정보 화면 ──
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* 프로필 카드 */}
        <View style={[s.profileCard, { backgroundColor: "#FF6B35" }]}>
          <View style={s.avatarBox}>
            <Text style={s.avatarText}>
              {user.appRole === "technician" ? "👷" : user.appRole === "branch_manager" ? "🏢" : "🏛"}
            </Text>
          </View>
          <Text style={s.roleName}>{getRoleLabel(user.appRole)}</Text>
          <Text style={s.loginId}>아이디: {user.loginId}</Text>
          {user.phoneNumber && <Text style={s.phone}>{user.phoneNumber}</Text>}
        </View>

        {/* 계정 관리 (기사 전용) */}
        {user.appRole === "technician" && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>⚙️ 계정 관리</Text>
            <TouchableOpacity
              style={[s.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setSection("changePassword")}
              activeOpacity={0.8}
            >
              <Text style={[s.menuItemText, { color: colors.foreground }]}>🔒 비밀번호 변경</Text>
              <Text style={[s.menuItemArrow, { color: colors.muted }]}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => { setNewPhone(user.phoneNumber ?? ""); setSection("changePhone"); }}
              activeOpacity={0.8}
            >
              <Text style={[s.menuItemText, { color: colors.foreground }]}>📱 전화번호 변경</Text>
              <Text style={[s.menuItemArrow, { color: colors.muted }]}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 공지사항 */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>📢 공지사항</Text>
          {notices.length === 0 ? (
            <Text style={[s.emptyText, { color: colors.muted }]}>등록된 공지사항이 없습니다.</Text>
          ) : (
            notices.slice(0, 5).map((n) => (
              <View key={n.id} style={[s.noticeItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {n.isPinned && <Text style={s.pinBadge}>📌 고정</Text>}
                <Text style={[s.noticeTitle, { color: colors.foreground }]}>{n.title}</Text>
                <Text style={[s.noticeDate, { color: colors.muted }]}>
                  {n.createdAt ? new Date(n.createdAt).toLocaleDateString("ko-KR") : ""}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* 교육 자료 */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>📚 교육 자료</Text>
          {trainings.length === 0 ? (
            <Text style={[s.emptyText, { color: colors.muted }]}>등록된 교육 자료가 없습니다.</Text>
          ) : (
            trainings.slice(0, 5).map((t) => (
              <View key={t.id} style={[s.noticeItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.noticeTitle, { color: colors.foreground }]}>{t.title}</Text>
                {t.category && <Text style={[s.noticeDate, { color: "#FF6B35" }]}>{t.category}</Text>}
              </View>
            ))
          )}
        </View>

        {/* 로그아웃 */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={s.logoutBtnText}>로그아웃</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  scroll: { paddingBottom: 32 },
  profileCard: { padding: 28, alignItems: "center", gap: 6 },
  avatarBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarText: { fontSize: 40 },
  roleName: { fontSize: 20, fontWeight: "800", color: "#fff" },
  loginId: { fontSize: 14, color: "rgba(255,255,255,0.85)" },
  phone: { fontSize: 14, color: "rgba(255,255,255,0.85)" },
  section: { padding: 16, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  sectionTitle2: { fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 8 },
  noticeItem: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 4 },
  pinBadge: { fontSize: 11, color: "#FF6B35", fontWeight: "700" },
  noticeTitle: { fontSize: 14, fontWeight: "600" },
  noticeDate: { fontSize: 12 },
  loginBtn: { backgroundColor: "#FF6B35", borderRadius: 12, padding: 14, alignItems: "center", margin: 24 },
  loginBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  logoutBtn: { margin: 16, marginTop: 8, backgroundColor: "#EF4444", borderRadius: 12, padding: 14, alignItems: "center" },
  logoutBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  // 계정 관리 메뉴
  menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, padding: 16, borderWidth: 1 },
  menuItemText: { fontSize: 15, fontWeight: "600" },
  menuItemArrow: { fontSize: 22, fontWeight: "300" },
  // 폼
  sectionHeader: { flexDirection: "row", alignItems: "center", padding: 16, paddingBottom: 8 },
  backBtn: { paddingVertical: 8, paddingRight: 12 },
  backBtnText: { color: "#FF6B35", fontSize: 15, fontWeight: "600" },
  formCard: { margin: 16, borderRadius: 16, padding: 20, borderWidth: 1, gap: 4 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 8, marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 4 },
  errorText: { color: "#EF4444", fontSize: 13, marginTop: 4 },
  successText: { color: "#22C55E", fontSize: 13, marginTop: 4 },
  submitBtn: { margin: 16, backgroundColor: "#FF6B35", borderRadius: 12, padding: 16, alignItems: "center" },
  disabledBtn: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
