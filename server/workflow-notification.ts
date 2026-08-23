import {
  completeRepairNotificationClaim,
  type WorkflowNotificationClaim,
} from "./db.js";
import { sendNotification, type NotifyResult } from "./notification.js";

export interface WorkflowNotificationDelivery {
  accepted: boolean;
  pending: boolean;
  result?: NotifyResult["result"];
  errorMessage?: string;
}

/**
 * 트랜잭션에서 만들어진 durable claim만 실제 전송한다. 전송 실패는 FAILED로
 * 남아 다음 동일 상태 호출이 즉시 재선점하며, 성공 로그 갱신 실패는 성공으로
 * 간주하지 않아 lease 만료 후 복구할 수 있다.
 */
export async function deliverWorkflowNotificationClaim(
  claim: WorkflowNotificationClaim,
): Promise<WorkflowNotificationDelivery> {
  if (!claim.claimed) {
    if (claim.reason === "already_sent") return { accepted: true, pending: false };
    if (claim.reason === "cooldown") {
      return {
        accepted: false,
        pending: false,
        errorMessage: "최근 발송 후 5분이 지나야 다시 보낼 수 있습니다.",
      };
    }
    return { accepted: false, pending: true };
  }

  let notification: NotifyResult;
  try {
    notification = await sendNotification(claim.phoneNumber, claim.content);
  } catch (error) {
    notification = {
      channel: "SMS",
      result: "FAILED",
      fallbackUsed: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    await completeRepairNotificationClaim({
      claimId: claim.claimId,
      messageType: claim.messageType,
      content: claim.content,
      channel: notification.channel,
      result: notification.result,
      errorMessage: notification.errorMessage,
      fallbackUsed: notification.fallbackUsed,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[workflow-notification] durable result update failed", error);
    return {
      accepted: false,
      pending: true,
      result: notification.result,
      errorMessage: `발송 결과 저장 실패: ${errorMessage}`,
    };
  }

  return {
    accepted: notification.result === "SUCCESS" || notification.result === "REQUESTED",
    pending: false,
    result: notification.result,
    errorMessage: notification.errorMessage,
  };
}
