import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useEffect } from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 64 + bottomPadding;
  const { user } = useAppAuth();

  const role = user?.appRole ?? "customer";

  const tabOptions = {
    tabBarActiveTintColor: "#FF6B35",
    headerShown: false,
    tabBarButton: HapticTab,
    tabBarStyle: {
      paddingTop: 8,
      paddingBottom: bottomPadding,
      height: tabBarHeight,
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: 0.5,
    },
    tabBarLabelStyle: {
      fontSize: 12,
      fontWeight: "600" as const,
      marginTop: 2,
    },
  };

  // 권한에 따라 탭 표시 여부 결정
  const isCustomer = role === "customer";
  const isTechnician = role === "technician";
  const isBranchManager = role === "branch_manager";
  const isHqAdmin = role === "hq_admin";
  const isStaff = isTechnician || isBranchManager || isHqAdmin;

  return (
    <Tabs screenOptions={tabOptions}>
      {/* ─── 홈 (전체 공통) ─── */}
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />

      {/* ─── 고장접수 (고객 + 비로그인) ─── */}
      <Tabs.Screen
        name="report"
        options={{
          title: "고장접수",
          href: isStaff ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="wrench.and.screwdriver.fill" color={color} />,
        }}
      />

      {/* ─── 예약확인 (고객 + 비로그인) ─── */}
      <Tabs.Screen
        name="reservation"
        options={{
          title: "예약확인",
          href: isStaff ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
        }}
      />

      {/* ─── 오늘 일정 (기사용) ─── */}
      <Tabs.Screen
        name="tech-schedule"
        options={{
          title: "오늘 일정",
          href: isTechnician ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
        }}
      />

      {/* ─── 작업 목록 (기사용) ─── */}
      <Tabs.Screen
        name="tech-works"
        options={{
          title: "작업 목록",
          href: isTechnician ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="wrench.and.screwdriver.fill" color={color} />,
        }}
      />

      {/* ─── 지사 현황 (지사장용) ─── */}
      <Tabs.Screen
        name="branch-dashboard"
        options={{
          title: "지사 현황",
          href: isBranchManager ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />

      {/* ─── 접수 관리 (지사장용) ─── */}
      <Tabs.Screen
        name="branch-requests"
        options={{
          title: "접수 관리",
          href: isBranchManager ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="wrench.and.screwdriver.fill" color={color} />,
        }}
      />

      {/* ─── 기사 관리 (지사장용) ─── */}
      <Tabs.Screen
        name="branch-technicians"
        options={{
          title: "기사 관리",
          href: isBranchManager ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />

      {/* ─── 관리자 (고객/비로그인) ─── */}
      <Tabs.Screen
        name="admin"
        options={{
          title: "관리자",
          href: isStaff ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />

      {/* ─── 내 정보 (기사/지사장/본사) ─── */}
      <Tabs.Screen
        name="my-profile"
        options={{
          title: "내 정보",
          href: isStaff ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />

      {/* ─── 숨김 탭 (라우팅 유지) ─── */}
      <Tabs.Screen name="pipe-cleaning" options={{ href: null }} />
      <Tabs.Screen name="inspection-result" options={{ href: null }} />
      <Tabs.Screen name="leak-sensor" options={{ href: null }} />
    </Tabs>
  );
}
