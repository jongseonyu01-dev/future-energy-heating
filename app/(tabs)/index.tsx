import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useAppAuth, getRoleLabel } from "@/lib/auth-context";

// ─── 고객 메뉴 ──────────────────────────────────────────────────
const customerMenuItems = [
  { id: "report", title: "난방 고장 접수", subtitle: "고장·누수·온도조절기 이상", icon: "🔧", route: "/report", color: "#E84B2F", bg: "#FFF3F0" },
  { id: "pipe", title: "배관청소 신청", subtitle: "난방 효율 개선·배관 세척", icon: "🚿", route: "/pipe-cleaning", color: "#0EA5E9", bg: "#F0F9FF" },
  { id: "reservation", title: "방문 예약 확인", subtitle: "예약 일정·기사 정보 확인", icon: "📅", route: "/reservation", color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "result", title: "점검 결과 확인", subtitle: "작업 내용·처리 결과 조회", icon: "📋", route: "/inspection-result", color: "#16A34A", bg: "#F0FDF4" },
  { id: "leak", title: "우리 집 누수센서", subtitle: "누수·배터리·통신 상태 확인", icon: "💧", route: "/leak-sensor", color: "#0284C7", bg: "#EFF6FF" },
];

// ─── 기사 메뉴 ──────────────────────────────────────────────────
const technicianMenuItems = [
  { id: "schedule", title: "오늘 방문 일정", subtitle: "오늘 배정된 작업 확인", icon: "📅", route: "/tech-schedule", color: "#FF6B35", bg: "#FFF3F0" },
  { id: "works", title: "전체 작업 목록", subtitle: "배정된 모든 작업 조회", icon: "🔧", route: "/tech-works", color: "#0EA5E9", bg: "#F0F9FF" },
  { id: "profile", title: "내 정보", subtitle: "프로필·연락처 확인", icon: "👤", route: "/my-profile", color: "#8B5CF6", bg: "#F5F3FF" },
];

// ─── 지사장 메뉴 ────────────────────────────────────────────────
const branchManagerMenuItems = [
  { id: "dashboard", title: "지사 현황", subtitle: "접수·완료·재방문 통계", icon: "📊", route: "/branch-dashboard", color: "#FF6B35", bg: "#FFF3F0" },
  { id: "requests", title: "접수 관리", subtitle: "기사 배정·일정 변경·견적", icon: "📋", route: "/branch-requests", color: "#0EA5E9", bg: "#F0F9FF" },
  { id: "technicians", title: "기사 관리", subtitle: "소속 기사 목록·실적", icon: "👷", route: "/branch-technicians", color: "#16A34A", bg: "#F0FDF4" },
  { id: "sensor", title: "누수센서 관제", subtitle: "지사 관할 센서 상태", icon: "💧", route: "/leak-sensor", color: "#0284C7", bg: "#EFF6FF" },
  { id: "profile", title: "내 정보·공지", subtitle: "본사 공지·교육자료 확인", icon: "📢", route: "/my-profile", color: "#8B5CF6", bg: "#F5F3FF" },
];

// ─── 본사 관리자 메뉴 ────────────────────────────────────────────
const hqAdminMenuItems = [
  { id: "admin", title: "관리자 대시보드", subtitle: "전국 접수·지사 현황", icon: "🏢", route: "/hq-admin", color: "#FF6B35", bg: "#FFF3F0" },
  { id: "sensor", title: "전국 누수센서 관제", subtitle: "전국 센서 실시간 상태", icon: "💧", route: "/leak-sensor", color: "#0284C7", bg: "#EFF6FF" },
  { id: "profile", title: "내 정보·설정", subtitle: "계정 관리·SMS 설정", icon: "⚙️", route: "/my-profile", color: "#8B5CF6", bg: "#F5F3FF" },
];

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, logout } = useAppAuth();

  const role = user?.appRole ?? "customer";

  const menuItems =
    role === "technician" ? technicianMenuItems :
    role === "branch_manager" ? branchManagerMenuItems :
    role === "hq_admin" ? hqAdminMenuItems :
    customerMenuItems;

  const handlePress = (route: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(route as any);
  };

  const handleLogin = () => {
    router.push("/login");
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: "#FF6B35" }]}>
          <View style={styles.headerContent}>
            <View style={styles.logoRow}>
              <Text style={styles.logoEmoji}>🌐</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>퓨처에너지테크</Text>
                <Text style={styles.headerSubtitle}>Future Energy Tech</Text>
              </View>
              {/* 로그인/로그아웃 버튼 */}
              {user ? (
                <TouchableOpacity style={styles.authBtn} onPress={logout} activeOpacity={0.8}>
                  <Text style={styles.authBtnText}>로그아웃</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.authBtn} onPress={handleLogin} activeOpacity={0.8}>
                  <Text style={styles.authBtnText}>직원 로그인</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* 로그인 상태 표시 */}
            {user ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {getRoleLabel(user.appRole)} 모드로 접속 중
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.headerDesc}>24시간 난방 전문 서비스</Text>
                <Text style={[styles.headerDesc, { fontSize: 11, marginTop: 2, opacity: 0.75 }]}>난방 배관청소 · 분배기 수리 · 온도조절기 수리 · 각종밸브 수리</Text>
              </View>
            )}
          </View>
        </View>

        {/* 긴급 연락처 */}
        <View style={[styles.noticeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.noticeText, { color: colors.foreground }]}>
            📞 긴급 출동: <Text style={{ color: "#FF6B35", fontWeight: "700" }}>1588-0000</Text>
          </Text>
          <Text style={[styles.noticeSubText, { color: colors.muted }]}>
            평일 08:00 ~ 18:00 / 긴급출동 24시간
          </Text>
        </View>

        {/* 메인 메뉴 */}
        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.menuCard,
                { backgroundColor: item.bg, borderColor: item.color + "30", opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}
              onPress={() => handlePress(item.route)}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={[styles.menuTitle, { color: item.color }]}>{item.title}</Text>
              <Text style={[styles.menuSubtitle, { color: "#6B7280" }]}>{item.subtitle}</Text>
              <View style={[styles.menuArrow, { backgroundColor: item.color }]}>
                <Text style={styles.menuArrowText}>→</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* 하단 안내 */}
        <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>🏠 서비스 안내</Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            퓨처에너지테크는 아파트 지역난방 전문 업체로 난방 배관청소, 분배기 수리, 온도조절기 수리, 각종밸브 수리, 열량계·유량계 설치 서비스를 제공합니다.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  header: { paddingTop: 16, paddingBottom: 24, paddingHorizontal: 20 },
  headerContent: { gap: 8 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoEmoji: { fontSize: 40 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: "500" },
  headerDesc: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  authBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  authBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  roleBadge: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  roleBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  noticeBox: { marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
  noticeText: { fontSize: 16, fontWeight: "600" },
  noticeSubText: { fontSize: 13, marginTop: 4 },
  menuGrid: { padding: 16, gap: 12 },
  menuCard: { borderRadius: 16, padding: 20, borderWidth: 1.5, position: "relative", minHeight: 100 },
  menuIcon: { fontSize: 36, marginBottom: 8 },
  menuTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  menuSubtitle: { fontSize: 14, lineHeight: 20 },
  menuArrow: { position: "absolute", right: 16, top: "50%", marginTop: -16, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  menuArrowText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  infoBox: { marginHorizontal: 16, marginTop: 4, padding: 16, borderRadius: 12, borderWidth: 1, gap: 8 },
  infoTitle: { fontSize: 16, fontWeight: "700" },
  infoText: { fontSize: 14, lineHeight: 22 },
});
