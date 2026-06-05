/**
 * 본사 관리자 전용 대시보드
 * - 모바일/웹 반응형 레이아웃
 * - 전국 지사 현황, 접수 관리, 계정 관리, 지사 설정, 자재 주문, 공지 작성
 */
import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, Alert, Platform, useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

type HQTab = "dashboard" | "requests" | "branches" | "accounts" | "sensors" | "notices" | "materials";

const TAB_LABELS: { id: HQTab; label: string; icon: string }[] = [
  { id: "dashboard", label: "대시보드", icon: "📊" },
  { id: "requests", label: "전국 접수", icon: "📋" },
  { id: "branches", label: "지사 관리", icon: "🏢" },
  { id: "accounts", label: "계정 관리", icon: "👤" },
  { id: "sensors", label: "누수센서", icon: "💧" },
  { id: "notices", label: "공지 작성", icon: "📢" },
  { id: "materials", label: "자재 주문", icon: "📦" },
];

const STATUS_COLOR: Record<string, string> = {
  "신규접수": "#6B7280", "기사배정대기": "#F59E0B", "방문예정": "#3B82F6",
  "작업진행중": "#FF6B35", "견적승인대기": "#8B5CF6", "작업완료": "#22C55E", "재방문필요": "#EF4444",
};

export default function HQAdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAppAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const [activeTab, setActiveTab] = useState<HQTab>("dashboard");

  if (!user || user.appRole !== "hq_admin") {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <Text style={{ fontSize: 48 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>본사 관리자 전용</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
            이 화면은 본사 관리자 계정으로만 접근할 수 있습니다.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: "#FF6B35", borderRadius: 12, padding: 14, paddingHorizontal: 28 }}
            onPress={() => router.push("/login")}
            activeOpacity={0.8}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>로그인하기</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const s = styles(colors, isWide);

  return (
    <ScreenContainer>
      <View style={s.layout}>
        {/* 사이드바 (웹 와이드) / 상단 탭 (모바일) */}
        {isWide ? (
          <View style={s.sidebar}>
            <View style={s.sidebarHeader}>
              <Text style={s.sidebarTitle}>🔥 퓨처에너지</Text>
              <Text style={s.sidebarSub}>본사 관리자</Text>
            </View>
            {TAB_LABELS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[s.sidebarItem, activeTab === tab.id && s.sidebarItemActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.8}
              >
                <Text style={s.sidebarIcon}>{tab.icon}</Text>
                <Text style={[s.sidebarLabel, activeTab === tab.id && s.sidebarLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabRow} contentContainerStyle={s.tabContent}>
            {TAB_LABELS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[s.tabItem, activeTab === tab.id && s.tabItemActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Text style={s.tabIcon}>{tab.icon}</Text>
                <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* 메인 콘텐츠 */}
        <View style={s.content}>
          {activeTab === "dashboard" && <HQDashboard colors={colors} />}
          {activeTab === "requests" && <HQRequests colors={colors} />}
          {activeTab === "branches" && <HQBranches colors={colors} />}
          {activeTab === "accounts" && <HQAccounts colors={colors} />}
          {activeTab === "sensors" && <HQSensors colors={colors} />}
          {activeTab === "notices" && <HQNotices colors={colors} userId={user.userId} />}
          {activeTab === "materials" && <HQMaterials colors={colors} />}
        </View>
      </View>
    </ScreenContainer>
  );
}

// ─── 대시보드 ────────────────────────────────────────────────────
function HQDashboard({ colors }: { colors: any }) {
  const { data: requests = [], isLoading } = trpc.repair.listAll.useQuery();
  const { data: branches = [] } = trpc.branch.listAll.useQuery();
  const { data: sensors = [] } = trpc.sensor.listAll.useQuery();

  const total = requests.length;
  const pending = requests.filter(r => r.status === "신규접수" || r.status === "기사배정대기").length;
  const inProgress = requests.filter(r => r.status === "방문예정" || r.status === "작업진행중").length;
  const completed = requests.filter(r => r.status === "작업완료").length;
  const revisit = requests.filter(r => r.status === "재방문필요").length;
  const leakAlert = sensors.filter(s => s.status === "누수감지").length;
  const activeBranches = branches.filter(b => b.isActive).length;

  const stats = [
    { label: "전체 접수", value: total, color: "#6B7280", bg: "#F9FAFB" },
    { label: "대기 중", value: pending, color: "#F59E0B", bg: "#FFFBEB" },
    { label: "진행 중", value: inProgress, color: "#3B82F6", bg: "#EFF6FF" },
    { label: "완료", value: completed, color: "#22C55E", bg: "#F0FDF4" },
    { label: "재방문", value: revisit, color: "#EF4444", bg: "#FEF2F2" },
    { label: "누수 경보", value: leakAlert, color: "#0284C7", bg: "#EFF6FF" },
    { label: "활성 지사", value: activeBranches, color: "#8B5CF6", bg: "#F5F3FF" },
  ];

  // 지사별 통계
  const branchStats = branches.map(b => {
    const bRequests = requests.filter(r => r.branchId === b.id);
    return {
      ...b,
      total: bRequests.length,
      completed: bRequests.filter(r => r.status === "작업완료").length,
      pending: bRequests.filter(r => r.status === "신규접수" || r.status === "기사배정대기").length,
    };
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>전국 현황</Text>

      {/* 통계 그리드 */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {stats.map((stat) => (
          <View key={stat.label} style={{ minWidth: 100, flex: 1, backgroundColor: stat.bg, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: stat.color + "30" }}>
            <Text style={{ fontSize: 26, fontWeight: "800", color: stat.color }}>{stat.value}</Text>
            <Text style={{ fontSize: 11, fontWeight: "600", color: stat.color, textAlign: "center", marginTop: 2 }}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* 지사별 현황 */}
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>지사별 현황</Text>
      {isLoading ? <ActivityIndicator color="#FF6B35" /> : (
        branchStats.length === 0 ? (
          <Text style={{ color: colors.muted, textAlign: "center", padding: 16 }}>등록된 지사가 없습니다.</Text>
        ) : (
          branchStats.map((b) => (
            <View key={b.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{b.name}</Text>
                <View style={{ backgroundColor: b.isActive ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: b.isActive ? "#22C55E" : "#EF4444" }}>{b.isActive ? "운영중" : "중지"}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, color: colors.muted }}>{b.region}</Text>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <Text style={{ fontSize: 13, color: "#6B7280" }}>전체 {b.total}건</Text>
                <Text style={{ fontSize: 13, color: "#F59E0B" }}>대기 {b.pending}건</Text>
                <Text style={{ fontSize: 13, color: "#22C55E" }}>완료 {b.completed}건</Text>
              </View>
            </View>
          ))
        )
      )}
    </ScrollView>
  );
}

// ─── 전국 접수 ────────────────────────────────────────────────────
function HQRequests({ colors }: { colors: any }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("전체");
  const [filterBranch, setFilterBranch] = useState<number | null>(null);
  const [reassignId, setReassignId] = useState<number | null>(null);
  const [targetBranchId, setTargetBranchId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: requests = [], isLoading } = trpc.repair.listAll.useQuery();
  const { data: branches = [] } = trpc.branch.listActive.useQuery();

  const reassignMutation = trpc.repair.reassignBranch.useMutation({
    onSuccess: () => { utils.repair.listAll.invalidate(); setReassignId(null); Alert.alert("완료", "지사가 재배정되었습니다."); },
  });

  const statusMutation = trpc.repair.updateStatus.useMutation({
    onSuccess: () => utils.repair.listAll.invalidate(),
  });

  const filtered = requests.filter(r => {
    const matchStatus = filterStatus === "전체" || r.status === filterStatus;
    const matchBranch = filterBranch === null || r.branchId === filterBranch;
    const matchSearch = !search || r.customerName.includes(search) || r.requestNumber.includes(search) || r.apartmentName.includes(search);
    return matchStatus && matchBranch && matchSearch;
  });

  const STATUS_TABS = ["전체", "신규접수", "기사배정대기", "방문예정", "작업진행중", "작업완료", "재방문필요"];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12, gap: 8 }}>
        <TextInput
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.foreground, backgroundColor: colors.surface }}
          value={search}
          onChangeText={setSearch}
          placeholder="고객명·접수번호·아파트 검색"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {STATUS_TABS.map(s => (
            <TouchableOpacity key={s} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 6, backgroundColor: filterStatus === s ? "#FF6B35" : colors.surface, borderWidth: 1, borderColor: filterStatus === s ? "#FF6B35" : colors.border }} onPress={() => setFilterStatus(s)} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: filterStatus === s ? "#fff" : colors.muted }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 6, backgroundColor: filterBranch === null ? "#3B82F6" : colors.surface, borderWidth: 1, borderColor: filterBranch === null ? "#3B82F6" : colors.border }} onPress={() => setFilterBranch(null)} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: filterBranch === null ? "#fff" : colors.muted }}>전체 지사</Text>
          </TouchableOpacity>
          {branches.map(b => (
            <TouchableOpacity key={b.id} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 6, backgroundColor: filterBranch === b.id ? "#3B82F6" : colors.surface, borderWidth: 1, borderColor: filterBranch === b.id ? "#3B82F6" : colors.border }} onPress={() => setFilterBranch(b.id)} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: filterBranch === b.id ? "#fff" : colors.muted }}>{b.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? <ActivityIndicator color="#FF6B35" style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>총 {filtered.length}건</Text>
          {filtered.map(r => (
            <View key={r.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ backgroundColor: STATUS_COLOR[r.status] + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS_COLOR[r.status] }}>{r.status}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.muted }}>{r.requestNumber}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{r.customerName}</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>{r.apartmentName} {r.dong}동 {r.ho}호</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: "#FF6B35", fontWeight: "600" }}>
                  {r.branchId ? branches.find(b => b.id === r.branchId)?.name ?? "지사" : "본사"}
                </Text>
                {r.technicianName && <Text style={{ fontSize: 12, color: "#3B82F6" }}>👷 {r.technicianName}</Text>}
              </View>
              {/* 재배정 */}
              {reassignId === r.id ? (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {branches.map(b => (
                      <TouchableOpacity key={b.id} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginRight: 6, backgroundColor: targetBranchId === b.id ? "#3B82F6" : colors.background, borderWidth: 1, borderColor: colors.border }} onPress={() => setTargetBranchId(b.id)} activeOpacity={0.7}>
                        <Text style={{ fontSize: 12, color: targetBranchId === b.id ? "#fff" : colors.foreground }}>{b.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: "#3B82F6", borderRadius: 8, padding: 8, alignItems: "center" }} onPress={() => { if (targetBranchId !== null) reassignMutation.mutate({ id: r.id, branchId: targetBranchId }); }} activeOpacity={0.8}>
                      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>확인</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: "#6B7280", borderRadius: 8, padding: 8, alignItems: "center" }} onPress={() => setReassignId(null)} activeOpacity={0.8}>
                      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>취소</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={{ backgroundColor: "#8B5CF6", borderRadius: 8, padding: 8, alignItems: "center", marginTop: 4 }} onPress={() => { setReassignId(r.id); setTargetBranchId(r.branchId ?? null); }} activeOpacity={0.8}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>지사 재배정</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── 지사 관리 ────────────────────────────────────────────────────
function HQBranches({ colors }: { colors: any }) {
  const [addModal, setAddModal] = useState(false);
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [region, setRegion] = useState("");
  const [managerName, setManagerName] = useState(""); const [phone, setPhone] = useState(""); const [address, setAddress] = useState("");
  const [keyword, setKeyword] = useState(""); const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: branches = [], isLoading } = trpc.branch.listAll.useQuery();
  const { data: mappings = [] } = trpc.branch.getRegionMappings.useQuery();

  const createMutation = trpc.branch.create.useMutation({
    onSuccess: () => { utils.branch.listAll.invalidate(); setAddModal(false); setName(""); setCode(""); setRegion(""); setManagerName(""); setPhone(""); setAddress(""); Alert.alert("완료", "지사가 등록되었습니다."); },
  });
  const updateMutation = trpc.branch.update.useMutation({
    onSuccess: () => utils.branch.listAll.invalidate(),
  });
  const addMappingMutation = trpc.branch.addRegionMapping.useMutation({
    onSuccess: () => { utils.branch.getRegionMappings.invalidate(); setKeyword(""); },
  });
  const deleteMappingMutation = trpc.branch.deleteRegionMapping.useMutation({
    onSuccess: () => utils.branch.getRegionMappings.invalidate(),
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>지사 목록</Text>
        <TouchableOpacity style={{ backgroundColor: "#FF6B35", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => setAddModal(true)} activeOpacity={0.8}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>+ 지사 등록</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? <ActivityIndicator color="#FF6B35" /> : branches.map(b => (
        <View key={b.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{b.name}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={{ backgroundColor: b.isActive ? "#FEF2F2" : "#F0FDF4", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }} onPress={() => updateMutation.mutate({ id: b.id, isActive: !b.isActive })} activeOpacity={0.8}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: b.isActive ? "#EF4444" : "#22C55E" }}>{b.isActive ? "중지" : "활성화"}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: colors.muted }}>{b.region}</Text>
          {b.managerName && <Text style={{ fontSize: 13, color: colors.foreground }}>관리자: {b.managerName}</Text>}
          {b.phoneNumber && <Text style={{ fontSize: 13, color: "#3B82F6" }}>📞 {b.phoneNumber}</Text>}

          {/* 지역 매핑 */}
          <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 8, gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>담당 지역 키워드</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {mappings.filter(m => m.branchId === b.id).map(m => (
                <TouchableOpacity key={m.id} style={{ backgroundColor: "#EFF6FF", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => deleteMappingMutation.mutate({ id: m.id })} activeOpacity={0.7}>
                  <Text style={{ fontSize: 12, color: "#3B82F6", fontWeight: "600" }}>{m.keyword}</Text>
                  <Text style={{ fontSize: 12, color: "#EF4444" }}>✕</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedBranchId === b.id ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 13, color: colors.foreground }} value={keyword} onChangeText={setKeyword} placeholder="예: 강남구, 서초동" placeholderTextColor={colors.muted} returnKeyType="done" />
                <TouchableOpacity style={{ backgroundColor: "#3B82F6", borderRadius: 8, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }} onPress={() => { if (keyword.trim()) addMappingMutation.mutate({ branchId: b.id, keyword: keyword.trim(), priority: 0 }); setSelectedBranchId(null); }} activeOpacity={0.8}>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>추가</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ backgroundColor: "#6B7280", borderRadius: 8, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }} onPress={() => setSelectedBranchId(null)} activeOpacity={0.8}>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>취소</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={{ backgroundColor: colors.background, borderRadius: 8, padding: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border }} onPress={() => setSelectedBranchId(b.id)} activeOpacity={0.7}>
                <Text style={{ fontSize: 12, color: colors.muted }}>+ 지역 키워드 추가</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* 지사 등록 모달 */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8, maxHeight: "90%" }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>지사 등록</Text>
            {[
              { label: "지사명 *", value: name, onChange: setName, placeholder: "예: 강남지사" },
              { label: "지사 코드 *", value: code, onChange: setCode, placeholder: "예: GN01" },
              { label: "담당 지역 *", value: region, onChange: setRegion, placeholder: "예: 서울 강남구·서초구" },
              { label: "지사장 이름", value: managerName, onChange: setManagerName, placeholder: "지사장 성함" },
              { label: "대표 전화", value: phone, onChange: setPhone, placeholder: "02-0000-0000" },
              { label: "주소", value: address, onChange: setAddress, placeholder: "지사 주소" },
            ].map(f => (
              <View key={f.label}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>{f.label}</Text>
                <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.foreground }} value={f.value} onChangeText={f.onChange} placeholder={f.placeholder} placeholderTextColor={colors.muted} />
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: "#FF6B35", borderRadius: 12, padding: 14, alignItems: "center" }} onPress={() => { if (!name.trim() || !code.trim() || !region.trim()) { Alert.alert("오류", "필수 항목을 입력해주세요."); return; } createMutation.mutate({ name, code, region, managerName: managerName || undefined, phoneNumber: phone || undefined, address: address || undefined }); }} activeOpacity={0.8} disabled={createMutation.isPending}>
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{createMutation.isPending ? "등록 중..." : "등록"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, backgroundColor: "#6B7280", borderRadius: 12, padding: 14, alignItems: "center" }} onPress={() => setAddModal(false)} activeOpacity={0.8}>
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── 계정 관리 ────────────────────────────────────────────────────
function HQAccounts({ colors }: { colors: any }) {
  const [addModal, setAddModal] = useState(false);
  const [loginId, setLoginId] = useState(""); const [password, setPassword] = useState("");
  const [appRole, setAppRole] = useState<"technician" | "branch_manager" | "hq_admin">("technician");
  const [techName, setTechName] = useState(""); const [phone, setPhone] = useState("");
  const [branchId, setBranchId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: accounts = [], isLoading } = trpc.auth.listAccounts.useQuery();
  const { data: branches = [] } = trpc.branch.listActive.useQuery();

  const createMutation = trpc.auth.createAccount.useMutation({
    onSuccess: (data) => {
      if (data.success) { utils.auth.listAccounts.invalidate(); setAddModal(false); setLoginId(""); setPassword(""); setTechName(""); setPhone(""); Alert.alert("완료", "계정이 생성되었습니다."); }
      else Alert.alert("오류", data.error ?? "계정 생성 실패");
    },
  });
  const setActiveMutation = trpc.auth.setActive.useMutation({
    onSuccess: () => utils.auth.listAccounts.invalidate(),
  });

  const ROLE_LABELS: Record<string, string> = { customer: "고객", technician: "현장 기사", branch_manager: "지사장", hq_admin: "본사 관리자" };
  const ROLE_COLORS: Record<string, string> = { customer: "#6B7280", technician: "#3B82F6", branch_manager: "#8B5CF6", hq_admin: "#FF6B35" };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>계정 목록</Text>
        <TouchableOpacity style={{ backgroundColor: "#FF6B35", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => setAddModal(true)} activeOpacity={0.8}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>+ 계정 생성</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? <ActivityIndicator color="#FF6B35" /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {accounts.filter(a => a.appRole !== "customer").map(a => (
            <View key={a.userId} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ backgroundColor: ROLE_COLORS[a.appRole] + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: ROLE_COLORS[a.appRole] }}>{ROLE_LABELS[a.appRole]}</Text>
                </View>
                <View style={{ backgroundColor: a.isActive ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: a.isActive ? "#22C55E" : "#EF4444" }}>{a.isActive ? "활성" : "정지"}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>ID: {a.loginId}</Text>
              {a.phoneNumber && <Text style={{ fontSize: 13, color: colors.muted }}>📞 {a.phoneNumber}</Text>}
              <TouchableOpacity style={{ backgroundColor: a.isActive ? "#FEF2F2" : "#F0FDF4", borderRadius: 8, padding: 8, alignItems: "center", marginTop: 4 }} onPress={() => setActiveMutation.mutate({ userId: a.userId, isActive: !a.isActive })} activeOpacity={0.8}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: a.isActive ? "#EF4444" : "#22C55E" }}>{a.isActive ? "계정 정지" : "계정 활성화"}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* 계정 생성 모달 */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ScrollView style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" }}>
            <View style={{ padding: 20, gap: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>계정 생성</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>권한</Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(["technician", "branch_manager", "hq_admin"] as const).map(r => (
                  <TouchableOpacity key={r} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: appRole === r ? "#FF6B35" : colors.surface, borderWidth: 1, borderColor: appRole === r ? "#FF6B35" : colors.border }} onPress={() => setAppRole(r)} activeOpacity={0.7}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: appRole === r ? "#fff" : colors.muted }}>{ROLE_LABELS[r]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {[
                { label: "아이디 *", value: loginId, onChange: setLoginId, placeholder: "로그인 아이디" },
                { label: "비밀번호 *", value: password, onChange: setPassword, placeholder: "초기 비밀번호", secure: true },
                { label: "전화번호", value: phone, onChange: setPhone, placeholder: "010-0000-0000" },
              ].map(f => (
                <View key={f.label}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>{f.label}</Text>
                  <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.foreground }} value={f.value} onChangeText={f.onChange} placeholder={f.placeholder} placeholderTextColor={colors.muted} secureTextEntry={f.secure} />
                </View>
              ))}
              {appRole === "technician" && (
                <>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>기사 이름 *</Text>
                  <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.foreground }} value={techName} onChangeText={setTechName} placeholder="기사 성함" placeholderTextColor={colors.muted} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>소속 지사</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {branches.map(b => (
                      <TouchableOpacity key={b.id} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 6, backgroundColor: branchId === b.id ? "#3B82F6" : colors.surface, borderWidth: 1, borderColor: branchId === b.id ? "#3B82F6" : colors.border }} onPress={() => setBranchId(b.id)} activeOpacity={0.7}>
                        <Text style={{ fontSize: 12, color: branchId === b.id ? "#fff" : colors.muted }}>{b.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: "#FF6B35", borderRadius: 12, padding: 14, alignItems: "center" }} onPress={() => { if (!loginId.trim() || !password.trim()) { Alert.alert("오류", "아이디와 비밀번호를 입력해주세요."); return; } if (appRole === "technician" && !techName.trim()) { Alert.alert("오류", "기사 이름을 입력해주세요."); return; } createMutation.mutate({ loginId, password, appRole, phoneNumber: phone || undefined, technicianName: techName || undefined, branchId: branchId ?? undefined }); }} activeOpacity={0.8} disabled={createMutation.isPending}>
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{createMutation.isPending ? "생성 중..." : "생성"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: "#6B7280", borderRadius: 12, padding: 14, alignItems: "center" }} onPress={() => setAddModal(false)} activeOpacity={0.8}>
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>취소</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── 누수센서 관제 ────────────────────────────────────────────────
function HQSensors({ colors }: { colors: any }) {
  const utils = trpc.useUtils();
  const { data: sensors = [], isLoading } = trpc.sensor.listAll.useQuery();

  const resolveMutation = trpc.sensor.resolve.useMutation({
    onSuccess: () => { utils.sensor.listAll.invalidate(); Alert.alert("완료", "처리 완료로 변경되었습니다."); },
  });

  const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
    "정상": { color: "#22C55E", bg: "#F0FDF4", icon: "✅" },
    "누수감지": { color: "#EF4444", bg: "#FEF2F2", icon: "🚨" },
    "배터리부족": { color: "#F59E0B", bg: "#FFFBEB", icon: "🔋" },
    "통신끊김": { color: "#6B7280", bg: "#F9FAFB", icon: "📡" },
    "점검필요": { color: "#8B5CF6", bg: "#F5F3FF", icon: "🔍" },
  };

  const alertSensors = sensors.filter(s => s.status !== "정상");
  const normalSensors = sensors.filter(s => s.status === "정상");

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>전국 누수센서 관제</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#EF4444" }}>{alertSensors.length}</Text>
          <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: "600" }}>경보 센서</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#22C55E" }}>{normalSensors.length}</Text>
          <Text style={{ fontSize: 11, color: "#22C55E", fontWeight: "600" }}>정상 센서</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#3B82F6" }}>{sensors.length}</Text>
          <Text style={{ fontSize: 11, color: "#3B82F6", fontWeight: "600" }}>전체</Text>
        </View>
      </View>

      {isLoading ? <ActivityIndicator color="#FF6B35" /> : sensors.map(sensor => {
        const cfg = STATUS_CONFIG[sensor.status] ?? STATUS_CONFIG["정상"];
        return (
          <View key={sensor.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: sensor.status !== "정상" ? "#FECACA" : colors.border, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ backgroundColor: cfg.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12 }}>{cfg.icon}</Text>
                <Text style={{ fontSize: 11, fontWeight: "700", color: cfg.color }}>{sensor.status}</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.muted }}>{sensor.sensorUid}</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{sensor.customerName}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{sensor.apartmentName} {sensor.dong}동 {sensor.ho}호</Text>
            {sensor.installLocation && <Text style={{ fontSize: 12, color: "#FF6B35" }}>📍 {sensor.installLocation}</Text>}
            {sensor.batteryLevel !== null && <Text style={{ fontSize: 12, color: colors.muted }}>🔋 배터리 {sensor.batteryLevel}%</Text>}
            {sensor.status !== "정상" && (
              <TouchableOpacity style={{ backgroundColor: "#22C55E", borderRadius: 8, padding: 8, alignItems: "center", marginTop: 4 }} onPress={() => resolveMutation.mutate({ id: sensor.id })} activeOpacity={0.8} disabled={resolveMutation.isPending}>
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>처리 완료</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── 공지 작성 ────────────────────────────────────────────────────
function HQNotices({ colors, userId }: { colors: any; userId: number }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false); const [targetBranchId, setTargetBranchId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: notices = [], isLoading } = trpc.notice.list.useQuery({});
  const { data: branches = [] } = trpc.branch.listActive.useQuery();

  const createMutation = trpc.notice.create.useMutation({
    onSuccess: () => { utils.notice.list.invalidate(); setTitle(""); setContent(""); setIsPinned(false); Alert.alert("완료", "공지가 등록되었습니다."); },
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>공지 작성</Text>

      {/* 작성 폼 */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>제목</Text>
        <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.foreground }} value={title} onChangeText={setTitle} placeholder="공지 제목" placeholderTextColor={colors.muted} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>내용</Text>
        <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.foreground, minHeight: 100, textAlignVertical: "top" }} value={content} onChangeText={setContent} placeholder="공지 내용을 입력하세요" placeholderTextColor={colors.muted} multiline />
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>대상 지사 (미선택 시 전체)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 6, backgroundColor: targetBranchId === null ? "#FF6B35" : colors.background, borderWidth: 1, borderColor: targetBranchId === null ? "#FF6B35" : colors.border }} onPress={() => setTargetBranchId(null)} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, color: targetBranchId === null ? "#fff" : colors.muted }}>전체</Text>
          </TouchableOpacity>
          {branches.map(b => (
            <TouchableOpacity key={b.id} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 6, backgroundColor: targetBranchId === b.id ? "#FF6B35" : colors.background, borderWidth: 1, borderColor: targetBranchId === b.id ? "#FF6B35" : colors.border }} onPress={() => setTargetBranchId(b.id)} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: targetBranchId === b.id ? "#fff" : colors.muted }}>{b.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setIsPinned(!isPinned)} activeOpacity={0.7}>
          <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: "#FF6B35", backgroundColor: isPinned ? "#FF6B35" : "transparent", alignItems: "center", justifyContent: "center" }}>
            {isPinned && <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text>}
          </View>
          <Text style={{ fontSize: 14, color: colors.foreground }}>📌 상단 고정</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ backgroundColor: "#FF6B35", borderRadius: 12, padding: 14, alignItems: "center" }} onPress={() => { if (!title.trim() || !content.trim()) { Alert.alert("오류", "제목과 내용을 입력해주세요."); return; } createMutation.mutate({ title, content, authorId: userId, targetBranchId: targetBranchId ?? undefined, isPinned }); }} activeOpacity={0.8} disabled={createMutation.isPending}>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{createMutation.isPending ? "등록 중..." : "공지 등록"}</Text>
        </TouchableOpacity>
      </View>

      {/* 기존 공지 목록 */}
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>등록된 공지</Text>
      {isLoading ? <ActivityIndicator color="#FF6B35" /> : notices.map(n => (
        <View key={n.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
          {n.isPinned && <Text style={{ fontSize: 11, color: "#FF6B35", fontWeight: "700" }}>📌 고정</Text>}
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{n.title}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>{n.createdAt ? new Date(n.createdAt).toLocaleDateString("ko-KR") : ""}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── 자재 주문 ────────────────────────────────────────────────────
function HQMaterials({ colors }: { colors: any }) {
  const utils = trpc.useUtils();
  const { data: orders = [], isLoading } = trpc.materialOrder.list.useQuery({});

  const updateMutation = trpc.materialOrder.updateStatus.useMutation({
    onSuccess: () => utils.materialOrder.list.invalidate(),
  });

  const STATUS_COLOR: Record<string, string> = {
    "신청": "#F59E0B", "승인": "#3B82F6", "발송": "#8B5CF6", "완료": "#22C55E", "반려": "#EF4444",
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>자재 주문 관리</Text>
      {isLoading ? <ActivityIndicator color="#FF6B35" /> : orders.length === 0 ? (
        <Text style={{ color: colors.muted, textAlign: "center", padding: 24 }}>자재 주문 내역이 없습니다.</Text>
      ) : orders.map(o => (
        <View key={o.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ backgroundColor: STATUS_COLOR[o.status] + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS_COLOR[o.status] }}>{o.status}</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.muted }}>{o.createdAt ? new Date(o.createdAt).toLocaleDateString("ko-KR") : ""}</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{o.orderItems}</Text>
          {o.memo && <Text style={{ fontSize: 13, color: colors.muted }}>{o.memo}</Text>}
          {o.status === "신청" && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: "#3B82F6", borderRadius: 8, padding: 8, alignItems: "center" }} onPress={() => updateMutation.mutate({ id: o.id, status: "승인" })} activeOpacity={0.8}>
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>승인</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, backgroundColor: "#EF4444", borderRadius: 8, padding: 8, alignItems: "center" }} onPress={() => updateMutation.mutate({ id: o.id, status: "반려" })} activeOpacity={0.8}>
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>반려</Text>
              </TouchableOpacity>
            </View>
          )}
          {o.status === "승인" && (
            <TouchableOpacity style={{ backgroundColor: "#8B5CF6", borderRadius: 8, padding: 8, alignItems: "center", marginTop: 4 }} onPress={() => updateMutation.mutate({ id: o.id, status: "발송" })} activeOpacity={0.8}>
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>발송 처리</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = (colors: any, isWide: boolean) => StyleSheet.create({
  layout: { flex: 1, flexDirection: isWide ? "row" : "column" },
  sidebar: { width: 220, backgroundColor: "#1A1A2E", paddingTop: 20 },
  sidebarHeader: { padding: 20, paddingBottom: 24, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  sidebarTitle: { fontSize: 16, fontWeight: "800", color: "#FF6B35" },
  sidebarSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  sidebarItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  sidebarItemActive: { backgroundColor: "rgba(255,107,53,0.15)", borderRightWidth: 3, borderRightColor: "#FF6B35" },
  sidebarIcon: { fontSize: 18 },
  sidebarLabel: { fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  sidebarLabelActive: { color: "#FF6B35" },
  tabRow: { maxHeight: 56, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
  tabContent: { paddingHorizontal: 8, alignItems: "center", gap: 4 },
  tabItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 4 },
  tabItemActive: { backgroundColor: "#FF6B35" },
  tabIcon: { fontSize: 14 },
  tabLabel: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  tabLabelActive: { color: "#fff" },
  content: { flex: 1 },
});
