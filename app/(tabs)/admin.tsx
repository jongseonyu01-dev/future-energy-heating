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
} from "react-native";
import { useState, useCallback } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

// 관리자 비밀번호 (간단한 로컬 인증)
const ADMIN_PASSWORD = "admin1234";

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
  apartmentName: string;
  dong: string;
  ho: string;
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
  const [selectedStatus, setSelectedStatus] = useState("전체");
  const [selectedItem, setSelectedItem] = useState<RepairRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setIsLoggedIn(true);
    } else {
      Alert.alert("오류", "비밀번호가 올바르지 않습니다.");
    }
  };

  if (!isLoggedIn) {
    return (
      <AdminLoginScreen
        password={password}
        setPassword={setPassword}
        onLogin={handleLogin}
        colors={colors}
      />
    );
  }

  return (
    <AdminDashboard
      colors={colors}
      selectedStatus={selectedStatus}
      setSelectedStatus={setSelectedStatus}
      selectedItem={selectedItem}
      setSelectedItem={setSelectedItem}
      showDetailModal={showDetailModal}
      setShowDetailModal={setShowDetailModal}
      onLogout={() => setIsLoggedIn(false)}
    />
  );
}

// ─── 로그인 화면 ───────────────────────────────────────────────
function AdminLoginScreen({
  password,
  setPassword,
  onLogin,
  colors,
}: {
  password: string;
  setPassword: (v: string) => void;
  onLogin: () => void;
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
              { backgroundColor: "#E84B2F", opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={onLogin}
          >
            <Text style={styles.loginButtonText}>로그인</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

// ─── 관리자 대시보드 ───────────────────────────────────────────
function AdminDashboard({
  colors,
  selectedStatus,
  setSelectedStatus,
  selectedItem,
  setSelectedItem,
  showDetailModal,
  setShowDetailModal,
  onLogout,
}: {
  colors: any;
  selectedStatus: string;
  setSelectedStatus: (v: string) => void;
  selectedItem: RepairRequest | null;
  setSelectedItem: (v: RepairRequest | null) => void;
  showDetailModal: boolean;
  setShowDetailModal: (v: boolean) => void;
  onLogout: () => void;
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
    <ScreenContainer containerClassName="bg-background">
      {/* 헤더 */}
      <View style={[styles.adminHeader, { backgroundColor: "#1A1A1A" }]}>
        <View>
          <Text style={styles.adminHeaderTitle}>⚙️ 관리자 대시보드</Text>
          <Text style={styles.adminHeaderSubtitle}>
            전체 {allRequests?.length || 0}건
          </Text>
        </View>
        <Pressable
          style={[styles.logoutButton, { borderColor: "rgba(255,255,255,0.3)" }]}
          onPress={onLogout}
        >
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </View>

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
                    {item.apartmentName} {item.dong}동 {item.ho}호
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
    </ScreenContainer>
  );
}

// ─── 상세 모달 ─────────────────────────────────────────────────
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
            <InfoRow label="주소" value={`${item.apartmentName} ${item.dong}동 ${item.ho}호`} />
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
});
