import React from "react";
import { Stack, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { EstimateManager } from "@/components/estimate-manager";
import { useAppAuth } from "@/lib/auth-context";

export default function BranchEstimatesScreen() {
  const { user } = useAppAuth();
  const router = useRouter();

  if (!user || user.appRole !== "branch_manager") {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <Stack.Screen options={{ headerShown: true, title: "견적서 전송" }} />
        <Text style={{ fontSize: 44, marginBottom: 14 }}>🔒</Text>
        <Text style={{ fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 6 }}>지사 관리자 전용 화면입니다</Text>
        <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 22 }}>
          지사 관리자 계정으로 로그인해 주세요.
        </Text>
        <Pressable
          style={{ backgroundColor: "#FF6B35", paddingHorizontal: 26, paddingVertical: 13, borderRadius: 12 }}
          onPress={() => router.replace("/login")}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>로그인 화면으로</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["left", "right"]}>
      <Stack.Screen options={{ headerShown: true, title: "견적서 전송 · 관리" }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <Text style={{ fontSize: 13, color: "#6B7280" }}>
          🏢 {user.branchName ?? "우리 지사"} · 우리 지사가 전송한 견적서만 조회됩니다.
        </Text>
      </View>
      <EstimateManager role="branch" branchId={user.branchId ?? null} senderId={user.userId} />
    </ScreenContainer>
  );
}
