import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/use-colors";

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** 비활성 시 안내 문구 */
  disabledHint?: string;
  accentColor?: string;
}

/**
 * 모달 기반 단계별 선택 드롭다운.
 * 시/도 → 시/군/구 → 동 → 아파트 선택 같은 종속 선택에 사용.
 */
export function SelectField({
  label,
  value,
  options,
  placeholder,
  onSelect,
  disabled,
  disabledHint,
  accentColor = "#E84B2F",
}: SelectFieldProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    if (disabled) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(true);
  };

  const handleSelect = (opt: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(opt);
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: disabled ? colors.background : colors.surface,
            borderColor: value ? accentColor : colors.border,
            opacity: pressed && !disabled ? 0.8 : disabled ? 0.5 : 1,
          },
        ]}
        onPress={handleOpen}
      >
        <Text
          style={[
            styles.buttonText,
            { color: value ? colors.foreground : colors.muted },
          ]}
          numberOfLines={1}
        >
          {value || (disabled && disabledHint ? disabledHint : placeholder)}
        </Text>
        <Text style={{ fontSize: 16, color: colors.muted }}>▼</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {label}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={{ fontSize: 22, color: colors.muted }}>✕</Text>
              </Pressable>
            </View>
            {options.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ color: colors.muted, fontSize: 15 }}>
                  선택 가능한 항목이 없습니다.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {options.map((opt) => {
                  const selected = opt === value;
                  return (
                    <Pressable
                      key={opt}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: selected
                            ? accentColor + "18"
                            : pressed
                            ? colors.background
                            : "transparent",
                          borderBottomColor: colors.border,
                        },
                      ]}
                      onPress={() => handleSelect(opt)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          {
                            color: selected ? accentColor : colors.foreground,
                            fontWeight: selected ? "700" : "400",
                          },
                        ]}
                      >
                        {opt}
                      </Text>
                      {selected && (
                        <Text style={{ color: accentColor, fontSize: 16 }}>✓</Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  button: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  buttonText: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  optionText: {
    fontSize: 16,
  },
  emptyBox: {
    padding: 30,
    alignItems: "center",
  },
});
