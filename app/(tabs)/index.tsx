import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const menuItems = [
  {
    id: "report",
    title: "난방 고장 접수",
    subtitle: "고장·누수·온도조절기 이상",
    icon: "🔧",
    route: "/report",
    color: "#E84B2F",
    bg: "#FFF3F0",
  },
  {
    id: "pipe",
    title: "배관청소 신청",
    subtitle: "난방 효율 개선·배관 세척",
    icon: "🚿",
    route: "/pipe-cleaning",
    color: "#0EA5E9",
    bg: "#F0F9FF",
  },
  {
    id: "reservation",
    title: "방문 예약 확인",
    subtitle: "예약 일정·기사 정보 확인",
    icon: "📅",
    route: "/reservation",
    color: "#8B5CF6",
    bg: "#F5F3FF",
  },
  {
    id: "result",
    title: "점검 결과 확인",
    subtitle: "작업 내용·처리 결과 조회",
    icon: "📋",
    route: "/inspection-result",
    color: "#16A34A",
    bg: "#F0FDF4",
  },
  {
    id: "leak",
    title: "우리 집 누수센서",
    subtitle: "누수·배터리·통신 상태 확인",
    icon: "💧",
    route: "/leak-sensor",
    color: "#0284C7",
    bg: "#EFF6FF",
  },
];

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();

  const handlePress = (route: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(route as any);
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: "#E84B2F" }]}>
          <View style={styles.headerContent}>
            <View style={styles.logoRow}>
              <Text style={styles.logoEmoji}>🔥</Text>
              <View>
                <Text style={styles.headerTitle}>퓨처에너지</Text>
                <Text style={styles.headerSubtitle}>난방케어 서비스</Text>
              </View>
            </View>
            <Text style={styles.headerDesc}>
              24시간 난방 전문 서비스
            </Text>
          </View>
        </View>

        {/* 안내 문구 */}
        <View style={[styles.noticeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.noticeText, { color: colors.foreground }]}>
            📞 긴급 출동: <Text style={{ color: "#E84B2F", fontWeight: "700" }}>1588-0000</Text>
          </Text>
          <Text style={[styles.noticeSubText, { color: colors.muted }]}>
            평일 08:00 ~ 18:00 / 긴급출동 24시간
          </Text>
        </View>

        {/* 메인 메뉴 버튼 */}
        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.menuCard,
                {
                  backgroundColor: item.bg,
                  borderColor: item.color + "30",
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              onPress={() => handlePress(item.route)}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={[styles.menuTitle, { color: item.color }]}>
                {item.title}
              </Text>
              <Text style={[styles.menuSubtitle, { color: "#6B7280" }]}>
                {item.subtitle}
              </Text>
              <View style={[styles.menuArrow, { backgroundColor: item.color }]}>
                <Text style={styles.menuArrowText}>→</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* 하단 안내 */}
        <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>
            🏠 서비스 안내
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            아파트 지역난방 전문 업체로 난방 고장, 분배기 누수, 온도조절기 교체, 배관청소 서비스를 제공합니다.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    gap: 8,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoEmoji: {
    fontSize: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "500",
  },
  headerDesc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
  },
  noticeBox: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  noticeText: {
    fontSize: 16,
    fontWeight: "600",
  },
  noticeSubText: {
    fontSize: 13,
    marginTop: 4,
  },
  menuGrid: {
    padding: 16,
    gap: 12,
  },
  menuCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    position: "relative",
    minHeight: 100,
  },
  menuIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  menuArrow: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  menuArrowText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  infoBox: {
    marginHorizontal: 16,
    marginTop: 4,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
