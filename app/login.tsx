import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { login } = useAppAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (!data.success) {
        setError(data.error ?? "로그인에 실패했습니다.");
        return;
      }
      await login(
        {
          userId: data.userId!,
          appRole: data.appRole!,
          loginId,
          technicianId: data.technicianId ?? null,
          branchId: data.branchId ?? null,
          phoneNumber: data.phoneNumber ?? null,
        },
        loginId
      );
      router.replace("/(tabs)");
    },
    onError: () => {
      setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    },
  });

  const handleLogin = () => {
    setError("");
    if (!loginId.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 입력해주세요.");
      return;
    }
    loginMutation.mutate({ loginId: loginId.trim(), password });
  };

  // 고객은 로그인 없이 접수 가능
  const handleGuestMode = () => {
    router.replace("/(tabs)");
  };

  const s = styles(colors);

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* 로고 영역 */}
          <View style={s.header}>
            <View style={s.logoBox}>
              <Text style={s.logoText}>🔥</Text>
            </View>
            <Text style={s.title}>퓨처에너지 난방케어</Text>
            <Text style={s.subtitle}>전국 지사 통합 관리 시스템</Text>
          </View>

          {/* 로그인 폼 */}
          <View style={s.form}>
            <Text style={s.label}>아이디</Text>
            <TextInput
              style={s.input}
              value={loginId}
              onChangeText={setLoginId}
              placeholder="아이디를 입력하세요"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={s.label}>비밀번호</Text>
            <TextInput
              style={s.input}
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호를 입력하세요"
              placeholderTextColor={colors.muted}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.loginBtn, loginMutation.isPending && s.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loginMutation.isPending}
              activeOpacity={0.8}
            >
              {loginMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.loginBtnText}>로그인</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* 고객 비로그인 접수 */}
          <View style={s.guestSection}>
            <Text style={s.guestDesc}>로그인 없이도 접수 및 조회가 가능합니다</Text>
            <TouchableOpacity style={s.guestBtn} onPress={handleGuestMode} activeOpacity={0.7}>
              <Text style={s.guestBtnText}>고객 접수 바로가기 →</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.footer}>
            계정 문의: 담당 지사 또는 본사{"\n"}
            본사 대표번호: 1588-0000
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    scroll: {
      flexGrow: 1,
      padding: 24,
      justifyContent: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: 40,
    },
    logoBox: {
      width: 80,
      height: 80,
      borderRadius: 20,
      backgroundColor: "#FF6B35",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    logoText: {
      fontSize: 40,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.foreground,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
    },
    form: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.foreground,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    errorText: {
      color: colors.error,
      fontSize: 13,
      marginTop: 8,
      textAlign: "center",
    },
    loginBtn: {
      backgroundColor: "#FF6B35",
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
      marginTop: 20,
    },
    loginBtnDisabled: {
      opacity: 0.6,
    },
    loginBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
    guestSection: {
      alignItems: "center",
      marginBottom: 24,
    },
    guestDesc: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 8,
    },
    guestBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    guestBtnText: {
      fontSize: 14,
      color: "#FF6B35",
      fontWeight: "600",
    },
    footer: {
      textAlign: "center",
      fontSize: 12,
      color: colors.muted,
      lineHeight: 18,
    },
  });
