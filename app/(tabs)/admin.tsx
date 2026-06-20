import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
  Linking,
} from "react-native";
import { useState, useCallback } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import { formatFullAddress } from "@/constants/address-data";

// 관리자 화면 탭 정의
type AdminTab = "requests" | "leak" | "technicians" | "settings";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  신규접수: { label: "신규 접수", color: "#3B82F6", bg: "#EFF6FF", icon: "📋" },
  기사배정대기: { label: "기사 배정 대기", color: "#F59E0B", bg: "#FFFBEB", icon: "⏳" },
  방문예정: { label: "방문 예정", color: "#8B5CF6", bg: "#F5F3FF", icon: "📅" },
  작업진행중: { label: "작업 진행 중", color: "#0EA5E9", bg: "#F0F9FF", icon: "🔧" },
  견적승인대기: { label: "견적 승인 대기", color: "#EAB308", bg: "#FEFCE8", icon: "💬" },
  작업완료: { label: "작업 완료", color: "#16A34A", bg: "#F0FDF4", icon: "✅" },
  재방문필요: { label: "재방문 필요", color: "#DC2626", bg: "#FEF2F2", icon: "🔄" },
};

const STATUS_LIST = [
  "전체",
  "신규접수",
  "기사배정대기",
  "방문예정",
  "작업진행중",
  "견적승인대기",
  "작업완료",
  "재방문필요",
];

type RepairRequest = {
  id: number;
  requestNumber: string;
  customerName: string;
  phoneNumber: string;
  sido?: string | null;
  sigungu?: string | null;
  eupmyeondong?: string | null;
  apartmentName: string;
  dong: string;
  ho: string;
  roadAddress?: string | null;
  requestType: string;
  symptom: string;
  detailContent: string | null;
  photoUrl: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  status: string;
  technicianId: number | null;
  technicianName: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  adminMemo: string | null;
  inspectionResult: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export default function AdminScreen() {
  const colors = useColors();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("requests");
  const [selectedStatus, setSelectedStatus] = useState("전체");
  const [selectedItem, setSelectedItem] = useState<RepairRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const verifyMutation = trpc.admin.verifyPassword.useMutation({
    onSuccess: (res) => {
      if (res.valid) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setIsLoggedIn(true);
        setPassword("");
      } else {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        Alert.alert("오류", "비밀번호가 올바르지 않습니다.");
      }
    },
    onError: () => {
      Alert.alert("오류", "로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
    },
  });

  const handleLogin = () => {
    if (!password.trim()) {
      Alert.alert("입력 오류", "비밀번호를 입력해주세요.");
      return;
    }
    verifyMutation.mutate({ password });
  };

  if (!isLoggedIn) {
    return (
      <AdminLoginScreen
        password={password}
        setPassword={setPassword}
        onLogin={handleLogin}
        isLoading={verifyMutation.isPending}
        colors={colors}
      />
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* 헤더 */}
      <View style={[styles.adminHeader, { backgroundColor: "#1A1A1A" }]}>
        <View>
          <Text style={styles.adminHeaderTitle}>⚙️ 관리자</Text>
          <Text style={styles.adminHeaderSubtitle}>퓨처에너지테크</Text>
        </View>
        <Pressable
          style={[styles.logoutButton, { borderColor: "rgba(255,255,255,0.3)" }]}
          onPress={() => {
            setIsLoggedIn(false);
            setActiveTab("requests");
          }}
        >
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </View>

      {/* 상단 탭 메뉴 */}
      <View style={[styles.adminTabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {([
          { key: "requests", label: "접수 관리", icon: "📋" },
          { key: "leak", label: "누수관제", icon: "💧" },
          { key: "technicians", label: "기사 관리", icon: "👷" },
          { key: "settings", label: "설정", icon: "⚙️" },
        ] as { key: AdminTab; label: string; icon: string }[]).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[
                styles.adminTab,
                isActive && { borderBottomColor: "#E84B2F", borderBottomWidth: 3 },
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={styles.adminTabIcon}>{tab.icon}</Text>
              <Text
                style={[
                  styles.adminTabLabel,
                  { color: isActive ? "#E84B2F" : colors.muted },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 탭 컨텐츠 */}
      {activeTab === "requests" && (
        <RequestsTab
          colors={colors}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          selectedItem={selectedItem}
          setSelectedItem={setSelectedItem}
          showDetailModal={showDetailModal}
          setShowDetailModal={setShowDetailModal}
        />
      )}
      {activeTab === "leak" && <LeakMonitorTab colors={colors} />}
      {activeTab === "technicians" && <TechniciansTab colors={colors} />}
      {activeTab === "settings" && <SettingsTab colors={colors} />}
    </ScreenContainer>
  );
}

// ─── 로그인 화면 ───────────────────────────────────────────────
function AdminLoginScreen({
  password,
  setPassword,
  onLogin,
  isLoading,
  colors,
}: {
  password: string;
  setPassword: (v: string) => void;
  onLogin: () => void;
  isLoading: boolean;
  colors: any;
}) {
  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginIcon}>🔐</Text>
          <Text style={[styles.loginTitle, { color: colors.foreground }]}>
            관리자 로그인
          </Text>
          <Text style={[styles.loginSubtitle, { color: colors.muted }]}>
            관리자 비밀번호를 입력해주세요
          </Text>

          <TextInput
            style={[
              styles.loginInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호"
            placeholderTextColor={colors.muted}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={onLogin}
          />

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              { backgroundColor: "#E84B2F", opacity: pressed || isLoading ? 0.9 : 1 },
            ]}
            onPress={onLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>로그인</Text>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

// ─── 관리자 대시보드 ───────────────────────────────────────────
function RequestsTab({
  colors,
  selectedStatus,
  setSelectedStatus,
  selectedItem,
  setSelectedItem,
  showDetailModal,
  setShowDetailModal,
}: {
  colors: any;
  selectedStatus: string;
  setSelectedStatus: (v: string) => void;
  selectedItem: RepairRequest | null;
  setSelectedItem: (v: RepairRequest | null) => void;
  showDetailModal: boolean;
  setShowDetailModal: (v: boolean) => void;
}) {
  const { data: allRequests, isLoading, refetch } = trpc.repair.listAll.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );

  const filteredRequests = allRequests?.filter((r) =>
    selectedStatus === "전체" ? true : r.status === selectedStatus
  );

  const statusCounts = allRequests?.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const handleItemPress = (item: RepairRequest) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* 상태 필터 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScroll, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_LIST.map((status) => {
          const isActive = selectedStatus === status;
          const count =
            status === "전체"
              ? allRequests?.length || 0
              : statusCounts?.[status] || 0;
          const config = STATUS_CONFIG[status];

          return (
            <Pressable
              key={status}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive
                    ? config
                      ? config.color
                      : "#1A1A1A"
                    : colors.background,
                  borderColor: isActive
                    ? config
                      ? config.color
                      : "#1A1A1A"
                    : colors.border,
                },
              ]}
              onPress={() => setSelectedStatus(status)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: isActive ? "#FFFFFF" : colors.foreground },
                ]}
              >
                {config ? config.icon + " " : ""}
                {status === "전체" ? "전체" : config?.label || status}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    styles.filterBadge,
                    { backgroundColor: isActive ? "rgba(255,255,255,0.3)" : "#E84B2F" },
                  ]}
                >
                  <Text style={styles.filterBadgeText}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 목록 */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E84B2F" />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            불러오는 중...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                해당 상태의 접수가 없습니다
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusInfo = STATUS_CONFIG[item.status];
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.listCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                onPress={() => handleItemPress(item as RepairRequest)}
              >
                <View style={styles.listCardTop}>
                  <View
                    style={[
                      styles.listStatusBadge,
                      { backgroundColor: statusInfo?.bg || "#F5F5F5" },
                    ]}
                  >
                    <Text style={styles.listStatusIcon}>
                      {statusInfo?.icon || "📋"}
                    </Text>
                    <Text
                      style={[
                        styles.listStatusText,
                        { color: statusInfo?.color || "#666" },
                      ]}
                    >
                      {statusInfo?.label || item.status}
                    </Text>
                  </View>
                  <Text style={[styles.listDate, { color: colors.muted }]}>
                    {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                  </Text>
                </View>

                <View style={styles.listCardBody}>
                  <Text style={[styles.listName, { color: colors.foreground }]}>
                    {item.customerName}
                  </Text>
                  <Text style={[styles.listAddress, { color: colors.muted }]}>
                    {formatFullAddress(item)}
                  </Text>
                  <Text style={[styles.listSymptom, { color: "#E84B2F" }]}>
                    {item.requestType} · {item.symptom.replace(/([가-힣])/g, "$1 ").trim()}
                  </Text>
                  {item.technicianName && (
                    <Text style={[styles.listTechnician, { color: colors.muted }]}>
                      👷 {item.technicianName}
                    </Text>
                  )}
                </View>

                <View style={[styles.listCardBottom, { borderTopColor: colors.border }]}>
                  <Text style={[styles.listRequestNumber, { color: colors.muted }]}>
                    {item.requestNumber}
                  </Text>
                  <Text style={[styles.listPhone, { color: colors.foreground }]}>
                    📞 {item.phoneNumber}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* 상세 모달 */}
      {selectedItem && (
        <DetailModal
          item={selectedItem}
          visible={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedItem(null);
          }}
          onUpdate={() => {
            refetch();
            setShowDetailModal(false);
            setSelectedItem(null);
          }}
          colors={colors}
        />
      )}
    </View>
  );
}

// ─── 상세 모달 ──────────────────────────────
function DetailModal({
  item,
  visible,
  onClose,
  onUpdate,
  colors,
}: {
  item: RepairRequest;
  visible: boolean;
  onClose: () => void;
  onUpdate: () => void;
  colors: any;
}) {
  const [newStatus, setNewStatus] = useState(item.status);
  const [adminMemo, setAdminMemo] = useState(item.adminMemo || "");
  const [inspectionResult, setInspectionResult] = useState(item.inspectionResult || "");
  const [scheduledDate, setScheduledDate] = useState(item.scheduledDate || "");
  const [scheduledTime, setScheduledTime] = useState(item.scheduledTime || "");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTechnicianPicker, setShowTechnicianPicker] = useState(false);

  const { data: technicians } = trpc.technicians.list.useQuery();

  const updateStatusMutation = trpc.repair.updateStatus.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "상태가 변경되었습니다.");
      onUpdate();
    },
  });

  const assignMutation = trpc.repair.assignTechnician.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "기사가 배정되었습니다.");
      onUpdate();
    },
  });

  const updateScheduleMutation = trpc.repair.updateSchedule.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "방문 일정이 변경되었습니다.");
      onUpdate();
    },
  });

  const updateResultMutation = trpc.repair.updateInspectionResult.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "점검 결과가 등록되었습니다.");
      onUpdate();
    },
  });

  const handleStatusUpdate = () => {
    updateStatusMutation.mutate({
      id: item.id,
      status: newStatus as any,
      adminMemo: adminMemo || undefined,
    });
  };

  const handleAssignTechnician = (tech: { id: number; name: string }) => {
    setShowTechnicianPicker(false);
    assignMutation.mutate({
      id: item.id,
      technicianId: tech.id,
      technicianName: tech.name,
      scheduledDate: scheduledDate || undefined,
      scheduledTime: scheduledTime || undefined,
    });
  };

  const handleUpdateSchedule = () => {
    if (!scheduledDate || !scheduledTime) {
      Alert.alert("입력 오류", "날짜와 시간을 모두 입력해주세요.");
      return;
    }
    updateScheduleMutation.mutate({
      id: item.id,
      scheduledDate,
      scheduledTime,
    });
  };

  const handleUpdateResult = () => {
    if (!inspectionResult.trim()) {
      Alert.alert("입력 오류", "점검 결과를 입력해주세요.");
      return;
    }
    updateResultMutation.mutate({
      id: item.id,
      inspectionResult: inspectionResult.trim(),
    });
  };

  const statusInfo = STATUS_CONFIG[item.status];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* 모달 헤더 */}
        <View style={[styles.modalHeader, { backgroundColor: "#1A1A1A", borderBottomColor: colors.border }]}>
          <Text style={styles.modalTitle}>접수 상세 정보</Text>
          <Pressable style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={styles.modalCloseText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 현재 상태 */}
          <View style={[styles.modalStatusBadge, { backgroundColor: statusInfo?.bg || "#F5F5F5" }]}>
            <Text style={styles.modalStatusIcon}>{statusInfo?.icon || "📋"}</Text>
            <Text style={[styles.modalStatusText, { color: statusInfo?.color || "#666" }]}>
              현재 상태: {statusInfo?.label || item.status}
            </Text>
          </View>

          {/* 기본 정보 */}
          <SectionCard title="📋 접수 정보" colors={colors}>
            <InfoRow label="접수번호" value={item.requestNumber} />
            <InfoRow label="접수 유형" value={item.requestType} />
            <InfoRow label="접수일" value={new Date(item.createdAt).toLocaleDateString("ko-KR")} />
          </SectionCard>

          {/* 고객 정보 */}
          <SectionCard title="👤 고객 정보" colors={colors}>
            <InfoRow label="이름" value={item.customerName} />
            <InfoRow label="전화번호" value={item.phoneNumber} />
            <InfoRow label="주소" value={formatFullAddress(item)} />
          </SectionCard>

          {/* 증상 정보 */}
          <SectionCard title="⚠️ 증상 정보" colors={colors}>
            <InfoRow label="증상" value={item.symptom} />
            {item.detailContent && (
              <View style={styles.detailContentBox}>
                <Text style={[styles.detailContentLabel, { color: colors.muted }]}>
                  상세 내용
                </Text>
                <Text style={[styles.detailContentText, { color: colors.foreground }]}>
                  {item.detailContent}
                </Text>
              </View>
            )}
          </SectionCard>

          {/* 방문 일정 관리 */}
          <SectionCard title="📅 방문 일정 관리" colors={colors}>
            {item.preferredDate && (
              <InfoRow label="희망 방문일" value={item.preferredDate} />
            )}
            {item.preferredTime && (
              <InfoRow label="희망 시간" value={item.preferredTime} />
            )}

            <View style={styles.scheduleInputs}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                  확정 방문일
                </Text>
                <TextInput
                  style={[styles.smallInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={scheduledDate}
                  onChangeText={setScheduledDate}
                  placeholder="2024-06-10"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                  확정 시간
                </Text>
                <TextInput
                  style={[styles.smallInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={scheduledTime}
                  onChangeText={setScheduledTime}
                  placeholder="오전 10시"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: "#8B5CF6", opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleUpdateSchedule}
            >
              <Text style={styles.actionButtonText}>방문 일정 저장</Text>
            </Pressable>
          </SectionCard>

          {/* 기사 배정 */}
          <SectionCard title="👷 기사 배정" colors={colors}>
            {item.technicianName && (
              <View style={[styles.currentTechBox, { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" }]}>
                <Text style={styles.currentTechText}>
                  현재 배정: {item.technicianName}
                </Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: "#0EA5E9", opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => setShowTechnicianPicker(true)}
            >
              <Text style={styles.actionButtonText}>
                {item.technicianName ? "기사 변경" : "기사 배정"}
              </Text>
            </Pressable>

            {/* 기사 선택 목록 */}
            {showTechnicianPicker && (
              <View style={[styles.techPickerList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {technicians?.map((tech) => (
                  <Pressable
                    key={tech.id}
                    style={[styles.techPickerItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleAssignTechnician(tech)}
                  >
                    <Text style={[styles.techPickerName, { color: colors.foreground }]}>
                      👷 {tech.name}
                    </Text>
                    {tech.phoneNumber && (
                      <Text style={[styles.techPickerPhone, { color: colors.muted }]}>
                        {tech.phoneNumber}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </SectionCard>

          {/* 처리 상태 변경 */}
          <SectionCard title="🔄 처리 상태 변경" colors={colors}>
            <Pressable
              style={[
                styles.statusSelector,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => setShowStatusPicker(!showStatusPicker)}
            >
              <Text style={[styles.statusSelectorText, { color: colors.foreground }]}>
                {STATUS_CONFIG[newStatus]?.icon} {STATUS_CONFIG[newStatus]?.label || newStatus}
              </Text>
              <Text style={{ fontSize: 18 }}>{showStatusPicker ? "▲" : "▼"}</Text>
            </Pressable>

            {showStatusPicker && (
              <View style={[styles.statusPickerList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <Pressable
                    key={key}
                    style={[
                      styles.statusPickerItem,
                      {
                        backgroundColor: newStatus === key ? config.bg : "transparent",
                        borderBottomColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      setNewStatus(key);
                      setShowStatusPicker(false);
                    }}
                  >
                    <Text style={styles.statusPickerIcon}>{config.icon}</Text>
                    <Text style={[styles.statusPickerText, { color: config.color }]}>
                      {config.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.memoContainer}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                관리자 메모
              </Text>
              <TextInput
                style={[
                  styles.memoInput,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
                ]}
                value={adminMemo}
                onChangeText={setAdminMemo}
                placeholder="관리자 메모를 입력하세요 (선택사항)"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: "#E84B2F", opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleStatusUpdate}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.actionButtonText}>상태 저장</Text>
              )}
            </Pressable>
          </SectionCard>

          {/* 점검 결과 등록 */}
          <SectionCard title="📝 점검 결과 등록" colors={colors}>
            {item.inspectionResult && (
              <View style={[styles.existingResult, { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" }]}>
                <Text style={styles.existingResultLabel}>기존 결과</Text>
                <Text style={styles.existingResultText}>{item.inspectionResult}</Text>
              </View>
            )}

            <TextInput
              style={[
                styles.resultInput,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
              ]}
              value={inspectionResult}
              onChangeText={setInspectionResult}
              placeholder="점검 결과 및 작업 내용을 입력하세요"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: "#16A34A", opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleUpdateResult}
              disabled={updateResultMutation.isPending}
            >
              {updateResultMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.actionButtonText}>점검 결과 저장 (작업완료 처리)</Text>
              )}
            </Pressable>
          </SectionCard>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── 공통 컴포넌트 ─────────────────────────────────────────────
function SectionCard({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: any;
}) {
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={styles.sectionCardContent}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ─── 기사 관리 탭 ──────────────────────────
type Technician = {
  id: number;
  name: string;
  phoneNumber: string | null;
  specialty: string | null;
  isActive: boolean;
  createdAt: Date;
};

function TechniciansTab({ colors }: { colors: any }) {
  const { data: technicians, isLoading, refetch } =
    trpc.technicians.listAll.useQuery();
  const [showFormModal, setShowFormModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Technician | null>(null);

  const setActiveMutation = trpc.technicians.setActive.useMutation({
    onSuccess: () => refetch(),
  });

  const openCreate = () => {
    setEditTarget(null);
    setShowFormModal(true);
  };

  const openEdit = (tech: Technician) => {
    setEditTarget(tech);
    setShowFormModal(true);
  };

  const handleToggleActive = (tech: Technician) => {
    setActiveMutation.mutate({ id: tech.id, isActive: !tech.isActive });
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.techTopBar}>
        <Text style={[styles.techTopBarText, { color: colors.foreground }]}>
          등록 기사 {technicians?.length || 0}명
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.techAddButton,
            { backgroundColor: "#E84B2F", opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={openCreate}
        >
          <Text style={styles.techAddButtonText}>+ 기사 등록</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E84B2F" />
        </View>
      ) : (
        <FlatList
          data={technicians as Technician[] | undefined}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👷</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                등록된 기사가 없습니다{"\n"}상단 버튼으로 기사를 등록하세요
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.techCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: item.isActive ? 1 : 0.55,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.techCardNameRow}>
                  <Text style={[styles.techCardName, { color: colors.foreground }]}>
                    👷 {item.name}
                  </Text>
                  <View
                    style={[
                      styles.techStatusPill,
                      {
                        backgroundColor: item.isActive ? "#F0FDF4" : "#F3F4F6",
                        borderColor: item.isActive ? "#86EFAC" : "#D1D5DB",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: item.isActive ? "#16A34A" : "#9CA3AF",
                      }}
                    >
                      {item.isActive ? "활성" : "비활성"}
                    </Text>
                  </View>
                </View>
                {item.phoneNumber ? (
                  <Text style={[styles.techCardSub, { color: colors.muted }]}>
                    📞 {item.phoneNumber}
                  </Text>
                ) : null}
                {item.specialty ? (
                  <Text style={[styles.techCardSub, { color: colors.muted }]}>
                    🔧 {item.specialty}
                  </Text>
                ) : null}
              </View>
              <View style={styles.techCardActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.techSmallBtn,
                    { borderColor: "#0EA5E9", opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => openEdit(item)}
                >
                  <Text style={{ color: "#0EA5E9", fontWeight: "700", fontSize: 13 }}>
                    수정
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.techSmallBtn,
                    {
                      borderColor: item.isActive ? "#DC2626" : "#16A34A",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  onPress={() => handleToggleActive(item)}
                >
                  <Text
                    style={{
                      color: item.isActive ? "#DC2626" : "#16A34A",
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    {item.isActive ? "비활성" : "활성화"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {showFormModal && (
        <TechnicianFormModal
          visible={showFormModal}
          editTarget={editTarget}
          colors={colors}
          onClose={() => setShowFormModal(false)}
          onSaved={() => {
            refetch();
            setShowFormModal(false);
          }}
        />
      )}
    </View>
  );
}

// ─── 기사 등록/수정 모달 ────────────────────
function TechnicianFormModal({
  visible,
  editTarget,
  colors,
  onClose,
  onSaved,
}: {
  visible: boolean;
  editTarget: Technician | null;
  colors: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editTarget?.name || "");
  const [phoneNumber, setPhoneNumber] = useState(editTarget?.phoneNumber || "");
  const [specialty, setSpecialty] = useState(editTarget?.specialty || "");

  const createMutation = trpc.technicians.create.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "기사가 등록되었습니다.");
      onSaved();
    },
  });
  const updateMutation = trpc.technicians.update.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "기사 정보가 수정되었습니다.");
      onSaved();
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("입력 오류", "기사 이름을 입력해주세요.");
      return;
    }
    if (editTarget) {
      updateMutation.mutate({
        id: editTarget.id,
        name: name.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        specialty: specialty.trim() || undefined,
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        specialty: specialty.trim() || undefined,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.formModalOverlay}>
        <View style={[styles.formModalCard, { backgroundColor: colors.background }]}>
          <Text style={[styles.formModalTitle, { color: colors.foreground }]}>
            {editTarget ? "기사 정보 수정" : "새 기사 등록"}
          </Text>

          <Text style={[styles.inputLabel, { color: colors.foreground }]}>이름 *</Text>
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            value={name}
            onChangeText={setName}
            placeholder="기사 이름"
            placeholderTextColor={colors.muted}
          />

          <Text style={[styles.inputLabel, { color: colors.foreground }]}>연락처</Text>
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="010-0000-0000"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
          />

          <Text style={[styles.inputLabel, { color: colors.foreground }]}>전문분야</Text>
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            value={specialty}
            onChangeText={setSpecialty}
            placeholder="예: 분배기/배관, 온도조절기"
            placeholderTextColor={colors.muted}
          />

          <View style={styles.formModalButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.formCancelBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.formCancelText, { color: colors.muted }]}>취소</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.formSaveBtn,
                { backgroundColor: "#E84B2F", opacity: pressed || isPending ? 0.85 : 1 },
              ]}
              onPress={handleSave}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.formSaveText}>저장</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── 누수센서 관제 탭 ────────────────────────────
const SENSOR_STATUS_CFG: Record<
  string,
  { label: string; color: string; bg: string; icon: string }
> = {
  정상: { label: "정상", color: "#16A34A", bg: "#F0FDF4", icon: "✅" },
  누수감지: { label: "누수 감지", color: "#DC2626", bg: "#FEF2F2", icon: "🚨" },
  배터리부족: { label: "배터리 부족", color: "#F59E0B", bg: "#FFFBEB", icon: "🔋" },
  통신끊김: { label: "통신 끊김", color: "#6B7280", bg: "#F3F4F6", icon: "📡" },
  점검필요: { label: "점검 필요", color: "#8B5CF6", bg: "#F5F3FF", icon: "🛠️" },
};

function sensorDateTime(value: any): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LeakMonitorTab({ colors }: { colors: any }) {
  const { data: sensors, isLoading, refetch } = trpc.sensor.listAll.useQuery(
    undefined,
    { refetchInterval: 20000 }
  );
  const { data: technicians } = trpc.technicians.list.useQuery();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pickerId, setPickerId] = useState<number | null>(null);
  const [memoMap, setMemoMap] = useState<Record<number, string>>({});

  const triggerMutation = trpc.sensor.triggerLeakTest.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        const smsMsg =
          res.sms && (res.sms as any).skipped
            ? "\n(SMS 미설정 상태로 발송은 건너뛰었습니다)"
            : "\n고객과 관리자에게 문자가 발송되었습니다.";
        Alert.alert("누수 감지 테스트", "누수 감지 상태로 변경되었습니다." + smsMsg);
        refetch();
      } else {
        Alert.alert("오류", res.error || "테스트 처리 중 문제가 발생했습니다.");
      }
    },
    onError: () => Alert.alert("오류", "테스트 처리 중 문제가 발생했습니다."),
  });

  const assignMutation = trpc.sensor.assignTechnician.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "기사가 배정되었습니다.");
      setPickerId(null);
      refetch();
    },
    onError: () => Alert.alert("오류", "기사 배정 중 문제가 발생했습니다."),
  });

  const resolveMutation = trpc.sensor.resolve.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "처리 완료로 변경되었습니다.");
      refetch();
    },
    onError: () => Alert.alert("오류", "처리 중 문제가 발생했습니다."),
  });

  const memoMutation = trpc.sensor.updateMemo.useMutation({
    onSuccess: () => {
      Alert.alert("완료", "처리 메모가 저장되었습니다.");
      refetch();
    },
    onError: () => Alert.alert("오류", "메모 저장 중 문제가 발생했습니다."),
  });

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleTest = (id: number, name: string) => {
    const confirmMsg = `'${name}' 센서를 누수 감지 상태로 변경하고 문자를 발송합니다. 진행할까요?`;
    // 웹 미리보기에서는 Alert.alert의 버튼 콜백이 동작하지 않으므로 window.confirm 사용
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(confirmMsg)) {
        triggerMutation.mutate({ id });
      }
      return;
    }
    Alert.alert("누수 감지 테스트", confirmMsg, [
      { text: "취소", style: "cancel" },
      {
        text: "실행",
        style: "destructive",
        onPress: () => triggerMutation.mutate({ id }),
      },
    ]);
  };

  const list = sensors ?? [];
  // 통계 집계
  const stats = {
    total: list.length,
    정상: list.filter((s) => s.status === "정상").length,
    누수감지: list.filter((s) => s.status === "누수감지").length,
    배터리부족: list.filter((s) => s.status === "배터리부족").length,
    통신끊김: list.filter((s) => s.status === "통신끊김").length,
    점검필요: list.filter((s) => s.status === "점검필요").length,
  };

  // 누수 감지 우선 정렬
  const sorted = [...list].sort((a, b) => {
    if (a.status === "누수감지" && b.status !== "누수감지") return -1;
    if (a.status !== "누수감지" && b.status === "누수감지") return 1;
    return 0;
  });

  const statCards = [
    { key: "total", label: "전체 센서", value: stats.total, color: "#1A1A1A", bg: colors.surface },
    { key: "정상", label: "정상", value: stats.정상, color: "#16A34A", bg: "#F0FDF4" },
    { key: "누수감지", label: "누수 감지", value: stats.누수감지, color: "#DC2626", bg: "#FEF2F2" },
    { key: "배터리부족", label: "배터리 부족", value: stats.배터리부족, color: "#F59E0B", bg: "#FFFBEB" },
    { key: "통신끊김", label: "통신 끊김", value: stats.통신끊김, color: "#6B7280", bg: "#F3F4F6" },
    { key: "점검필요", label: "점검 필요", value: stats.점검필요, color: "#8B5CF6", bg: "#F5F3FF" },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={[styles.loadingText, { color: colors.muted }]}>
          센서 정보를 불러오는 중...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* 통계 카드 그리드 */}
      <View style={styles.statGrid}>
        {statCards.map((c) => (
          <View
            key={c.key}
            style={[
              styles.statCard,
              { backgroundColor: c.bg, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.statValue, { color: c.color }]}>{c.value}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{c.label}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.leakListTitle, { color: colors.foreground }]}>
        설치 센서 목록 ({sorted.length})
      </Text>

      {sorted.length === 0 && (
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.emptyIcon}>💧</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            등록된 센서가 없습니다
          </Text>
        </View>
      )}

      {sorted.map((sensor) => {
        const cfg = SENSOR_STATUS_CFG[sensor.status] || SENSOR_STATUS_CFG["정상"];
        const isLeaking = sensor.status === "누수감지";
        const expanded = expandedId === sensor.id;
        const addr = `${sensor.apartmentName}${sensor.dong ? ` ${sensor.dong}동` : ""} ${sensor.ho}호`;
        return (
          <View
            key={sensor.id}
            style={[
              styles.leakCard,
              {
                backgroundColor: isLeaking ? "#FEF2F2" : colors.surface,
                borderColor: isLeaking ? "#DC2626" : colors.border,
                borderWidth: isLeaking ? 2 : 1,
              },
            ]}
          >
            {/* 상단 요약 (탭하여 펼치기) */}
            <Pressable
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              onPress={() => setExpandedId(expanded ? null : sensor.id)}
            >
              <View style={styles.leakCardHeader}>
                <View style={[styles.leakStatusPill, { backgroundColor: cfg.color }]}>
                  <Text style={styles.leakStatusPillText}>
                    {cfg.icon} {cfg.label}
                  </Text>
                </View>
                <Text style={[styles.leakExpandHint, { color: colors.muted }]}>
                  {expanded ? "접기 ▲" : "상세 ▼"}
                </Text>
              </View>
              <Text style={[styles.leakCustomer, { color: colors.foreground }]}>
                {sensor.customerName} · {addr}
              </Text>
              <Text style={[styles.leakSensorInfo, { color: colors.muted }]}>
                {sensor.sensorName} ({sensor.installLocation})
              </Text>
              {isLeaking && sensor.leakDetectedAt && (
                <Text style={styles.leakDetectedTime}>
                  🚨 감지: {sensorDateTime(sensor.leakDetectedAt)}
                </Text>
              )}
            </Pressable>

            {/* 상세 (펼침) */}
            {expanded && (
              <View style={styles.leakDetailBox}>
                <View style={[styles.leakDivider, { backgroundColor: colors.border }]} />
                <LeakInfoRow label="고객 이름" value={sensor.customerName} colors={colors} />
                <LeakInfoRow label="휴대폰" value={sensor.phoneNumber} colors={colors} />
                <LeakInfoRow label="아파트" value={sensor.apartmentName} colors={colors} />
                <LeakInfoRow label="동/호" value={sensor.dong ? `${sensor.dong}동 ${sensor.ho}호` : `${sensor.ho}호`} colors={colors} />
                <LeakInfoRow label="센서 이름" value={sensor.sensorName} colors={colors} />
                <LeakInfoRow label="설치 위치" value={sensor.installLocation} colors={colors} />
                <LeakInfoRow label="배터리" value={`${sensor.batteryLevel}%`} colors={colors} />
                <LeakInfoRow label="마지막 통신" value={sensorDateTime(sensor.lastCommAt)} colors={colors} />
                <LeakInfoRow label="감지 시간" value={sensorDateTime(sensor.leakDetectedAt)} colors={colors} />
                {sensor.technicianName && (
                  <LeakInfoRow label="배정 기사" value={sensor.technicianName} colors={colors} />
                )}
                {sensor.adminMemo && (
                  <LeakInfoRow label="처리 메모" value={sensor.adminMemo} colors={colors} />
                )}

                {/* 처리 메모 입력 */}
                <TextInput
                  style={[
                    styles.leakMemoInput,
                    { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
                  ]}
                  value={memoMap[sensor.id] ?? ""}
                  onChangeText={(t) => setMemoMap((m) => ({ ...m, [sensor.id]: t }))}
                  placeholder="처리 메모를 입력하세요"
                  placeholderTextColor={colors.muted}
                  multiline
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.leakMemoSaveBtn,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => {
                    const memo = memoMap[sensor.id];
                    if (!memo || !memo.trim()) {
                      Alert.alert("입력 오류", "메모를 입력해주세요.");
                      return;
                    }
                    memoMutation.mutate({ id: sensor.id, adminMemo: memo.trim() });
                  }}
                >
                  <Text style={[styles.leakMemoSaveText, { color: colors.foreground }]}>💾 메모 저장</Text>
                </Pressable>

                {/* 기사 배정 선택 목록 */}
                {pickerId === sensor.id && (
                  <View style={[styles.techPickerList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    {technicians && technicians.length > 0 ? (
                      technicians.map((tech) => (
                        <Pressable
                          key={tech.id}
                          style={[styles.techPickerItem, { borderBottomColor: colors.border }]}
                          onPress={() =>
                            assignMutation.mutate({
                              id: sensor.id,
                              technicianId: tech.id,
                              technicianName: tech.name,
                            })
                          }
                        >
                          <Text style={[styles.techPickerName, { color: colors.foreground }]}>
                            👷 {tech.name}
                          </Text>
                          {tech.phoneNumber && (
                            <Text style={[styles.techPickerPhone, { color: colors.muted }]}>
                              {tech.phoneNumber}
                            </Text>
                          )}
                        </Pressable>
                      ))
                    ) : (
                      <Text style={{ color: colors.muted, padding: 12 }}>
                        등록된 활성 기사가 없습니다. 기사 관리에서 추가해주세요.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* 액션 버튼 */}
            <View style={styles.leakActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.leakActionBtn,
                  { backgroundColor: "#0284C7", opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={() => handleCall(sensor.phoneNumber)}
              >
                <Text style={styles.leakActionText}>📞 전화</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.leakActionBtn,
                  { backgroundColor: "#8B5CF6", opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={() => setPickerId(pickerId === sensor.id ? null : sensor.id)}
              >
                <Text style={styles.leakActionText}>👷 기사배정</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.leakActionBtn,
                  { backgroundColor: "#16A34A", opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={() =>
                  resolveMutation.mutate({ id: sensor.id, adminMemo: memoMap[sensor.id]?.trim() || undefined })
                }
              >
                <Text style={styles.leakActionText}>✅ 처리완료</Text>
              </Pressable>
            </View>

            {/* 누수 감지 테스트 버튼 */}
            <Pressable
              style={({ pressed }) => [
                styles.leakTestBtn,
                { opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => handleTest(sensor.id, sensor.sensorName)}
            >
              <Text style={styles.leakTestText}>🧪 누수 감지 테스트</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function LeakInfoRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={styles.leakInfoRow}>
      <Text style={[styles.leakInfoLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.leakInfoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

// ─── 설정 탭 ────────────────────────────
function SettingsTab({ colors }: { colors: any }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: smsStatus } = trpc.admin.smsStatus.useQuery();

  const changePwMutation = trpc.admin.changePassword.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        Alert.alert("완료", "비밀번호가 변경되었습니다.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        Alert.alert("오류", res.error || "현재 비밀번호가 올바르지 않습니다.");
      }
    },
    onError: () => {
      Alert.alert("오류", "비밀번호 변경 중 문제가 발생했습니다.");
    },
  });

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("입력 오류", "모든 항목을 입력해주세요.");
      return;
    }
    if (newPassword.length < 4) {
      Alert.alert("입력 오류", "새 비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("입력 오류", "새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    changePwMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.settingsContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* 비밀번호 변경 */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>
          🔑 관리자 비밀번호 변경
        </Text>
        <View style={styles.sectionCardContent}>
          <Text style={[styles.inputLabel, { color: colors.foreground }]}>현재 비밀번호</Text>
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="현재 비밀번호"
            placeholderTextColor={colors.muted}
            secureTextEntry
          />
          <Text style={[styles.inputLabel, { color: colors.foreground }]}>새 비밀번호</Text>
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="새 비밀번호 (4자 이상)"
            placeholderTextColor={colors.muted}
            secureTextEntry
          />
          <Text style={[styles.inputLabel, { color: colors.foreground }]}>새 비밀번호 확인</Text>
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="새 비밀번호 다시 입력"
            placeholderTextColor={colors.muted}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleChangePassword}
          />
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: "#E84B2F", marginTop: 4, opacity: pressed || changePwMutation.isPending ? 0.85 : 1 },
            ]}
            onPress={handleChangePassword}
            disabled={changePwMutation.isPending}
          >
            {changePwMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>비밀번호 변경</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* SMS 알림 상태 */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionCardTitle, { color: colors.foreground }]}>
          📩 SMS 알림 연동 상태
        </Text>
        <View style={styles.sectionCardContent}>
          <View
            style={[
              styles.smsStatusBox,
              {
                backgroundColor: smsStatus?.configured ? "#F0FDF4" : "#FEF2F2",
                borderColor: smsStatus?.configured ? "#86EFAC" : "#FECACA",
              },
            ]}
          >
            <Text style={{ fontSize: 22 }}>{smsStatus?.configured ? "✅" : "⚠️"}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: smsStatus?.configured ? "#16A34A" : "#DC2626",
                }}
              >
                {smsStatus?.configured ? "알림 발송 활성화됨" : "알림 발송 비활성"}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 19 }}>
                {smsStatus?.configured
                  ? "접수 및 상태 변경 시 고객에게 자동으로 문자가 발송됩니다."
                  : "Solapi 자격증명을 등록하면 자동 문자 발송이 활성화됩니다."}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={[styles.settingsFooter, { color: colors.muted }]}>
        퓨처에너지테크 관리자 설정
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // 로그인
  loginContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loginCard: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 16,
  },
  loginIcon: {
    fontSize: 56,
  },
  loginTitle: {
    fontSize: 26,
    fontWeight: "800",
  },
  loginSubtitle: {
    fontSize: 15,
    textAlign: "center",
  },
  loginInput: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 4,
  },
  loginButton: {
    width: "100%",
    height: 60,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },

  // 관리자 헤더
  adminHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  adminHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  adminHeaderSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  logoutText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "600",
  },

  // 필터
  filterScroll: {
    borderBottomWidth: 1,
    maxHeight: 56,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  // 목록
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  emptyContainer: {
    alignItems: "center",
    padding: 60,
    gap: 12,
  },
  emptyBox: {
    padding: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyText: {
    fontSize: 15,
  },
  listCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  listCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  listStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  listStatusIcon: {
    fontSize: 14,
  },
  listStatusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  listDate: {
    fontSize: 12,
  },
  listCardBody: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 3,
  },
  listName: {
    fontSize: 17,
    fontWeight: "700",
  },
  listAddress: {
    fontSize: 14,
  },
  listSymptom: {
    fontSize: 13,
    fontWeight: "600",
  },
  listTechnician: {
    fontSize: 13,
  },
  listCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
  },
  listRequestNumber: {
    fontSize: 12,
  },
  listPhone: {
    fontSize: 13,
    fontWeight: "500",
  },

  // 모달
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  modalScrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  modalStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  modalStatusIcon: {
    fontSize: 22,
  },
  modalStatusText: {
    fontSize: 17,
    fontWeight: "700",
  },

  // 섹션 카드
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    padding: 12,
    paddingBottom: 8,
  },
  sectionCardContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },

  // 정보 행
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 14,
    color: "#6B7280",
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: "#1A1A1A",
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },

  // 상세 내용
  detailContentBox: {
    marginTop: 4,
    gap: 4,
  },
  detailContentLabel: {
    fontSize: 13,
  },
  detailContentText: {
    fontSize: 14,
    lineHeight: 22,
  },

  // 일정 입력
  scheduleInputs: {
    flexDirection: "row",
    gap: 10,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  smallInput: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    fontSize: 14,
  },

  // 기사 배정
  currentTechBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  currentTechText: {
    fontSize: 14,
    color: "#16A34A",
    fontWeight: "600",
  },
  techPickerList: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 4,
  },
  techPickerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 0.5,
  },
  techPickerName: {
    fontSize: 15,
    fontWeight: "600",
  },
  techPickerPhone: {
    fontSize: 13,
  },

  // 상태 선택
  statusSelector: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusSelectorText: {
    fontSize: 15,
    fontWeight: "600",
  },
  statusPickerList: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 4,
  },
  statusPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 0.5,
    gap: 8,
  },
  statusPickerIcon: {
    fontSize: 18,
  },
  statusPickerText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // 메모
  memoContainer: {
    gap: 4,
  },
  memoInput: {
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 10,
    fontSize: 14,
    minHeight: 80,
  },

  // 액션 버튼
  actionButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  // 점검 결과
  existingResult: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  existingResultLabel: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "600",
  },
  existingResultText: {
    fontSize: 14,
    color: "#1A1A1A",
    lineHeight: 22,
  },
  resultInput: {
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 10,
    fontSize: 14,
    minHeight: 100,
  },

  // 관리자 탭 바
  adminTabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  adminTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 2,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  adminTabIcon: {
    fontSize: 20,
  },
  adminTabLabel: {
    fontSize: 13,
    fontWeight: "700",
  },

  // 기사 관리
  techTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  techTopBarText: {
    fontSize: 16,
    fontWeight: "700",
  },
  techAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  techAddButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  techCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  techCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  techCardName: {
    fontSize: 17,
    fontWeight: "700",
  },
  techStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  techCardSub: {
    fontSize: 14,
    marginTop: 2,
  },
  techCardActions: {
    gap: 8,
  },
  techSmallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    minWidth: 64,
  },

  // 폼 모달
  formModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  formModalCard: {
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  formModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  formInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 4,
  },
  formModalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  formCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  formCancelText: {
    fontSize: 16,
    fontWeight: "700",
  },
  formSaveBtn: {
    flex: 2,
    height: 50,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  formSaveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  // 설정
  settingsContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  smsStatusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  settingsFooter: {
    textAlign: "center",
    fontSize: 13,
    marginTop: 8,
  },
  // 누수 관제
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "31%",
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
  leakListTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 4,
  },
  leakCard: {
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  leakCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  leakStatusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  leakStatusPillText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  leakExpandHint: {
    fontSize: 13,
    fontWeight: "600",
  },
  leakCustomer: {
    fontSize: 17,
    fontWeight: "700",
  },
  leakSensorInfo: {
    fontSize: 14,
  },
  leakDetectedTime: {
    fontSize: 14,
    color: "#DC2626",
    fontWeight: "700",
    marginTop: 2,
  },
  leakDetailBox: {
    gap: 6,
    marginTop: 6,
  },
  leakDivider: {
    height: 1,
    marginBottom: 4,
  },
  leakInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 2,
  },
  leakInfoLabel: {
    fontSize: 14,
    flex: 1,
  },
  leakInfoValue: {
    fontSize: 15,
    fontWeight: "600",
    flex: 2,
    textAlign: "right",
  },
  leakMemoInput: {
    minHeight: 60,
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    fontSize: 15,
    textAlignVertical: "top",
    marginTop: 6,
  },
  leakMemoSaveBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  leakMemoSaveText: {
    fontSize: 15,
    fontWeight: "600",
  },
  leakActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  leakActionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  leakActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  leakTestBtn: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderWidth: 1.5,
    borderColor: "#F59E0B",
  },
  leakTestText: {
    color: "#B45309",
    fontSize: 15,
    fontWeight: "700",
  },
});
