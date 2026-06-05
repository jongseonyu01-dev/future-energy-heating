import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { CalendarPicker } from "@/components/calendar-picker";

const SYMPTOMS = [
  { id: "집전체가춥다", label: "집 전체가 춥다", icon: "🥶" },
  { id: "방일부만춥다", label: "방 일부만 춥다", icon: "🌡️" },
  { id: "분배기에서물이샌다", label: "분배기에서 물이 샌다", icon: "💧" },
  { id: "온도조절기가작동하지않는다", label: "온도조절기가 작동하지 않는다", icon: "🔌" },
  { id: "난방비가많이나온다", label: "난방비가 많이 나온다", icon: "💰" },
  { id: "배관청소가필요하다", label: "배관청소가 필요하다", icon: "🚿" },
  { id: "기타문의", label: "기타 문의", icon: "❓" },
] as const;

const TIME_SLOTS = [
  "오전 9시 ~ 11시",
  "오전 11시 ~ 오후 1시",
  "오후 1시 ~ 3시",
  "오후 3시 ~ 5시",
  "오후 5시 ~ 7시",
];

type SymptomId = typeof SYMPTOMS[number]["id"];

export default function ReportScreen() {
  const colors = useColors();

  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [apartmentName, setApartmentName] = useState("");
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");
  const [symptom, setSymptom] = useState<SymptomId | null>(null);
  const [detailContent, setDetailContent] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [showTimeSlots, setShowTimeSlots] = useState(false);

  const createMutation = trpc.repair.create.useMutation({
    onSuccess: (data) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(
        "접수 완료",
        `접수번호: ${data.requestNumber}\n\n접수가 완료되었습니다.\n입력하신 휴대폰으로 접수 확인 문자가 발송되며,\n담당자가 확인 후 연락드리겠습니다.`,
        [
          {
            text: "확인",
            onPress: () => {
              setCustomerName("");
              setPhoneNumber("");
              setApartmentName("");
              setDong("");
              setHo("");
              setSymptom(null);
              setDetailContent("");
              setPreferredDate("");
              setPreferredTime("");
            },
          },
        ]
      );
    },
    onError: () => {
      Alert.alert("오류", "접수 중 오류가 발생했습니다. 다시 시도해주세요.");
    },
  });

  const handleSubmit = () => {
    if (!customerName.trim()) {
      Alert.alert("입력 오류", "고객 이름을 입력해주세요.");
      return;
    }
    if (!phoneNumber.trim() || phoneNumber.length < 9) {
      Alert.alert("입력 오류", "올바른 휴대폰 번호를 입력해주세요.");
      return;
    }
    if (!apartmentName.trim()) {
      Alert.alert("입력 오류", "아파트명을 입력해주세요.");
      return;
    }
    if (!dong.trim()) {
      Alert.alert("입력 오류", "동을 입력해주세요.");
      return;
    }
    if (!ho.trim()) {
      Alert.alert("입력 오류", "호수를 입력해주세요.");
      return;
    }
    if (!symptom) {
      Alert.alert("입력 오류", "증상을 선택해주세요.");
      return;
    }

    createMutation.mutate({
      customerName: customerName.trim(),
      phoneNumber: phoneNumber.trim(),
      apartmentName: apartmentName.trim(),
      dong: dong.trim(),
      ho: ho.trim(),
      requestType: "난방고장",
      symptom,
      detailContent: detailContent.trim() || undefined,
      preferredDate: preferredDate.trim() || undefined,
      preferredTime: preferredTime.trim() || undefined,
    });
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 헤더 */}
        <View style={[styles.pageHeader, { backgroundColor: "#E84B2F" }]}>
          <Text style={styles.pageHeaderTitle}>🔧 난방 고장 접수</Text>
          <Text style={styles.pageHeaderSubtitle}>
            접수 후 담당자가 연락드립니다
          </Text>
        </View>

        <View style={styles.formContainer}>
          {/* 고객 정보 섹션 */}
          <SectionTitle title="👤 고객 정보" />

          <InputField
            label="고객 이름 *"
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="홍길동"
            colors={colors}
          />

          <InputField
            label="휴대폰 번호 *"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            colors={colors}
          />

          {/* 주소 섹션 */}
          <SectionTitle title="🏠 주소 정보" />

          <InputField
            label="아파트명 *"
            value={apartmentName}
            onChangeText={setApartmentName}
            placeholder="예) 한강아파트"
            colors={colors}
          />

          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <InputField
                label="동 *"
                value={dong}
                onChangeText={setDong}
                placeholder="101"
                keyboardType="numeric"
                colors={colors}
              />
            </View>
            <View style={{ flex: 1 }}>
              <InputField
                label="호수 *"
                value={ho}
                onChangeText={setHo}
                placeholder="1501"
                keyboardType="numeric"
                colors={colors}
              />
            </View>
          </View>

          {/* 증상 선택 섹션 */}
          <SectionTitle title="⚠️ 증상 선택 *" />

          <View style={styles.symptomGrid}>
            {SYMPTOMS.map((s) => (
              <Pressable
                key={s.id}
                style={[
                  styles.symptomButton,
                  {
                    backgroundColor:
                      symptom === s.id ? "#E84B2F" : colors.surface,
                    borderColor:
                      symptom === s.id ? "#E84B2F" : colors.border,
                  },
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setSymptom(s.id);
                }}
              >
                <Text style={styles.symptomIcon}>{s.icon}</Text>
                <Text
                  style={[
                    styles.symptomLabel,
                    { color: symptom === s.id ? "#FFFFFF" : colors.foreground },
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* 상세 내용 */}
          <SectionTitle title="📝 상세 내용" />

          <View
            style={[
              styles.textAreaContainer,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <TextInput
              style={[styles.textArea, { color: colors.foreground }]}
              value={detailContent}
              onChangeText={setDetailContent}
              placeholder="증상에 대해 자세히 설명해주세요 (선택사항)"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* 방문 희망 일정 */}
          <SectionTitle title="📅 방문 희망 일정" />

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.foreground }]}>
              방문 희망 날짜
            </Text>
            <CalendarPicker
              value={preferredDate}
              onChange={setPreferredDate}
              placeholder="날짜를 선택하세요"
              minDate={new Date()}
            />
          </View>

          <View style={styles.timeSelectContainer}>
            <Text style={[styles.inputLabel, { color: colors.foreground }]}>
              방문 희망 시간
            </Text>
            <Pressable
              style={[
                styles.timeSelectButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setShowTimeSlots(!showTimeSlots)}
            >
              <Text
                style={[
                  styles.timeSelectText,
                  {
                    color: preferredTime ? colors.foreground : colors.muted,
                  },
                ]}
              >
                {preferredTime || "시간대를 선택해주세요"}
              </Text>
              <Text style={{ fontSize: 18 }}>
                {showTimeSlots ? "▲" : "▼"}
              </Text>
            </Pressable>

            {showTimeSlots && (
              <View
                style={[
                  styles.timeSlotList,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {TIME_SLOTS.map((slot) => (
                  <Pressable
                    key={slot}
                    style={[
                      styles.timeSlotItem,
                      {
                        backgroundColor:
                          preferredTime === slot ? "#FFF3F0" : "transparent",
                        borderBottomColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      setPreferredTime(slot);
                      setShowTimeSlots(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.timeSlotText,
                        {
                          color:
                            preferredTime === slot
                              ? "#E84B2F"
                              : colors.foreground,
                          fontWeight:
                            preferredTime === slot ? "700" : "400",
                        },
                      ]}
                    >
                      {slot}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* 제출 버튼 */}
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: createMutation.isPending
                  ? "#ccc"
                  : "#E84B2F",
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>접수 신청하기</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={styles.sectionTitle}>{title}</Text>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad" | "numeric";
  colors: any;
}) {
  return (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType || "default"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  pageHeader: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  pageHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  pageHeaderSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    marginTop: 4,
  },
  formContainer: {
    padding: 16,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1A1A1A",
    marginTop: 16,
    marginBottom: 8,
  },
  inputContainer: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  rowInputs: {
    flexDirection: "row",
    gap: 12,
  },
  symptomGrid: {
    gap: 8,
    marginBottom: 8,
  },
  symptomButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 10,
  },
  symptomIcon: {
    fontSize: 22,
  },
  symptomLabel: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
  },
  textAreaContainer: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 8,
    minHeight: 100,
  },
  textArea: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 80,
  },
  timeSelectContainer: {
    marginBottom: 12,
  },
  timeSelectButton: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeSelectText: {
    fontSize: 16,
  },
  timeSlotList: {
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 4,
    overflow: "hidden",
  },
  timeSlotItem: {
    padding: 14,
    borderBottomWidth: 0.5,
  },
  timeSlotText: {
    fontSize: 16,
  },
  submitButton: {
    height: 60,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
});
