import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Haptics from "expo-haptics";

import { formatFullAddress } from "@/constants/address-data";
import { useAppAuth } from "@/lib/auth-context";
import { useLocationTracking } from "@/lib/location-tracking-context";
import {
  notifySessionStop,
  requestLocationPermissions,
} from "@/lib/location-tracking";
import { trpc } from "@/lib/trpc";

// tech-schedule과 tech-works가 동시에 마운트되어도 출발 서버 mutation은 하나만 허용한다.
let departureLockRequestId: number | null = null;
let terminalOperationLock: {
  requestId: number;
  kind: "arrive" | "stop";
} | null = null;
const LEGACY_TERMINAL_REQUEST_ID = -1;

function acquireDepartureLock(requestId: number) {
  if (departureLockRequestId !== null) return false;
  departureLockRequestId = requestId;
  return true;
}

function releaseDepartureLock(requestId: number) {
  if (departureLockRequestId === requestId) departureLockRequestId = null;
}

function acquireTerminalOperation(
  requestId: number,
  kind: "arrive" | "stop",
) {
  if (terminalOperationLock !== null) return false;
  terminalOperationLock = { requestId, kind };
  return true;
}

function releaseTerminalOperation(
  requestId: number,
  kind: "arrive" | "stop",
) {
  if (
    terminalOperationLock?.requestId === requestId
    && terminalOperationLock.kind === kind
  ) {
    terminalOperationLock = null;
  }
}

function trackingUrlMatchesToken(trackingUrl: string, token: string): boolean {
  try {
    const pathToken = new URL(trackingUrl).pathname.split("/").filter(Boolean).pop();
    return pathToken ? decodeURIComponent(pathToken) === token : false;
  } catch {
    return false;
  }
}

export const DEPARTABLE_VISIT_STATUSES = new Set([
  "신규접수",
  "기사배정대기",
  "방문예정",
  "기사확인대기",
  "기사확인완료",
  "기사일정확인",
  "출발",
  "재방문필요",
]);

export interface TechnicianVisitWork {
  id: number;
  status: string;
  customerName: string;
  phoneNumber: string;
  technicianId?: number | null;
  customerLat?: string | number | null;
  customerLng?: string | number | null;
  branchId?: number | null;
  branchName?: string | null;
  [key: string]: unknown;
}

interface UseTechnicianVisitTrackingOptions {
  works: readonly TechnicianVisitWork[];
  technicianId?: number | null;
  workListReady?: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * 기사 일정/작업 목록에서 동일한 출발·도착 절차를 사용하도록 묶은 공용 훅.
 * 서버 도착 처리가 성공하기 전에는 로컬 추적 토큰을 지우지 않는다.
 */
export function useTechnicianVisitTracking({
  works,
  technicianId,
  workListReady = true,
  refetch,
}: UseTechnicianVisitTrackingOptions) {
  const { user } = useAppAuth();
  const utils = trpc.useUtils();
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingDepartRequestId, setPendingDepartRequestId] = useState<
    number | null
  >(null);
  const [startingRequestId, setStartingRequestId] = useState<number | null>(
    null,
  );
  const [arrivingRequestId, setArrivingRequestId] = useState<number | null>(
    null,
  );
  const [stoppingRequestId, setStoppingRequestId] = useState<number | null>(
    null,
  );
  const [resendingRequestId, setResendingRequestId] = useState<number | null>(
    null,
  );
  const [legacyScanComplete, setLegacyScanComplete] = useState(false);

  const {
    trackingToken,
    trackingRequestId,
    debugState,
    permStatus,
    startTracking,
    adoptTrackingRequest,
    stopTracking,
    checkPermissions,
  } = useLocationTracking();
  const trackingTokenRef = useRef(trackingToken);
  const trackingRequestIdRef = useRef(trackingRequestId);
  const getSessionByRequestRef = useRef(utils.location.getSessionByRequest);
  trackingTokenRef.current = trackingToken;
  trackingRequestIdRef.current = trackingRequestId;
  getSessionByRequestRef.current = utils.location.getSessionByRequest;

  const resolvedTechnicianId =
    technicianId ??
    works.find((work) => work.technicianId != null)?.technicianId ??
    null;

  const consentQuery = trpc.location.getConsent.useQuery(
    { technicianId: resolvedTechnicianId ?? 0 },
    { enabled: !!resolvedTechnicianId },
  );
  const startTrackingMutation = trpc.location.startTracking.useMutation();
  const stopTrackingMutation = trpc.location.stopTracking.useMutation();
  const markArrivedMutation = trpc.location.markArrived.useMutation();
  const resendTrackingSmsMutation =
    trpc.location.resendTrackingSms.useMutation();
  const saveConsentMutation = trpc.location.saveConsent.useMutation();
  const isConsentLoading =
    !!resolvedTechnicianId &&
    (consentQuery.isPending ||
      (consentQuery.isFetching && consentQuery.data === undefined));

  const doDepart = async (work: TechnicianVisitWork) => {
    if (!acquireDepartureLock(work.id)) {
      Alert.alert(
        "출발 처리 중",
        "다른 방문 건의 출발 처리가 진행 중입니다. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }

    // mutation 전에 현재 HMAC 인증 token을 캡처한다. 로그아웃과 서버 start
    // 응답이 경합해도 명시적 REST rollback에 사용할 수 있다.
    const departureAuthToken =
      user?.appRole === "technician" && typeof user.token === "string"
        ? user.token
        : null;

    setStartingRequestId(work.id);
    try {
      if (!departureAuthToken) {
        throw new Error(
          "기사 로그인 인증을 확인할 수 없습니다. 다시 로그인해 주세요.",
        );
      }
      if (!resolvedTechnicianId) {
        throw new Error(
          "기사 계정 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
        );
      }

      const { granted, backgroundGranted } = await requestLocationPermissions();
      await checkPermissions();
      if (!granted && Platform.OS !== "web") {
        Alert.alert(
          "위치 권한 필요",
          "위치 공유를 위해 위치 권한이 필요합니다.\n설정 → 앱 → 퓨처에너지테크 → 위치 → 앱 사용 중 허용",
          [{ text: "확인" }],
        );
        return;
      }
      if (!backgroundGranted && Platform.OS !== "web") {
        Alert.alert(
          "백그라운드 위치 권한 권장",
          "화면을 끄거나 내비게이션 앱 사용 중에도 위치를 전송하려면\n위치 권한을 '항상 허용'으로 설정해 주세요.\n\n설정 → 앱 → 퓨처에너지테크 → 위치 → 항상 허용\n\n(지금은 앱 켜진 상태에서만 위치가 전송됩니다)",
          [
            { text: "나중에" },
            { text: "설정 열기", onPress: () => Linking.openSettings() },
          ],
        );
      }

      const result = await startTrackingMutation.mutateAsync({
        requestId: work.id,
        technicianId: resolvedTechnicianId,
        technicianName: user?.loginId || "기사",
        technicianPhone: user?.phoneNumber || "",
        customerName: work.customerName,
        customerPhone: work.phoneNumber,
        customerAddress: formatFullAddress(work as any),
        customerLat: work.customerLat ? Number(work.customerLat) : undefined,
        customerLng: work.customerLng ? Number(work.customerLng) : undefined,
        branchId: work.branchId ?? undefined,
        branchName: work.branchName ?? undefined,
        demoMode: false,
      });

      if (!result.success || !result.token) throw new Error("세션 시작 실패");

      const trackResult = await startTracking({
        token: result.token,
        requestId: work.id,
        trackingUrl: result.trackingUrl,
        backgroundEnabled: backgroundGranted,
      });
      if (!trackResult.ok) {
        let rollbackConfirmed = false;
        try {
          const rollback = await stopTrackingMutation.mutateAsync({
            token: result.token,
            reason: "업무취소",
          });
          rollbackConfirmed = rollback.success === true;
        } catch (rollbackError) {
          console.error(
            "[TechnicianVisitTracking] tRPC 출발 rollback 실패:",
            rollbackError,
          );
        }

        // 로그아웃으로 일반 tRPC 인증이 이미 삭제된 경우에도 mutation 전
        // 캡처한 HMAC token으로 서버 세션 종료를 한 번 더 명시적으로 확인한다.
        if (!rollbackConfirmed) {
          const restRollback = await notifySessionStop(
            result.token,
            "업무취소",
            { authorizationToken: departureAuthToken },
          );
          rollbackConfirmed = restRollback.ok;
          if (!restRollback.ok) {
            console.error(
              "[TechnicianVisitTracking] REST 출발 rollback 실패:",
              restRollback.error,
            );
          }
        }

        // 서버 종료가 확인된 경우에만 로컬 토큰을 지운다. 실패 시에는 사용자가
        // 위치 공유 종료를 재시도할 수 있도록 세션 식별값을 보존한다.
        if (rollbackConfirmed) {
          try {
            await stopTracking("업무취소", { serverAlreadyStopped: true });
          } catch (cleanupError) {
            console.error(
              "[TechnicianVisitTracking] 로컬 위치 추적 정리 실패:",
              cleanupError,
            );
          }
        }

        if (!rollbackConfirmed) {
          throw new Error(
            "위치 추적 시작에 실패했고 서버 위치 공유 종료도 확인하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하고, 계속되면 관리자에게 위치 공유 종료를 요청해 주세요.",
          );
        }
        throw new Error(
          trackResult.error ||
            "위치 추적 시작에 실패해 출발 처리를 취소했습니다. 다시 시도해 주세요.",
        );
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(
        "출발 완료 ✅",
        result.reused
          ? result.smsSent
            ? "기존 위치 공유 세션에 다시 연결되었습니다.\n고객 안내 문자 발송 요청이 접수되었습니다. 실제 발송 상태는 관리자 화면에서 확인해 주세요."
            : "기존 위치 공유 세션에 다시 연결되었습니다.\n고객 안내 문자 발송 요청 상태를 확인할 수 없습니다. 관리자 화면에서 확인해 주세요."
          : result.smsSent
            ? "고객 안내 문자 발송 요청이 접수되었습니다.\n실제 발송 상태는 관리자 화면에서 확인해 주세요.\n\n위치 공유 중 - 화면 상단에 표시됩니다."
            : "위치 공유가 시작되었습니다.\n고객 안내 문자를 확인할 수 없으면 방문 카드의 '고객 위치링크 재발송'을 눌러 주세요.",
        [{ text: "확인" }],
      );
    } catch (error: any) {
      Alert.alert(
        "오류",
        error?.message || "출발 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setStartingRequestId(null);
      releaseDepartureLock(work.id);
    }
  };

  const handleResendTrackingSms = async (work: TechnicianVisitWork) => {
    if (!trackingToken || trackingRequestId !== work.id) {
      Alert.alert("알림", "이 방문 건의 위치 공유가 시작되지 않았습니다.");
      return;
    }
    if (resendingRequestId !== null) {
      Alert.alert("재발송 처리 중", "현재 요청이 끝난 뒤 다시 시도해 주세요.");
      return;
    }

    setResendingRequestId(work.id);
    try {
      const result = await resendTrackingSmsMutation.mutateAsync({
        token: trackingToken,
      });
      if (result.smsSent) {
        Alert.alert(
          "재발송 완료",
          "고객 위치링크 문자 발송 요청이 접수되었습니다.",
        );
      } else if (result.smsPending) {
        Alert.alert(
          "재발송 처리 중",
          "같은 문자를 이미 처리 중입니다. 잠시 후 고객 수신 여부를 확인해 주세요.",
        );
      } else {
        Alert.alert(
          "재발송 실패",
          result.smsError || "고객 위치링크 문자를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    } catch (error: any) {
      Alert.alert(
        "재발송 실패",
        error?.message || "고객 위치링크 문자를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setResendingRequestId(null);
    }
  };

  // v1.1.17은 active token만 저장해 requestId가 null일 수 있다. 현재 기사에게
  // 허용된 업무를 protected API로 조회하고 URL token이 정확히 같은 카드만 채택한다.
  useEffect(() => {
    if (
      !trackingToken
      || trackingRequestId !== null
      || !workListReady
    ) {
      setLegacyScanComplete(false);
      return;
    }
    if (works.length === 0) {
      setLegacyScanComplete(true);
      return;
    }

    let cancelled = false;
    setLegacyScanComplete(false);
    void (async () => {
      let adopted = false;
      for (const work of works) {
        if (cancelled) return;
        try {
          const session = await getSessionByRequestRef.current.fetch({
            requestId: work.id,
          });
          if (
            session?.status === "이동중"
            && typeof session.trackingUrl === "string"
            && trackingUrlMatchesToken(session.trackingUrl, trackingToken)
          ) {
            if (!cancelled) {
              adopted = await adoptTrackingRequest(
                work.id,
                session.trackingUrl,
              );
            }
            break;
          }
        } catch {
          // 다른 목록 훅이나 다음 refetch에서 다시 확인할 수 있게 계속 진행한다.
        }
      }
      if (!cancelled && !adopted) setLegacyScanComplete(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    adoptTrackingRequest,
    trackingRequestId,
    trackingToken,
    workListReady,
    works,
  ]);

  const handleDepart = async (work: TechnicianVisitWork) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (trackingToken && trackingRequestId !== work.id) {
      Alert.alert(
        "위치 공유 중",
        "현재 이동 중인 방문 건을 먼저 도착 또는 위치 공유 종료 처리해 주세요.",
      );
      return;
    }
    if (!resolvedTechnicianId) {
      Alert.alert(
        "오류",
        "기사 계정 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
      );
      return;
    }
    if (isConsentLoading) {
      Alert.alert(
        "위치 동의 확인 중",
        "위치정보 이용 동의를 확인하고 있습니다. 잠시 후 다시 눌러 주세요.",
      );
      return;
    }
    if (!consentQuery.data?.hasConsented) {
      setPendingDepartRequestId(work.id);
      setShowConsentModal(true);
      return;
    }
    await doDepart(work);
  };

  const handleArrive = (work: TechnicianVisitWork) => {
    if (!trackingToken || trackingRequestId !== work.id) {
      Alert.alert("알림", "이 방문 건의 위치 공유가 시작되지 않았습니다.");
      return;
    }

    Alert.alert("도착 확인", `${work.customerName} 고객님 댁에 도착하셨나요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "도착 완료",
        onPress: async () => {
          if (!acquireTerminalOperation(work.id, "arrive")) {
            Alert.alert(
              "처리 중",
              "다른 도착 또는 위치 공유 종료 처리가 진행 중입니다.",
            );
            return;
          }
          setArrivingRequestId(work.id);
          try {
            await markArrivedMutation.mutateAsync({
              requestId: work.id,
              token: trackingToken,
            });
            utils.repair.listMySchedule.setData(undefined, (current) =>
              current?.map((item) =>
                item.id === work.id
                  ? { ...item, status: "도착" as const }
                  : item,
              ),
            );
            await stopTracking("도착완료", { serverAlreadyStopped: true });
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
            }
            try {
              await refetch();
            } catch {}
            Alert.alert(
              "도착 완료",
              "위치 공유가 종료되었습니다.\n고객용 링크가 만료됩니다.",
            );
          } catch (error: any) {
            Alert.alert(
              "오류",
              error?.message || "도착 처리 중 오류가 발생했습니다.",
            );
          } finally {
            setArrivingRequestId(null);
            releaseTerminalOperation(work.id, "arrive");
          }
        },
      },
    ]);
  };

  const handleStopSharing = (work: TechnicianVisitWork) => {
    if (arrivingRequestId !== null || stoppingRequestId !== null) {
      Alert.alert("처리 중", "진행 중인 처리가 끝난 뒤 다시 시도해 주세요.");
      return;
    }
    Alert.alert(
      "위치 공유 종료",
      "고객 실시간 위치 공유를 종료하시겠습니까?\n종료 후 다시 출발하려면 위치 공유 재연결이 필요합니다.",
      [
        { text: "아니오", style: "cancel" },
        {
          text: "공유 종료",
          style: "destructive",
          onPress: async () => {
            if (!acquireTerminalOperation(work.id, "stop")) {
              Alert.alert(
                "처리 중",
                "다른 도착 또는 위치 공유 종료 처리가 진행 중입니다.",
              );
              return;
            }
            setStoppingRequestId(work.id);
            try {
              if (!trackingToken || trackingRequestId !== work.id) {
                throw new Error(
                  "이 방문 건의 위치 공유 세션을 찾을 수 없습니다.",
                );
              }
              await stopTracking("업무취소");
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
              try {
                await refetch();
              } catch {}
              Alert.alert(
                "위치 공유 종료",
                "고객 실시간 위치 공유가 종료되었습니다.",
              );
            } catch (error: any) {
              Alert.alert(
                "위치 공유 종료 실패",
                `${error?.message || "서버에서 위치 공유를 종료하지 못했습니다."}\n네트워크를 확인한 뒤 '위치 공유 종료'를 다시 눌러 주세요.`,
              );
            } finally {
              setStoppingRequestId(null);
              releaseTerminalOperation(work.id, "stop");
            }
          },
        },
      ],
    );
  };

  const handleStopLegacyTracking = () => {
    if (!trackingToken || trackingRequestId !== null) return;
    if (stoppingRequestId !== null || arrivingRequestId !== null) {
      Alert.alert("처리 중", "진행 중인 처리가 끝난 뒤 다시 시도해 주세요.");
      return;
    }

    Alert.alert(
      "이전 위치 공유 종료",
      "이전 버전에서 시작한 위치 공유의 방문 건을 자동으로 찾지 못했습니다. 서버의 고객 위치 링크를 안전하게 종료한 뒤 새 방문을 출발할 수 있습니다.",
      [
        { text: "아니오", style: "cancel" },
        {
          text: "이전 공유 종료",
          style: "destructive",
          onPress: async () => {
            if (!acquireTerminalOperation(LEGACY_TERMINAL_REQUEST_ID, "stop")) {
              Alert.alert(
                "처리 중",
                "다른 도착 또는 위치 공유 종료 처리가 진행 중입니다.",
              );
              return;
            }
            setStoppingRequestId(LEGACY_TERMINAL_REQUEST_ID);
            try {
              const currentToken = trackingTokenRef.current;
              if (!currentToken || trackingRequestIdRef.current !== null) {
                throw new Error(
                  "이전 위치 공유가 방문 건에 연결됐습니다. 해당 방문 카드에서 종료해 주세요.",
                );
              }
              await stopTracking("업무취소");
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
              try {
                await refetch();
              } catch {}
              Alert.alert(
                "이전 위치 공유 종료",
                "서버의 이전 위치 공유가 종료되었습니다. 이제 새 방문을 출발할 수 있습니다.",
              );
            } catch (error: any) {
              Alert.alert(
                "이전 위치 공유 종료 실패",
                `${error?.message || "서버에서 이전 위치 공유를 종료하지 못했습니다."}\n네트워크를 확인한 뒤 다시 눌러 주세요.`,
              );
            } finally {
              setStoppingRequestId(null);
              releaseTerminalOperation(LEGACY_TERMINAL_REQUEST_ID, "stop");
            }
          },
        },
      ],
    );
  };

  const handleConsent = async () => {
    setShowConsentModal(false);
    const requestId = pendingDepartRequestId;
    setPendingDepartRequestId(null);
    if (requestId === null) return;
    if (!resolvedTechnicianId) {
      Alert.alert(
        "오류",
        "기사 계정 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
      );
      return;
    }

    try {
      await saveConsentMutation.mutateAsync({
        technicianId: resolvedTechnicianId,
      });
    } catch (error: any) {
      Alert.alert(
        "동의 저장 실패",
        `${error?.message || "위치정보 이용 동의를 저장하지 못했습니다."}\n네트워크를 확인한 뒤 출발 버튼을 다시 눌러 주세요.`,
      );
      return;
    }

    try {
      await consentQuery.refetch();
    } catch {}
    const work = works.find((item) => item.id === requestId);
    if (work) await doDepart(work);
  };

  const handleDeclineConsent = () => {
    setShowConsentModal(false);
    setPendingDepartRequestId(null);
  };

  return {
    trackingToken,
    trackingRequestId,
    debugState,
    permStatus,
    showConsentModal,
    handleConsent,
    handleDeclineConsent,
    handleDepart,
    handleArrive,
    handleStopSharing,
    handleResendTrackingSms,
    handleStopLegacyTracking,
    hasUnmatchedLegacyTracking:
      !!trackingToken && trackingRequestId === null && legacyScanComplete,
    isLegacyStopPending:
      stoppingRequestId === LEGACY_TERMINAL_REQUEST_ID,
    isConsentLoading,
    isStartingAny: startingRequestId !== null,
    isStartingRequest: (requestId: number) => startingRequestId === requestId,
    isArrivingRequest: (requestId: number) =>
      arrivingRequestId === requestId || stoppingRequestId === requestId,
    isResendingRequest: (requestId: number) =>
      resendingRequestId === requestId,
  };
}
