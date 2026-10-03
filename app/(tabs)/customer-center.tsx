import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  StyleSheet,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";

const COMPANY_INFO = {
  name: "퓨처에너지테크",
  nameEn: "Future Energy Tech",
  ceo: "유종선",
  mainPhone: "031-8042-7310",
  mobilePhone: "010-5754-7310",
  fax: "031-403-7310",
  email: "yerusun@naver.com",
  address: "안산시 단원구 원포공원1로 67, 409호",
  hours: "평일 08:00 ~ 18:00",
  emergency: "긴급 상담 가능",
};

const SERVICES = [
  { icon: "🔥", title: "난방 배관청소", desc: "난방 효율 개선을 위한 전문 배관 세척" },
  { icon: "🔧", title: "분배기 수리", desc: "분배기 누수·고장 전문 수리" },
  { icon: "🌡️", title: "온도조절기 수리", desc: "각방 온도조절기 교체 및 수리" },
  { icon: "🔩", title: "각종 밸브 수리", desc: "난방 배관 밸브 교체 및 수리" },
  { icon: "📊", title: "열량계·유량계 설치", desc: "열량계, 유량계 신규 설치 및 교체" },
];

function haptic() {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

export default function CustomerCenterScreen() {
  const colors = useColors();

  const callMain = () => {
    haptic();
    Linking.openURL(`tel:${COMPANY_INFO.mainPhone}`);
  };

  const callMobile = () => {
    haptic();
    Linking.openURL(`tel:${COMPANY_INFO.mobilePhone}`);
  };

  const sendEmail = () => {
    haptic();
    Linking.openURL(`mailto:${COMPANY_INFO.email}?subject=퓨처에너지테크 문의`);
  };

  const openMap = () => {
    haptic();
    const query = encodeURIComponent(COMPANY_INFO.address);
    if (Platform.OS === "ios") {
      Linking.openURL(`maps://?q=${query}`);
    } else {
      Linking.openURL(`https://maps.google.com/?q=${query}`);
    }
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: "#0284C7" }]}>
          <Text style={styles.headerEmoji}>🏢</Text>
          <Text style={styles.headerTitle}>{COMPANY_INFO.name}</Text>
          <Text style={styles.headerSubtitle}>{COMPANY_INFO.nameEn}</Text>
          <Text style={styles.headerDesc}>난방 전문 서비스 · 전국 지사 운영</Text>
        </View>

        {/* 연락처 카드 */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>📞 연락처</Text>

          {/* 대표전화 */}
          <TouchableOpacity style={[styles.contactRow, { borderBottomColor: colors.border }]} onPress={callMain} activeOpacity={0.75}>
            <View style={[styles.contactIcon, { backgroundColor: "#FFF3F0" }]}>
              <Text style={styles.contactIconText}>📞</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactLabel, { color: colors.muted }]}>대표전화</Text>
              <Text style={[styles.contactValue, { color: "#E84B2F" }]}>{COMPANY_INFO.mainPhone}</Text>
            </View>
            <View style={[styles.callBadge, { backgroundColor: "#E84B2F" }]}>
              <Text style={styles.callBadgeText}>전화하기</Text>
            </View>
          </TouchableOpacity>

          {/* 휴대전화 */}
          <TouchableOpacity style={[styles.contactRow, { borderBottomColor: colors.border }]} onPress={callMobile} activeOpacity={0.75}>
            <View style={[styles.contactIcon, { backgroundColor: "#EFF6FF" }]}>
              <Text style={styles.contactIconText}>📱</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactLabel, { color: colors.muted }]}>휴대전화</Text>
              <Text style={[styles.contactValue, { color: "#0284C7" }]}>{COMPANY_INFO.mobilePhone}</Text>
            </View>
            <View style={[styles.callBadge, { backgroundColor: "#0284C7" }]}>
              <Text style={styles.callBadgeText}>전화하기</Text>
            </View>
          </TouchableOpacity>

          {/* 이메일 */}
          <TouchableOpacity style={[styles.contactRow, { borderBottomColor: colors.border }]} onPress={sendEmail} activeOpacity={0.75}>
            <View style={[styles.contactIcon, { backgroundColor: "#F0FDF4" }]}>
              <Text style={styles.contactIconText}>✉️</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactLabel, { color: colors.muted }]}>이메일</Text>
              <Text style={[styles.contactValue, { color: "#16A34A" }]}>{COMPANY_INFO.email}</Text>
            </View>
            <View style={[styles.callBadge, { backgroundColor: "#16A34A" }]}>
              <Text style={styles.callBadgeText}>메일 보내기</Text>
            </View>
          </TouchableOpacity>

          {/* 팩스 */}
          <View style={[styles.contactRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.contactIcon, { backgroundColor: "#F5F3FF" }]}>
              <Text style={styles.contactIconText}>📠</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactLabel, { color: colors.muted }]}>팩스</Text>
              <Text style={[styles.contactValue, { color: colors.foreground }]}>{COMPANY_INFO.fax}</Text>
            </View>
          </View>

          {/* 주소 */}
          <TouchableOpacity style={styles.contactRow} onPress={openMap} activeOpacity={0.75}>
            <View style={[styles.contactIcon, { backgroundColor: "#FFFBEB" }]}>
              <Text style={styles.contactIconText}>📍</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactLabel, { color: colors.muted }]}>주소</Text>
              <Text style={[styles.contactValue, { color: colors.foreground }]}>{COMPANY_INFO.address}</Text>
            </View>
            <View style={[styles.callBadge, { backgroundColor: "#F59E0B" }]}>
              <Text style={styles.callBadgeText}>지도 보기</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 운영 시간 */}
        <View style={[styles.hoursBox, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
          <Text style={styles.hoursIcon}>🕐</Text>
          <View>
            <Text style={[styles.hoursTitle, { color: "#1E40AF" }]}>운영 시간</Text>
            <Text style={[styles.hoursText, { color: "#1E40AF" }]}>{COMPANY_INFO.hours} · {COMPANY_INFO.emergency}</Text>
          </View>
        </View>

        {/* 카카오톡 상담 (준비 중) */}
        <View style={[styles.kakaoBox, { backgroundColor: "#FFFDE7", borderColor: "#FDE68A" }]}>
          <Text style={styles.kakaoIcon}>💬</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kakaoTitle, { color: "#92400E" }]}>카카오톡 상담</Text>
            <Text style={[styles.kakaoText, { color: "#92400E" }]}>카카오톡 채널 연결 준비 중입니다. 곧 서비스될 예정입니다.</Text>
          </View>
          <View style={[styles.comingSoon, { backgroundColor: "#FDE68A" }]}>
            <Text style={[styles.comingSoonText, { color: "#92400E" }]}>준비 중</Text>
          </View>
        </View>

        {/* 주요 서비스 */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🛠️ 주요 서비스</Text>
          {SERVICES.map((s, i) => (
            <View key={i} style={[styles.serviceRow, i < SERVICES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Text style={styles.serviceIcon}>{s.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.serviceTitle, { color: colors.foreground }]}>{s.title}</Text>
                <Text style={[styles.serviceDesc, { color: colors.muted }]}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* 대표자 정보 */}
        <View style={[styles.ceoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.ceoTitle, { color: colors.foreground }]}>👤 대표자 정보</Text>
          <Text style={[styles.ceoText, { color: colors.muted }]}>대표: {COMPANY_INFO.ceo}</Text>
          <Text style={[styles.ceoText, { color: colors.muted }]}>사업장 주소: {COMPANY_INFO.address}</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  header: { paddingVertical: 32, paddingHorizontal: 20, alignItems: "center", gap: 4 },
  headerEmoji: { fontSize: 48, marginBottom: 4 },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFFFFF" },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: "500" },
  headerDesc: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  section: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sectionTitle: { fontSize: 16, fontWeight: "700", padding: 16, paddingBottom: 8 },
  contactRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  contactIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  contactIconText: { fontSize: 22 },
  contactInfo: { flex: 1 },
  contactLabel: { fontSize: 12, marginBottom: 2 },
  contactValue: { fontSize: 15, fontWeight: "600" },
  callBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  callBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  hoursBox: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  hoursIcon: { fontSize: 28 },
  hoursTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  hoursText: { fontSize: 13 },
  kakaoBox: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  kakaoIcon: { fontSize: 28 },
  kakaoTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  kakaoText: { fontSize: 12, lineHeight: 18 },
  comingSoon: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  comingSoonText: { fontSize: 11, fontWeight: "700" },
  serviceRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  serviceIcon: { fontSize: 26, width: 36, textAlign: "center" },
  serviceTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  serviceDesc: { fontSize: 13, lineHeight: 18 },
  ceoBox: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 12, borderWidth: 1, gap: 4 },
  ceoTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  ceoText: { fontSize: 13, lineHeight: 20 },
});
