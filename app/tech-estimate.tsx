/**
 * 기사 현장 자동견적
 *
 * 홈페이지 자동견적의 선택·가격 계약을 공통 engine으로 사용한다.
 * 초안은 기사별 기기 로컬 저장소에만 보관하며 고객 발송과 분리한다.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAppAuth } from "@/lib/auth-context";
import { createTechEstimateActorScope, createTechEstimateRequestScope } from "@/lib/tech-estimate-actor-scope";
import {
  loadCurrentOrMigrateLegacyDraft,
  removeDraftForCurrentTechEstimateScope,
  saveDraftForCurrentTechEstimateScope,
} from "@/lib/tech-estimate-draft-operations";
import {
  PORTS,
  QuotePriceError,
  addAllRoomFlowValve,
  addDirectItem,
  addManifoldMainValve,
  addSupplyLineRepair,
  applyPriceMode,
  clearAllRoomConfiguration,
  clearManifoldSelection,
  createPipeCleaningLine,
  getPartialSelectableItems,
  removeLine,
  selectManifold,
  setLineQuantity,
  toggleActuator,
  toggleController,
  toggleDirectItem,
  toggleRoomThermostat,
  toggleTerminalBox,
  totalOf,
  validateDraft,
  type ControllerType,
  type PriceItem,
  type PriceMode,
  type QuoteDraft,
  type QuoteLine,
} from "@/lib/tech-estimate-engine";
import { trpc } from "@/lib/trpc";

type Tab = "write" | "draft" | "history";
type WorkType = "manifold" | "partial" | "pipe";

const DRAFT_STORAGE_PREFIX = "future-energy:tech-estimate-draft:v1";
const REVIEW_MODE = process.env.EXPO_PUBLIC_TECH_ESTIMATE_REVIEW_MODE === "1";
const scopedDraftStorage = {
  getItem: (key: string) => Promise.resolve(AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) => Promise.resolve(AsyncStorage.setItem(key, value)),
  removeItem: (key: string) => Promise.resolve(AsyncStorage.removeItem(key)),
};

function fmtMoney(value: number): string {
  return Number(value || 0).toLocaleString("ko-KR");
}

function priceLabel(mode: PriceMode): string {
  if (mode === "standard") return "표준시공가";
  if (mode === "discount") return "단체할인가";
  return "분배기 시공 할인가";
}

function safeLines(value: unknown): QuoteLine[] {
  return Array.isArray(value) ? (value as QuoteLine[]) : [];
}

export default function TechEstimateScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string; customerName?: string; customerPhone?: string }>();
  const { user } = useAppAuth();
  const hasTechnicianAccess = user?.appRole === "technician";
  const actorScope = createTechEstimateActorScope(user);
  const { data: reviewRequests = [], isLoading: reviewRequestLoading } = trpc.estimates.reviewMyAssignedRequests.useQuery(
    actorScope ? { actorScope } : undefined,
    { enabled: REVIEW_MODE && hasTechnicianAccess && Boolean(actorScope) },
  );
  const reviewRequest = REVIEW_MODE ? (reviewRequests as Array<{ id: number; customerName: string; phoneNumber: string }>)[0] ?? null : null;

  const [tab, setTab] = useState<Tab>("write");
  const [workType, setWorkType] = useState<WorkType>("manifold");
  const [priceMode, setPriceMode] = useState<Exclude<PriceMode, "dist_discount">>("standard");
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [pipeArea, setPipeArea] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastReport, setLastReport] = useState<{ estimateNumber?: string; amount: number } | null>(null);

  const technicianId = user?.technicianId ?? 0;
  const rawRequestId = REVIEW_MODE
    ? (reviewRequest ? String(reviewRequest.id) : null)
    : (typeof params.requestId === "string" && params.requestId.trim() ? params.requestId.trim() : null);
  const requestId = Number(rawRequestId);
  const hasRequestId = Number.isSafeInteger(requestId) && requestId > 0;
  const requestDraftId = rawRequestId ?? "standalone";
  const requestScope = createTechEstimateRequestScope(actorScope, rawRequestId);
  const requestScopeRef = useRef(requestScope);
  requestScopeRef.current = requestScope;
  const workGenerationRef = useRef(0);
  const reportOperationRef = useRef(0);
  const draftRevisionRef = useRef(0);
  const renderedScopeRef = useRef(requestScope);
  if (renderedScopeRef.current !== requestScope) {
    renderedScopeRef.current = requestScope;
    workGenerationRef.current += 1;
    reportOperationRef.current += 1;
  }
  const advanceWorkGeneration = () => {
    workGenerationRef.current += 1;
    return workGenerationRef.current;
  };
  const sourceCustomerFixed = REVIEW_MODE ? Boolean(reviewRequest) : Boolean(rawRequestId && (params.customerName || params.customerPhone));
  const scopedTechnicianKey = actorScope ?? `technician:${technicianId || "unknown"}`;
  const draftKey = `${DRAFT_STORAGE_PREFIX}:${scopedTechnicianKey}:${requestDraftId}`;
  const legacyDraftKey = `${DRAFT_STORAGE_PREFIX}:${technicianId || "unknown"}:${requestDraftId}`;
  const legacyMigrationMarkerKey = `${draftKey}:v33-migrated`;

  const initialCustomerName = REVIEW_MODE ? (reviewRequest?.customerName ?? "") : (params.customerName ?? "");
  const initialCustomerPhone = REVIEW_MODE ? (reviewRequest?.phoneNumber ?? "") : (params.customerPhone ?? "");
  const { data: rawPriceItems = [], isLoading: priceLoading, isError: priceError } = trpc.prices.listActive.useQuery(
    undefined,
    { enabled: hasTechnicianAccess },
  );
  const priceItems = rawPriceItems as PriceItem[];
  const techRequestMutation = trpc.estimates.techRequest.useMutation();
  const { data: myEstimates = [], isLoading: historyLoading, refetch: refetchHistory } = trpc.estimates.listMyTechRequests.useQuery(
    actorScope ? { actorScope } : undefined,
    { enabled: tab === "history" && hasTechnicianAccess && Boolean(actorScope) },
  );

  const totalAmount = useMemo(() => totalOf(lines), [lines]);
  const partialItems = useMemo(() => getPartialSelectableItems(priceItems), [priceItems]);
  const partialCategories = useMemo(
    () => ["전체", ...Array.from(new Set(partialItems.map((item) => item.category)))],
    [partialItems],
  );
  const filteredPartialItems = useMemo(
    () => categoryFilter === "전체" ? partialItems : partialItems.filter((item) => item.category === categoryFilter),
    [partialItems, categoryFilter],
  );
  const allRoomSelected = lines.some((line) => line.source === "auto" && line.name === "유량밸브 15A");
  const activeControllers = new Set(lines.map((line) => line.controllerType).filter(Boolean));
  const activeRoomThermostats = new Set(lines.filter((line) => line.source === "thermostat" && line.automationKey?.startsWith("room-")).map((line) => line.automationKey));
  const activeActuators = new Set(lines.filter((line) => line.source === "actuator").map((line) => line.automationKey));
  const terminalBoxSelected = lines.some((line) => line.source === "configuration" && line.automationKey === "terminal-box");
  const standaloneQuickItems = ["단자함", "라인보수 20A", "라인보수 25A"] as const;
  const activeStandaloneQuickItems = new Set(lines.filter((line) => line.source === "partial").map((line) => line.name));

  useEffect(() => {
    let mounted = true;
    setDraftLoading(true);
    setSubmitting(false);
    setDraft(null);
    setLines([]);
    setSelectedPort(null);
    setMemo("");
    setPipeArea("");
    setPriceMode("standard");
    setLastReport(null);
    setCustomerName(initialCustomerName);
    setCustomerPhone(initialCustomerPhone);
    const startedGeneration = workGenerationRef.current;
    const isCurrentLoad = () => mounted
      && requestScopeRef.current === requestScope
      && workGenerationRef.current === startedGeneration;
    loadCurrentOrMigrateLegacyDraft({
      storage: scopedDraftStorage,
      currentDraftKey: draftKey,
      legacyDraftKey,
      legacyMigrationMarkerKey,
      isCurrent: isCurrentLoad,
      isValid: (raw) => {
        try {
          return validateDraft(JSON.parse(raw)).customer.requestId === rawRequestId;
        } catch {
          return false;
        }
      },
    })
      .then((loaded) => {
        if (!loaded || !isCurrentLoad()) return;
        try {
          setDraft(validateDraft(JSON.parse(loaded.raw)));
        } catch {
          // 손상된 현재 key는 자동 적용하지 않는다. legacy key는 보존한다.
        }
      })
      .finally(() => isCurrentLoad() && setDraftLoading(false));
    return () => { mounted = false; };
  }, [actorScope, draftKey, initialCustomerName, initialCustomerPhone, legacyDraftKey, legacyMigrationMarkerKey, rawRequestId, requestScope]);

  const runQuoteAction = (action: () => QuoteLine[]): boolean => {
    if (priceLoading || priceError) {
      Alert.alert("단가표 확인 필요", "현재 활성 단가표를 불러오지 못했습니다. 0원 또는 구형 기본값으로 견적을 만들지 않습니다.");
      return false;
    }
    try {
      advanceWorkGeneration();
      setLines(action());
      return true;
    } catch (error) {
      Alert.alert("항목 추가 불가", error instanceof Error ? error.message : "단가를 확인할 수 없습니다.");
      return false;
    }
  };

  const choosePort = (port: number) => {
    const applied = runQuoteAction(() => {
      const next = selectManifold(lines, priceItems, port, priceMode, pipeArea ? Number(pipeArea) : null);
      return allRoomSelected ? addAllRoomFlowValve(next, priceItems, port, priceMode) : next;
    });
    if (applied) setSelectedPort(port);
  };

  const changePriceMode = (mode: Exclude<PriceMode, "dist_discount">) => {
    try {
      advanceWorkGeneration();
      setLines(applyPriceMode(lines, mode));
      setPriceMode(mode);
    } catch (error) {
      Alert.alert("가격 구분 변경 불가", error instanceof Error ? error.message : "단가를 확인하세요.");
    }
  };

  const toggleAllRoom = () => {
    if (!selectedPort) {
      Alert.alert("구수 선택 필요", "먼저 분배기 구수를 선택하세요.");
      return;
    }
    runQuoteAction(() => allRoomSelected
      ? clearAllRoomConfiguration(lines)
      : addAllRoomFlowValve(lines, priceItems, selectedPort, priceMode));
  };

  const toggleRoomThermostatItem = (kind: "digital" | "analog") => {
    if (!selectedPort) return;
    runQuoteAction(() => toggleRoomThermostat(lines, priceItems, kind, selectedPort, priceMode));
  };

  const toggleActuatorItem = (kind: "paraffin" | "motor") => {
    if (!selectedPort) return;
    runQuoteAction(() => toggleActuator(lines, priceItems, kind, selectedPort, priceMode));
  };

  const toggleControllerItem = (type: ControllerType) => {
    runQuoteAction(() => toggleController(lines, priceItems, type, priceMode));
  };

  const toggleTerminalBoxItem = () => {
    runQuoteAction(() => toggleTerminalBox(lines, priceItems, priceMode));
  };

  const toggleStandaloneQuickItem = (name: (typeof standaloneQuickItems)[number]) => {
    const item = partialItems.find((candidate) => candidate.name === name);
    if (!item) {
      Alert.alert("단가표 확인 필요", `${name}의 활성 표준시공가와 단체할인가를 불러오지 못했습니다. 0원 또는 임의 단가로 추가하지 않습니다.`);
      return;
    }
    runQuoteAction(() => toggleDirectItem(lines, item, priceMode));
  };

  const addMainValve = (size: 20 | 25) => {
    if (!selectedPort) {
      Alert.alert("구수 선택 필요", "분배기 시공 전용 메인밸브는 분배기 구수를 먼저 선택한 뒤 추가하세요.");
      return;
    }
    runQuoteAction(() => addManifoldMainValve(lines, size, priceMode));
  };

  const addPipeCleaning = () => {
    try {
      const line = createPipeCleaningLine(Number(pipeArea), priceMode);
      advanceWorkGeneration();
      setLines((current) => [...current.filter((item) => item.lineId !== line.lineId), line]);
      setPipeArea("");
    } catch (error) {
      Alert.alert("배관청소 추가 불가", error instanceof Error ? error.message : "평형을 확인하세요.");
    }
  };

  const saveDraft = async () => {
    if (lines.length === 0) {
      Alert.alert("저장할 항목 없음", "견적 항목을 1개 이상 추가한 뒤 임시저장하세요.");
      return;
    }
    const nextDraft: QuoteDraft = {
      version: 1,
      customer: { name: customerName, phone: customerPhone, requestId: rawRequestId },
      memo,
      priceMode,
      selectedPort,
      lines,
      savedAt: new Date().toISOString(),
    };
    const startedGeneration = advanceWorkGeneration();
    const savedDraftRevision = draftRevisionRef.current + 1;
    try {
      const validated = validateDraft(nextDraft);
      const saved = await saveDraftForCurrentTechEstimateScope({
        storage: scopedDraftStorage,
        draftKey,
        serializedDraft: JSON.stringify(validated),
        startedRequestScope: requestScope,
        getCurrentRequestScope: () => requestScopeRef.current,
        startedWorkGeneration: startedGeneration,
        getCurrentWorkGeneration: () => workGenerationRef.current,
        onCurrentScope: () => {
          draftRevisionRef.current = savedDraftRevision;
          setDraft(validated);
        },
      });
      if (saved) Alert.alert("임시저장 완료", "이 기기에서 초안을 다시 열 수 있습니다. 고객에게 전송되지 않습니다.");
    } catch (error) {
      if (requestScope === requestScopeRef.current) {
        Alert.alert("임시저장 실패", error instanceof Error ? error.message : "초안이 저장되지 않았습니다.");
      }
    }
  };

  const reopenDraft = () => {
    if (!draft) return;
    try {
      const restored = validateDraft(draft);
      advanceWorkGeneration();
      setCustomerName(restored.customer.name);
      setCustomerPhone(restored.customer.phone);
      setMemo(restored.memo);
      setPriceMode(restored.priceMode);
      setSelectedPort(restored.selectedPort);
      setLines(safeLines(restored.lines));
      setTab("write");
      Alert.alert("초안 불러오기", "저장 당시 품목·수량·단가·가격 구분·메모를 그대로 열었습니다.");
    } catch (error) {
      Alert.alert("초안 불러오기 실패", error instanceof Error ? error.message : "초안 형식을 확인하세요.");
    }
  };

  const clearLocalDraft = () => {
    Alert.alert("저장 초안 삭제", "현재 기기의 초안만 삭제합니다. 본사에 보고된 기존 견적은 변경되지 않습니다.", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
        const startedGeneration = advanceWorkGeneration();
        const startedDraftRevision = draftRevisionRef.current;
        try {
          await removeDraftForCurrentTechEstimateScope({
            storage: scopedDraftStorage,
            draftKey,
            startedRequestScope: requestScope,
            getCurrentRequestScope: () => requestScopeRef.current,
            startedWorkGeneration: startedGeneration,
            getCurrentWorkGeneration: () => workGenerationRef.current,
            isCurrentDraftOwner: () => draftRevisionRef.current === startedDraftRevision,
            onCurrentScope: () => {
              draftRevisionRef.current += 1;
              setDraft(null);
            },
          });
        } catch (error) {
          if (requestScope === requestScopeRef.current) {
            Alert.alert("초안 삭제 실패", error instanceof Error ? error.message : "초안을 삭제하지 못했습니다.");
          }
        }
      } },
    ]);
  };

  const submitToReview = () => {
    if (!hasRequestId) {
      Alert.alert("접수 연결 필요", "배정된 접수 화면에서 견적을 작성한 뒤 본사/지사에 보고하세요.");
      return;
    }
    if (!customerName.trim() || customerPhone.replace(/[^0-9]/g, "").length < 9) {
      Alert.alert("고객 정보 확인", "고객 이름과 연락처를 확인하세요.");
      return;
    }
    if (!lines.length || totalAmount <= 0) {
      Alert.alert("견적 항목 확인", "유효 단가가 있는 견적 항목을 추가하세요.");
      return;
    }
    if (!user?.technicianId) {
      Alert.alert("권한 확인", "기사 계정으로 로그인한 뒤 본사에 보고할 수 있습니다.");
      return;
    }
    try {
      validateDraft({
        version: 1,
        customer: { name: customerName, phone: customerPhone, requestId: rawRequestId },
        memo,
        priceMode,
        selectedPort,
        lines,
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      Alert.alert("견적 항목 확인", error instanceof Error ? error.message : "품목 수량·단가·금액을 확인하세요.");
      return;
    }
    Alert.alert("본사/지사 검토 요청", "고객에게는 아직 발송되지 않습니다. 본사 또는 지사의 검토 후에만 고객 발송이 진행됩니다.", [
      { text: "취소", style: "cancel" },
      { text: "검토 요청", onPress: async () => {
        const submittedScope = requestScope;
        const submittedDraftKey = draftKey;
        const submittedGeneration = advanceWorkGeneration();
        const submittedDraftRevision = draftRevisionRef.current;
        const submittedReportOperation = reportOperationRef.current + 1;
        reportOperationRef.current = submittedReportOperation;
        try {
          setSubmitting(true);
          const result = await techRequestMutation.mutateAsync({
            requestId,
            customerName: customerName.trim(),
            phoneNumber: customerPhone,
            title: `${customerName.trim()} 현장 견적`,
            amount: totalAmount,
            autoEstimateItems: JSON.stringify(lines),
            techRequestNote: memo.trim() || undefined,
          });
          // 계정 또는 접수가 전환된 뒤 A의 늦은 응답이 B 화면·초안을 바꾸지 않는다.
          const removed = await removeDraftForCurrentTechEstimateScope({
            storage: scopedDraftStorage,
            draftKey: submittedDraftKey,
            startedRequestScope: submittedScope,
            getCurrentRequestScope: () => requestScopeRef.current,
            startedWorkGeneration: submittedGeneration,
            getCurrentWorkGeneration: () => workGenerationRef.current,
            isCurrentDraftOwner: () => draftRevisionRef.current === submittedDraftRevision,
            onCurrentScope: () => undefined,
          });
          if (!removed) return;
          if (workGenerationRef.current !== submittedGeneration) return;
          if (reportOperationRef.current !== submittedReportOperation) return;
          // 현재 작업의 성공 완료에서 먼저 잠금을 풀고, 그 뒤 새 화면 세대로 넘긴다.
          // 순서를 반대로 하면 finally guard가 새 세대를 보고 잠금을 남길 수 있다.
          setSubmitting(false);
          advanceWorkGeneration();
          draftRevisionRef.current += 1;
          setLines([]);
          setMemo("");
          setDraft(null);
          setLastReport({ estimateNumber: result.estimateNumber, amount: totalAmount });
          if (!sourceCustomerFixed) {
            setCustomerName("");
            setCustomerPhone("");
          }
          setTab("history");
          void refetchHistory();
          Alert.alert("검토 요청 완료", "본사/지사 검토 대기 상태입니다. 고객 발송은 이 단계에서 실행되지 않습니다.");
        } catch (error: any) {
          if (submittedScope === requestScopeRef.current && reportOperationRef.current === submittedReportOperation) {
            Alert.alert("검토 요청 실패", error?.message ?? "견적 요청을 저장하지 못했습니다.");
          }
        } finally {
          if (reportOperationRef.current === submittedReportOperation) setSubmitting(false);
        }
      } },
    ]);
  };

  const changeLineQuantity = (lineId: string, requestedQty: number) => {
    try {
      advanceWorkGeneration();
      setLines(setLineQuantity(lines, lineId, requestedQty));
    } catch (error) {
      Alert.alert("수량 확인", error instanceof Error ? error.message : "수량은 1 이상 정수여야 합니다.");
    }
  };

  const deleteLine = (line: QuoteLine) => {
    advanceWorkGeneration();
    if (line.source === "manifold") {
      setLines(clearManifoldSelection(removeLine(lines, line.lineId)));
      setSelectedPort(null);
      return;
    }
    setLines(removeLine(lines, line.lineId));
  };

  const s = styles(colors);
  const renderHistoryItem = ({ item }: { item: any }) => {
    let historyLines: any[] = [];
    try {
      historyLines = JSON.parse(item.autoEstimateItems ?? item.description ?? "[]");
    } catch {
      historyLines = [];
    }
    return (
      <View style={s.historyCard}>
        <Text style={s.historyTitle}>{item.title ?? "현장 견적"}</Text>
        <Text style={s.historyAmount}>{fmtMoney(Number(item.amount ?? 0))}원</Text>
        {historyLines.slice(0, 3).map((line, index) => (
          <Text key={index} style={s.historyLine}>· {line.name} × {line.qty} = {fmtMoney(line.subtotal)}원</Text>
        ))}
      </View>
    );
  };
  if (!user || user.appRole !== "technician") {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <Stack.Screen options={{ title: "견적서 만들기" }} />
        <Text style={s.lockIcon}>🔒</Text>
        <Text style={s.lockTitle}>{REVIEW_MODE ? "합성 검수 기사 로그인 필요" : "기사 전용 화면입니다"}</Text>
        <TouchableOpacity style={s.primaryButton} onPress={() => router.replace("/login")}>
          <Text style={s.primaryButtonText}>로그인 화면으로</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: true, title: "견적서 만들기" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
        <View style={s.tabs}>
          {([
            { key: "write", label: "✏️ 견적 작성" },
            { key: "draft", label: "💾 임시저장" },
            { key: "history", label: "📋 보고 내역" },
          ] as { key: Tab; label: string }[]).map((item) => (
            <TouchableOpacity key={item.key} style={[s.tab, tab === item.key && s.tabActive]} onPress={() => setTab(item.key)}>
              <Text style={[s.tabText, tab === item.key && s.tabTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "write" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <View style={s.infoBanner}>
              <Text style={s.infoText}>{REVIEW_MODE ? (reviewRequestLoading ? "검수 기사에게 배정된 합성 접수를 확인하고 있습니다." : reviewRequest ? "격리 검수 모드입니다. 로그인 기사에게 배정된 합성 접수와 단가 snapshot만 사용하며, 운영 DB·고객 견적·문자 발송에는 연결되지 않습니다." : "검수 기사에게 배정된 합성 접수를 찾지 못했습니다. 다른 기사 접수로 견적을 작성할 수 없습니다.") : "홈페이지 자동견적과 같은 활성 단가·가격 구분을 사용합니다. 단가를 불러오지 못하면 0원 견적을 만들지 않습니다."}</Text>
            </View>

            <Text style={s.sectionTitle}>고객 정보</Text>
            <View style={s.card}>
              {sourceCustomerFixed && <Text style={s.fixedHint}>접수에 등록된 고객 정보로 고정됩니다.</Text>}
              <Text style={s.fieldLabel}>고객 이름</Text>
              <TextInput style={[s.input, sourceCustomerFixed && s.inputLocked]} value={customerName} onChangeText={(value) => { advanceWorkGeneration(); setCustomerName(value); }} editable={!sourceCustomerFixed} placeholder="고객 이름" placeholderTextColor={colors.muted} />
              <Text style={[s.fieldLabel, { marginTop: 10 }]}>고객 연락처</Text>
              <TextInput style={[s.input, sourceCustomerFixed && s.inputLocked]} value={customerPhone} onChangeText={(value) => { advanceWorkGeneration(); setCustomerPhone(value); }} editable={!sourceCustomerFixed} keyboardType="phone-pad" placeholder="01000000000" placeholderTextColor={colors.muted} />
            </View>

            <Text style={[s.sectionTitle, { marginTop: 18 }]}>가격 구분</Text>
            <View style={s.modeRow}>
              <TouchableOpacity style={[s.modeButton, priceMode === "standard" && s.modeButtonActive]} onPress={() => changePriceMode("standard")}><Text style={[s.modeText, priceMode === "standard" && s.modeTextActive]}>표준시공가</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modeButton, priceMode === "discount" && s.modeButtonActive]} onPress={() => changePriceMode("discount")}><Text style={[s.modeText, priceMode === "discount" && s.modeTextActive]}>단체할인가</Text></TouchableOpacity>
            </View>

            <Text style={[s.sectionTitle, { marginTop: 18 }]}>공사 유형</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {([
                { key: "manifold", label: "분배기 교체" },
                { key: "partial", label: "부분수리" },
                { key: "pipe", label: "배관청소" },
              ] as { key: WorkType; label: string }[]).map((item) => (
                <TouchableOpacity key={item.key} style={[s.chip, workType === item.key && s.chipActive]} onPress={() => setWorkType(item.key)}><Text style={[s.chipText, workType === item.key && s.chipTextActive]}>{item.label}</Text></TouchableOpacity>
              ))}
            </ScrollView>

            {workType === "manifold" && (
              <View style={s.card}>
                <Text style={s.cardTitle}>분배기 구수</Text>
                <View style={s.portGrid}>{PORTS.map((port) => <TouchableOpacity key={port} style={[s.portButton, selectedPort === port && s.portButtonActive]} onPress={() => choosePort(port)}><Text style={[s.portText, selectedPort === port && s.portTextActive]}>{port}구</Text></TouchableOpacity>)}</View>
                <Text style={s.helperText}>구수를 바꾸면 이전 분배기와 자동 품목은 새 구수 기준으로 한 번만 교체됩니다.</Text>
                {selectedPort && <>
                  <View style={s.divider} />
                  <Text style={s.cardTitle}>각방 온도조절기</Text>
                  <TouchableOpacity style={[s.optionButton, allRoomSelected && s.optionButtonActive]} onPress={toggleAllRoom}><Text style={[s.optionText, allRoomSelected && s.optionTextActive]}>각방 전체 · 유량밸브 {selectedPort}개 자동 추가</Text></TouchableOpacity>
                  {allRoomSelected && <>
                    <Text style={[s.cardTitle, { marginTop: 12 }]}>온도조절기 및 구동기</Text>
                    <View style={s.controllerRow}>
                      <TouchableOpacity style={[s.controllerButton, activeRoomThermostats.has("room-digital") && s.controllerButtonActive]} onPress={() => toggleRoomThermostatItem("digital")}><Text style={[s.controllerText, activeRoomThermostats.has("room-digital") && s.controllerTextActive]}>디지털 조절기 {selectedPort}개</Text></TouchableOpacity>
                      <TouchableOpacity style={[s.controllerButton, activeRoomThermostats.has("room-analog") && s.controllerButtonActive]} onPress={() => toggleRoomThermostatItem("analog")}><Text style={[s.controllerText, activeRoomThermostats.has("room-analog") && s.controllerTextActive]}>아날로그 조절기 {selectedPort}개</Text></TouchableOpacity>
                    </View>
                    <View style={s.controllerRow}>
                      <TouchableOpacity style={[s.controllerButton, activeActuators.has("actuator-paraffin") && s.controllerButtonActive]} onPress={() => toggleActuatorItem("paraffin")}><Text style={[s.controllerText, activeActuators.has("actuator-paraffin") && s.controllerTextActive]}>파라핀 구동기 {selectedPort}개</Text></TouchableOpacity>
                      <TouchableOpacity style={[s.controllerButton, activeActuators.has("actuator-motor") && s.controllerButtonActive]} onPress={() => toggleActuatorItem("motor")}><Text style={[s.controllerText, activeActuators.has("actuator-motor") && s.controllerTextActive]}>모터 구동기 {selectedPort}개</Text></TouchableOpacity>
                    </View>
                    <Text style={[s.cardTitle, { marginTop: 12 }]}>제어기 선택</Text>
                    <View style={s.controllerRow}>
                      {([
                        { key: "basic", label: "제어기" },
                        { key: "wifi", label: "와이파이형" },
                        { key: "vtype", label: "V타입" },
                      ] as { key: ControllerType; label: string }[]).map((item) => <TouchableOpacity key={item.key} style={[s.controllerButton, activeControllers.has(item.key as any) && s.controllerButtonActive]} onPress={() => toggleControllerItem(item.key)}><Text style={[s.controllerText, activeControllers.has(item.key as any) && s.controllerTextActive]}>{item.label}</Text></TouchableOpacity>)}
                    </View>
                    <View style={[s.controllerRow, { marginTop: 7 }]}>
                      <TouchableOpacity style={[s.controllerButton, terminalBoxSelected && s.controllerButtonActive]} onPress={toggleTerminalBoxItem}><Text style={[s.controllerText, terminalBoxSelected && s.controllerTextActive]}>단자함</Text></TouchableOpacity>
                    </View>
                    <Text style={s.helperText}>와이파이형과 V타입은 동시에 선택·각각 해제할 수 있습니다. 제어기 선택은 이미 선택한 각방 조절기 수량을 중복 추가하지 않습니다.</Text>
                  </>}
                  <Text style={[s.cardTitle, { marginTop: 16 }]}>분배기 시공 전용 메인밸브</Text>
                  <View style={s.controllerRow}>
                    <TouchableOpacity style={s.controllerButton} onPress={() => addMainValve(20)}><Text style={s.controllerText}>20A 추가</Text></TouchableOpacity>
                    <TouchableOpacity style={s.controllerButton} onPress={() => addMainValve(25)}><Text style={s.controllerText}>25A 추가</Text></TouchableOpacity>
                  </View>
                  <Text style={s.helperText}>선택한 표준/단체 가격 구분을 적용합니다. 독립 시공 메인밸브는 부분수리 항목에서 별도 선택합니다.</Text>
                </>}
              </View>
            )}

            {workType === "partial" && (
              <View style={s.card}>
                <Text style={s.cardTitle}>부분수리 항목</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                  {partialCategories.map((category) => <TouchableOpacity key={category} style={[s.smallChip, categoryFilter === category && s.smallChipActive]} onPress={() => setCategoryFilter(category)}><Text style={[s.smallChipText, categoryFilter === category && s.smallChipTextActive]}>{category}</Text></TouchableOpacity>)}
                </ScrollView>
                <TouchableOpacity style={s.selectItemsButton} onPress={() => setShowPriceModal(true)}><Text style={s.selectItemsText}>+ 홈페이지 기준 항목 선택</Text></TouchableOpacity>
                <TouchableOpacity style={s.supplyButton} onPress={() => { advanceWorkGeneration(); setLines(addSupplyLineRepair(lines, priceMode)); }}><Text style={s.supplyButtonText}>+ 공급측 라인보수 추가 (단독 120,000원)</Text></TouchableOpacity>
                <Text style={[s.cardTitle, { marginTop: 14 }]}>단독보수 빠른 선택</Text>
                <View style={s.controllerRow}>
                  {standaloneQuickItems.map((name) => <TouchableOpacity key={name} style={[s.controllerButton, activeStandaloneQuickItems.has(name) && s.controllerButtonActive]} onPress={() => toggleStandaloneQuickItem(name)}><Text style={[s.controllerText, activeStandaloneQuickItems.has(name) && s.controllerTextActive]}>{name}</Text></TouchableOpacity>)}
                </View>
                <Text style={s.helperText}>단자함·라인보수 20A·라인보수 25A는 현재 활성 단가표의 표준/단체 가격을 적용합니다. 라인보수가 있으면 공급측 라인보수는 동시 시공 70,000원으로 반영됩니다.</Text>
                <Text style={s.helperText}>분배기 시공 전용과 구형 임시 항목은 이 목록에서 제외됩니다. `제어기 교체`와 `제어기`는 서로 다른 항목으로 유지됩니다.</Text>
              </View>
            )}

            {workType === "pipe" && (
              <View style={s.card}>
                <Text style={s.cardTitle}>배관청소 평형 계산</Text>
                <TextInput style={s.input} value={pipeArea} onChangeText={setPipeArea} keyboardType="numeric" placeholder="10평 이상 입력" placeholderTextColor={colors.muted} />
                <Text style={s.helperText}>현재 선택: {priceMode === "standard" ? "평수 × 1,000원 + 140,000원" : "평수 × 1,000원 + 80,000원"}</Text>
                <TouchableOpacity style={s.primaryButton} onPress={addPipeCleaning}><Text style={s.primaryButtonText}>배관청소 항목 추가</Text></TouchableOpacity>
              </View>
            )}

            <View style={s.itemsHeader}><Text style={s.sectionTitle}>견적 항목</Text><Text style={s.itemsCount}>{lines.length}개</Text></View>
            {lines.length === 0 ? <View style={s.emptyCard}><Text style={s.emptyText}>공사 유형과 항목을 선택하면 견적이 구성됩니다.</Text></View> : <View style={s.card}>{lines.map((line) => (
              <View key={line.lineId} style={s.lineRow}>
                <View style={s.lineInfo}><Text style={s.lineName}>{line.name}</Text><Text style={s.lineMeta}>{line.category} · {line.unit ?? "-"} · {priceLabel(line.priceMode)}{line.auto ? " · 자동 추가" : ""}</Text><Text style={s.lineUnit}>단가 {fmtMoney(line.unitPrice)}원</Text></View>
                <View style={s.lineControls}><View style={s.qtyRow}><TouchableOpacity style={s.qtyButton} onPress={() => changeLineQuantity(line.lineId, line.qty - 1)} accessibilityRole="button" accessibilityLabel={`${line.name} 수량 1 감소`}><Text style={s.qtyText} maxFontSizeMultiplier={1.3}>−</Text></TouchableOpacity><TextInput style={s.qtyInput} value={String(line.qty)} onChangeText={(value) => { if (value.trim()) changeLineQuantity(line.lineId, Number(value)); }} keyboardType="numeric" inputMode="numeric" textAlign="center" textAlignVertical="center" maxFontSizeMultiplier={1.3} accessibilityLabel={`${line.name} 수량`} /><TouchableOpacity style={s.qtyButton} onPress={() => changeLineQuantity(line.lineId, line.qty + 1)} accessibilityRole="button" accessibilityLabel={`${line.name} 수량 1 증가`}><Text style={s.qtyText} maxFontSizeMultiplier={1.3}>+</Text></TouchableOpacity></View><Text style={s.lineSubtotal}>{fmtMoney(line.subtotal)}원</Text><TouchableOpacity onPress={() => deleteLine(line)}><Text style={s.deleteText}>삭제</Text></TouchableOpacity></View>
              </View>
            ))}<View style={s.totalRow}><Text style={s.totalLabel}>합계</Text><Text style={s.totalAmount}>{fmtMoney(totalAmount)}원</Text></View></View>}

            <Text style={[s.sectionTitle, { marginTop: 18 }]}>현장 메모</Text>
            <TextInput style={[s.input, s.memoInput]} value={memo} onChangeText={(value) => { advanceWorkGeneration(); setMemo(value); }} multiline textAlignVertical="top" placeholder="현장 상황, 특이사항 등 메모" placeholderTextColor={colors.muted} />
            <TouchableOpacity style={[s.draftButton, !lines.length && s.disabledButton]} onPress={saveDraft} disabled={!lines.length}><Text style={s.draftButtonText}>견적 초안 임시저장</Text></TouchableOpacity>
              <TouchableOpacity style={[s.submitButton, (submitting || !lines.length) && s.disabledButton]} onPress={submitToReview} disabled={submitting || !lines.length}>{submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitButtonText}>{REVIEW_MODE ? "합성 본사 검토 요청" : "본사/지사에 검토 요청"}</Text>}</TouchableOpacity>
          </ScrollView>
        )}

        {tab === "draft" && <View style={s.center}>{draftLoading ? <ActivityIndicator color="#FF6B35" /> : draft ? <View style={s.draftCard}><Text style={s.cardTitle}>저장된 견적 초안</Text><Text style={s.draftSummary}>{draft.lines.length}개 품목 · {fmtMoney(totalOf(draft.lines))}원</Text><Text style={s.helperText}>저장 당시 단가와 가격 구분을 그대로 유지합니다.</Text><TouchableOpacity style={s.primaryButton} onPress={reopenDraft}><Text style={s.primaryButtonText}>초안 다시 열기</Text></TouchableOpacity><TouchableOpacity style={s.textButton} onPress={clearLocalDraft}><Text style={s.deleteText}>이 기기의 초안 삭제</Text></TouchableOpacity></View> : <Text style={s.emptyText}>저장된 견적 초안이 없습니다.</Text>}</View>}

        {tab === "history" && (
          <View style={{ flex: 1 }}>
            {historyLoading ? (
              <View style={s.center}><ActivityIndicator color="#FF6B35" /></View>
            ) : (
              <FlatList
                data={myEstimates as any[]}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={s.historyContent}
                ListEmptyComponent={
                  <View style={s.draftCard}>
                    {lastReport ? <Text style={s.draftSummary}>이번 세션 보고 {lastReport.estimateNumber ?? "완료"} · {fmtMoney(lastReport.amount)}원</Text> : <Text style={s.emptyText}>본인이 보고한 견적이 없습니다.</Text>}
                    <Text style={s.helperText}>본인 계정의 기사 보고만 표시합니다. 기존 고객 견적의 품목·단가 snapshot은 자동으로 변경하지 않습니다.</Text>
                  </View>
                }
                renderItem={renderHistoryItem}
              />
            )}
          </View>
        )}

        <Modal visible={showPriceModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPriceModal(false)}>
          <View style={[s.modal, { backgroundColor: colors.background }]}> 
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>홈페이지 기준 항목 선택</Text>
              <TouchableOpacity onPress={() => setShowPriceModal(false)}>
                <Text style={s.closeText}>닫기</Text>
              </TouchableOpacity>
            </View>
            {priceLoading ? (
              <View style={s.center}><ActivityIndicator color="#FF6B35" /></View>
            ) : (
              <FlatList
                data={filteredPartialItems}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={s.priceList}
                ListEmptyComponent={<Text style={s.emptyText}>선택 가능한 활성 단가 항목이 없습니다.</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={s.priceCard}
                    onPress={() => {
                      runQuoteAction(() => addDirectItem(lines, item, priceMode));
                      setShowPriceModal(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.lineName}>{item.name}</Text>
                      <Text style={s.lineMeta}>{item.category} · {item.unit ?? "-"}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={s.lineSubtotal}>{fmtMoney(priceMode === "standard" ? item.stdPrice : item.discPrice)}원</Text>
                      <Text style={s.lineMeta}>{priceMode === "standard" ? "표준시공가" : "단체할인가"}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function styles(colors: any) {
  return StyleSheet.create({
    tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, backgroundColor: colors.background },
    tab: { flex: 1, minHeight: 42, justifyContent: "center", alignItems: "center", borderRadius: 9, backgroundColor: "#F3F4F6", paddingHorizontal: 4 },
    tabActive: { backgroundColor: "#FF6B35" }, tabText: { fontSize: 12, fontWeight: "800", color: "#6B7280" }, tabTextActive: { color: "#fff" },
    content: { padding: 16, paddingBottom: 48 }, infoBanner: { backgroundColor: "#FFF7ED", borderLeftWidth: 3, borderLeftColor: "#FF6B35", borderRadius: 10, padding: 12 }, infoText: { color: "#9A3412", fontSize: 12, lineHeight: 18 },
    sectionTitle: { color: colors.foreground, fontSize: 16, fontWeight: "800", marginBottom: 8 }, card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }, cardTitle: { color: colors.foreground, fontSize: 15, fontWeight: "800", marginBottom: 8 }, fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 5 }, fixedHint: { color: "#9A3412", fontSize: 12, marginBottom: 8, fontWeight: "600" },
    input: { minHeight: 44, borderColor: colors.border, borderWidth: 1, borderRadius: 9, color: colors.foreground, backgroundColor: colors.background, paddingHorizontal: 12, fontSize: 15 }, inputLocked: { backgroundColor: "#F3F4F6", color: "#6B7280" }, memoInput: { minHeight: 92, paddingTop: 10 },
    modeRow: { flexDirection: "row", gap: 8 }, modeButton: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 9, paddingVertical: 11, alignItems: "center", backgroundColor: colors.surface }, modeButtonActive: { backgroundColor: "#1E3A5F", borderColor: "#1E3A5F" }, modeText: { color: "#4B5563", fontSize: 14, fontWeight: "800" }, modeTextActive: { color: "#fff" },
    chipRow: { gap: 8, paddingVertical: 2 }, chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: "#F3F4F6" }, chipActive: { backgroundColor: "#FF6B35" }, chipText: { color: "#6B7280", fontWeight: "700", fontSize: 13 }, chipTextActive: { color: "#fff" }, smallChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: "#F3F4F6" }, smallChipActive: { backgroundColor: "#1E3A5F" }, smallChipText: { color: "#6B7280", fontSize: 12, fontWeight: "700" }, smallChipTextActive: { color: "#fff" },
    portGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, portButton: { width: "18%", minWidth: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center", backgroundColor: colors.background }, portButtonActive: { backgroundColor: "#1E3A5F", borderColor: "#1E3A5F" }, portText: { color: colors.foreground, fontWeight: "800" }, portTextActive: { color: "#fff" },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 }, optionButton: { borderWidth: 1, borderRadius: 9, borderColor: colors.border, padding: 11, backgroundColor: colors.background }, optionButtonActive: { borderColor: "#FF6B35", backgroundColor: "#FFF7ED" }, optionText: { color: colors.foreground, fontWeight: "700", fontSize: 13 }, optionTextActive: { color: "#C2410C" }, helperText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
    controllerRow: { flexDirection: "row", gap: 7 }, controllerButton: { flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 5 }, controllerButtonActive: { borderColor: "#FF6B35", backgroundColor: "#FFF7ED" }, controllerText: { color: colors.foreground, fontWeight: "700", fontSize: 12 }, controllerTextActive: { color: "#C2410C" },
    selectItemsButton: { marginTop: 12, backgroundColor: "#FF6B35", padding: 12, borderRadius: 9, alignItems: "center" }, selectItemsText: { color: "#fff", fontWeight: "800" },
    supplyButton: { marginTop: 8, borderWidth: 1, borderColor: "#1E3A5F", padding: 11, borderRadius: 9, alignItems: "center", backgroundColor: colors.background }, supplyButtonText: { color: "#1E3A5F", fontWeight: "800", fontSize: 13 },
    itemsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 8 }, itemsCount: { color: colors.muted, fontSize: 12 }, emptyCard: { padding: 24, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: 12, alignItems: "center" }, emptyText: { color: colors.muted, textAlign: "center", lineHeight: 20 },
    lineRow: { flexDirection: "row", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }, lineInfo: { flex: 1, minWidth: 0 }, lineName: { color: colors.foreground, fontWeight: "800", fontSize: 14 }, lineMeta: { color: colors.muted, fontSize: 11, marginTop: 3 }, lineUnit: { color: colors.muted, fontSize: 12, marginTop: 4 }, lineControls: { alignItems: "flex-end", minWidth: 176 }, qtyRow: { flexDirection: "row", gap: 6, alignItems: "center" }, qtyButton: { width: 48, height: 48, minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 10 }, qtyText: { color: "#374151", fontSize: 22, lineHeight: 32, fontWeight: "900", includeFontPadding: false, textAlign: "center", textAlignVertical: "center" }, qtyInput: { width: 64, minWidth: 60, height: 48, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.foreground, backgroundColor: colors.background, fontSize: 18, lineHeight: 30, fontWeight: "800", paddingHorizontal: 4, paddingVertical: 0, includeFontPadding: false, textAlign: "center", textAlignVertical: "center" }, lineSubtotal: { color: "#FF6B35", fontWeight: "900", fontSize: 15, marginTop: 7 }, deleteText: { color: "#DC2626", fontSize: 12, fontWeight: "800", marginTop: 6 }, totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 12 }, totalLabel: { color: colors.foreground, fontSize: 16, fontWeight: "900" }, totalAmount: { color: "#FF6B35", fontSize: 25, fontWeight: "900" },
    primaryButton: { backgroundColor: "#FF6B35", paddingVertical: 14, paddingHorizontal: 18, borderRadius: 11, alignItems: "center", marginTop: 12 }, primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 }, draftButton: { marginTop: 20, backgroundColor: "#1E3A5F", padding: 17, borderRadius: 12, alignItems: "center" }, draftButtonText: { color: "#fff", fontSize: 16, fontWeight: "900" }, submitButton: { marginTop: 10, backgroundColor: "#FF6B35", padding: 17, borderRadius: 12, alignItems: "center", minHeight: 54, justifyContent: "center" }, submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "900" }, disabledButton: { opacity: 0.45 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }, draftCard: { width: "100%", maxWidth: 480, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16 }, draftSummary: { color: "#FF6B35", fontSize: 20, fontWeight: "900", marginBottom: 6 }, textButton: { alignItems: "center", padding: 12 },
    historyContent: { padding: 16, gap: 10 }, historyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 }, historyTitle: { color: colors.foreground, fontSize: 14, fontWeight: "800" }, historyAmount: { color: "#FF6B35", fontSize: 18, fontWeight: "900", marginTop: 5 }, historyLine: { color: colors.muted, fontSize: 12, marginTop: 4 },
    modal: { flex: 1 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }, modalTitle: { color: colors.foreground, fontSize: 17, fontWeight: "900" }, closeText: { color: "#6B7280", fontWeight: "800" }, priceList: { padding: 14, gap: 9 }, priceCard: { flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 11, padding: 13 },
    lockIcon: { fontSize: 40, marginBottom: 12 }, lockTitle: { color: colors.foreground, fontSize: 17, fontWeight: "800" },
  });
}
