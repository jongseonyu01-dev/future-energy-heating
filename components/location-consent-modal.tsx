import { useState } from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/use-colors";

interface LocationConsentModalProps {
  visible: boolean;
  onConsent: () => void;
  onDecline: () => void;
}

export function LocationConsentModal({ visible, onConsent, onDecline }: LocationConsentModalProps) {
  const colors = useColors();
  const [checked, setChecked] = useState(false);

  const handleConsent = () => {
    if (!checked) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConsent();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Text style={styles.icon}>📍</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>위치정보 수집 및 제공 동의</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              고객 방문 서비스 제공을 위해 위치정보 수집에 동의해 주세요.
            </Text>
          </View>

          <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>수집 목적</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>
                고객에게 기사 이동 현황 및 예상 도착 시간을 제공하기 위해 위치정보를 수집합니다.
              </Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>수집 항목</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>GPS 위치 (위도, 경도)</Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>수집 시점</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>
                "고객 집으로 출발" 버튼을 누른 시점부터 "도착" 또는 "업무 취소" 버튼을 누를 때까지만 수집합니다.{"\n"}
                상시 추적하지 않습니다.
              </Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>제공 대상</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>
                해당 방문 건의 고객, 본사 관리자, 담당 지사장
              </Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>보유 기간</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>
                업무 종료 후 실시간 위치정보는 즉시 삭제되며, 방문 완료 기록만 보존됩니다.
              </Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: "#FFF3CD", borderColor: "#F59E0B" }]}>
              <Text style={[styles.infoTitle, { color: "#92400E" }]}>⚠️ 중요 안내</Text>
              <Text style={[styles.infoText, { color: "#78350F" }]}>
                동의하지 않으면 위치 공유 기능을 사용할 수 없습니다.{"\n"}
                단, 다른 기사 앱 기능은 정상 이용 가능합니다.
              </Text>
            </View>
          </ScrollView>

          {/* 동의 체크박스 */}
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => {
              setChecked(!checked);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, { borderColor: checked ? "#FF6B35" : colors.border }, checked && styles.checkboxChecked]}>
              {checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.checkLabel, { color: colors.foreground }]}>
              위치정보 수집 및 제공에 동의합니다.
            </Text>
          </TouchableOpacity>

          {/* 버튼 */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDecline, { borderColor: colors.border }]}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnDeclineText, { color: colors.muted }]}>동의 안함</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnConsent, !checked && styles.btnDisabled]}
              onPress={handleConsent}
              activeOpacity={checked ? 0.8 : 1}
            >
              <Text style={styles.btnConsentText}>동의하고 시작</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" },
  header: { alignItems: "center", marginBottom: 20 },
  icon: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 20 },
  contentScroll: { maxHeight: 320 },
  infoBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  infoTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  infoText: { fontSize: 13, lineHeight: 20 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "800" },
  checkLabel: { flex: 1, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  btnRow: { flexDirection: "row", gap: 12 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  btnDecline: { borderWidth: 1.5 },
  btnDeclineText: { fontSize: 15, fontWeight: "600" },
  btnConsent: { backgroundColor: "#FF6B35" },
  btnConsentText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnDisabled: { backgroundColor: "#D1D5DB" },
});
