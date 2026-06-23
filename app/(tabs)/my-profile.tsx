import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth, getRoleLabel } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

export default function MyProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, logout } = useAppAuth();

  const { data: notices = [] } = trpc.notice.list.useQuery(
    { branchId: user?.branchId ?? undefined },
    { enabled: !!user }
  );
  const { data: trainings = [] } = trpc.training.list.useQuery(undefined, { enabled: !!user });

  const handleLogout = () => {
    Alert.alert("로그아웃", "로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: async () => { await logout(); router.replace("/login"); } },
    ]);
  };

  const s = styles(colors);

  if (!user) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 16 }}>로그인이 필요합니다.</Text>
        <TouchableOpacity style={s.loginBtn} onPress={() => router.push("/login")} activeOpacity={0.8}>
          <Text style={s.loginBtnText}>로그인하기</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

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
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 8 },
  noticeItem: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 4 },
  pinBadge: { fontSize: 11, color: "#FF6B35", fontWeight: "700" },
  noticeTitle: { fontSize: 14, fontWeight: "600" },
  noticeDate: { fontSize: 12 },
  loginBtn: { backgroundColor: "#FF6B35", borderRadius: 12, padding: 14, alignItems: "center", margin: 24 },
  loginBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  logoutBtn: { margin: 16, marginTop: 8, backgroundColor: "#EF4444", borderRadius: 12, padding: 14, alignItems: "center" },
  logoutBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
