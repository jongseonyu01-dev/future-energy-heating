import crypto from "crypto";

/**
 * Solapi(쏠라피) 기반 SMS / 카카오 알림톡 발송 모듈
 *
 * 환경변수:
 * - SOLAPI_API_KEY: Solapi API Key
 * - SOLAPI_API_SECRET: Solapi API Secret
 * - SOLAPI_SENDER: 사전 등록된 발신번호 (숫자만)
 *
 * 환경변수가 설정되지 않은 경우, 발송은 건너뛰며(SKIPPED) 앱 동작에는 영향을 주지 않습니다.
 */

const SOLAPI_BASE_URL = "https://api.solapi.com";

export interface SendResult {
  result: "SUCCESS" | "FAILED" | "SKIPPED";
  errorMessage?: string;
}

/**
 * Solapi HMAC-SHA256 인증 헤더 생성
 */
function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/**
 * SMS 자격증명이 설정되어 있는지 확인
 */
export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.SOLAPI_API_KEY &&
      process.env.SOLAPI_API_SECRET &&
      process.env.SOLAPI_SENDER
  );
}

/**
 * 단건 SMS/LMS 발송
 *
 * @param to 수신번호 (숫자만, 예: 01012345678)
 * @param text 메시지 내용
 */
export async function sendSms(to: string, text: string): Promise<SendResult> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;

  // 자격증명 미설정 시 건너뜀 (앱은 정상 동작)
  if (!apiKey || !apiSecret || !sender) {
    return {
      result: "SKIPPED",
      errorMessage: "SMS 자격증명(SOLAPI_API_KEY 등)이 설정되지 않았습니다.",
    };
  }

  // 수신번호 정규화 (숫자만)
  const normalizedTo = to.replace(/[^0-9]/g, "");
  const normalizedFrom = sender.replace(/[^0-9]/g, "");

  try {
    const response = await fetch(
      `${SOLAPI_BASE_URL}/messages/v4/send-many/detail`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: buildAuthHeader(apiKey, apiSecret),
        },
        body: JSON.stringify({
          messages: [
            {
              to: normalizedTo,
              from: normalizedFrom,
              text,
              // autoTypeDetect: 90byte 초과 시 자동으로 LMS 발송
              autoTypeDetect: true,
            },
          ],
        }),
      }
    );

    const data = (await response.json()) as {
      failedMessageList?: unknown[];
      errorMessage?: string;
    };

    if (!response.ok) {
      return {
        result: "FAILED",
        errorMessage: data?.errorMessage || `HTTP ${response.status}`,
      };
    }

    // 등록 실패 메시지가 있는 경우
    if (
      Array.isArray(data.failedMessageList) &&
      data.failedMessageList.length > 0
    ) {
      return {
        result: "FAILED",
        errorMessage: JSON.stringify(data.failedMessageList),
      };
    }

    return { result: "SUCCESS" };
  } catch (error) {
    return {
      result: "FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 접수 완료 안내 메시지 생성 (기존 - 하위 호환 유지)
 */
export function buildReceivedMessage(
  customerName: string,
  requestNumber: string,
  requestTypeLabel: string
): string {
  return `[퓨처에너지테크]\n${customerName}님, ${requestTypeLabel} 접수가 완료되었습니다.\n접수번호: ${requestNumber}\n담당 기사 배정 후 다시 안내드리겠습니다.\n문의: 031-8042-7310`;
}

/**
 * 고객에게 발송할 접수 완료 문자 (요청 형식)
 */
export function buildCustomerReceivedMessage(params: {
  requestType: string;
  symptoms: string[];
  apartmentName: string;
  dong: string;
  ho: string;
}): string {
  const symptomsText = params.symptoms.length > 0
    ? params.symptoms.join(", ")
    : "(증상 미선택)";
  return `[퓨처에너지테크]\n접수가 완료되었습니다.\n접수 유형: ${params.requestType}\n증상: ${symptomsText}\n주소: ${params.apartmentName} ${params.dong}동 ${params.ho}호\n담당자가 확인 후 연락드리겠습니다.`;
}

/**
 * 본사 관리자에게 발송할 신규 접수 알림 문자 (요청 형식)
 */
export function buildAdminReceivedMessage(params: {
  customerName: string;
  phoneNumber: string;
  requestType: string;
  symptoms: string[];
  apartmentName: string;
  dong: string;
  ho: string;
}): string {
  const symptomsText = params.symptoms.length > 0
    ? params.symptoms.join(", ")
    : "(증상 미선택)";
  return `[퓨처에너지테크]
신규 접수가 등록되었습니다.\n고객명: ${params.customerName}\n전화번호: ${params.phoneNumber}\n주소: ${params.apartmentName} ${params.dong}동 ${params.ho}호\n접수 유형: ${params.requestType}\n증상: ${symptomsText}`;
}

/**
 * 문자 발송 테스트 메시지
 */
export function buildSmsTestMessage(): string {
  return `[퓨처에너지테크]\n문자 발송 테스트가 정상적으로 완료되었습니다.`;
}

/**
 * SOLAPI 에러코드 → 사람이 읽기 쉬운 메시지로 변환
 */
export function friendlySmsError(errorMessage: string | undefined): string {
  if (!errorMessage) return "알 수 없는 오류";
  const msg = errorMessage.toLowerCase();
  if (msg.includes("authentication") || msg.includes("unauthorized") || msg.includes("invalid api")) {
    return "SOLAPI 인증 실패 (API Key/Secret 확인 필요)";
  }
  if (msg.includes("unregistered") || msg.includes("sender") || msg.includes("from")) {
    return "발신번호 미등록 (SOLAPI에서 발신번호 등록 필요)";
  }
  if (msg.includes("balance") || msg.includes("credit") || msg.includes("insufficient")) {
    return "잔액 부족 (SOLAPI 충전 필요)";
  }
  if (msg.includes("to") || msg.includes("phone") || msg.includes("number")) {
    return "수신번호 형식 오류";
  }
  if (msg.includes("server") || msg.includes("500") || msg.includes("503")) {
    return "서버 오류 (잠시 후 재시도)";
  }
  return errorMessage;
}

/**
 * 상태 변경 안내 메시지 생성
 */
export function buildStatusChangeMessage(
  customerName: string,
  requestNumber: string,
  status: string,
  technicianName?: string | null,
  scheduledDate?: string | null,
  scheduledTime?: string | null
): string {
  let extra = "";
  if (status === "방문예정" && technicianName) {
    extra = `\n담당 기사: ${technicianName}`;
    if (scheduledDate) {
      extra += `\n방문 예정: ${scheduledDate} ${scheduledTime ?? ""}`.trimEnd();
    }
  }
  if (status === "작업완료") {
    extra = "\n작업이 완료되었습니다. 이용해 주셔서 감사합니다.";
  }
  return `[퓨처에너지테크]\n${customerName}님, 접수하신 건(${requestNumber})의 처리 상태가 '${status}'(으)로 변경되었습니다.${extra}\n문의: 031-8042-7310`;
}

/**
 * 유량 이탈 경고 SMS 메시지 생성 (본사 관리자 + 담당 지사장)
 */
export function buildFlowRateAlertMessage(params: {
  apartmentName: string;
  buildingNumber: string;
  roomNumber: string;
  sensorId: string;
  currentFlowRate: number;
  baseFlowRate: number;
  status: "주의" | "경고";
  durationMinutes: number;
}): string {
  const diff = params.currentFlowRate - params.baseFlowRate;
  const diffSign = diff >= 0 ? "+" : "";
  const diffPercent = ((Math.abs(diff) / params.baseFlowRate) * 100).toFixed(1);
  return `[퓨처에너지테크]
유량 ${params.status} 알림\n${params.apartmentName} ${params.buildingNumber} ${params.roomNumber}\n기준 유량: ${params.baseFlowRate.toFixed(2)} LPM\n현재 유량: ${params.currentFlowRate.toFixed(2)} LPM (${diffSign}${diff.toFixed(2)}, ${diffPercent}% 이탈)\n${params.durationMinutes}분 이상 지속 중\n즉시 확인 바랍니다. 031-8042-7310`;
}

/**
 * 누수 감지 알림 메시지 생성 (고객/관리자 공통)
 */
export function buildLeakAlertMessage(
  apartmentName: string,
  dong: string,
  ho: string,
  installLocation: string
): string {
  const dongPart = dong && dong !== "-" ? `${dong}동 ` : "";
  return `[퓨처에너지테크]\n누수 감지 알림입니다.\n${apartmentName} ${dongPart}${ho}호의 ${installLocation}에서 누수가 감지되었습니다.\n즉시 확인하거나 고객센터로 연락해 주세요. 031-8042-7310`;
}

/**
 * 기사 출발 알림 SMS 메시지 생성 (고객용)
 */
export function buildTechnicianDepartedMessage(
  customerName: string,
  technicianName: string,
  trackingUrl: string
): string {
  return `[퓨처에너지테크]
${customerName}님, 담당 기사(${technicianName})가 고객님 댁으로 출발했습니다.
아래 링크에서 현재 위치와 예상 도착 시간을 확인할 수 있습니다.
기사 위치 확인: ${trackingUrl}
문의: 031-8042-7310`;
}


/**
 * 카카오 알림톡 자격증명(템플릿/플러스친구) 설정 여부.
 * 알림톡 템플릿이 승인/설정되기 전에는 false → 문자(SMS)만 사용.
 * 승인 후 SOLAPI_KAKAO_PFID / SOLAPI_ALIMTALK_ENABLED 를 설정하면 true.
 */
export function isAlimtalkConfigured(): boolean {
  return Boolean(
    process.env.SOLAPI_ALIMTALK_ENABLED === "true" &&
      process.env.SOLAPI_KAKAO_PFID
  );
}

export interface NotifyResult {
  /** 최종 발송에 사용된 채널 */
  channel: "ALIMTALK" | "SMS";
  result: "SUCCESS" | "FAILED" | "SKIPPED";
  /** 알림톡 시도 후 문자로 대체 발송되었는지 */
  fallbackUsed: boolean;
  errorMessage?: string;
}

/**
 * 알림 발송 통합 함수.
 * - 알림톡이 설정된 경우: 알림톡 우선 시도 → 실패 시 문자(SMS)로 자동 대체
 * - 알림톡 미설정(승인 전): 문자(SMS)만 발송
 *
 * 현재 SOLAPI 알림톡 발송 API 연동은 템플릿 승인 후 활성화되며,
 * 그 전까지는 문자 단독 발송으로 동작한다(요구사항: 승인 전 문자 유지).
 */
export async function sendNotification(
  to: string,
  text: string
): Promise<NotifyResult> {
  // 알림톡 미설정 → 문자 단독 발송
  if (!isAlimtalkConfigured()) {
    const sms = await sendSms(to, text);
    return {
      channel: "SMS",
      result: sms.result,
      fallbackUsed: false,
      errorMessage: sms.errorMessage,
    };
  }

  // 알림톡 설정됨 → 알림톡 시도 (현재는 SOLAPI 알림톡 API 자리표시자)
  const alimtalk = await sendAlimtalk(to, text);
  if (alimtalk.result === "SUCCESS") {
    return { channel: "ALIMTALK", result: "SUCCESS", fallbackUsed: false };
  }

  // 알림톡 실패 → 문자 대체 발송
  const sms = await sendSms(to, text);
  return {
    channel: "SMS",
    result: sms.result,
    fallbackUsed: true,
    errorMessage:
      sms.result === "SUCCESS"
        ? `알림톡 실패(${alimtalk.errorMessage ?? "?"}) → 문자 대체 발송`
        : sms.errorMessage,
  };
}

/**
 * 카카오 알림톡 단건 발송 (SOLAPI).
 * 템플릿 승인 후 실제 연동을 채운다. 현재는 미설정 시 SKIPPED 반환.
 */
export async function sendAlimtalk(
  _to: string,
  _text: string
): Promise<SendResult> {
  // 템플릿 승인 전: 미구현 → 실패 처리하여 상위에서 문자 대체되도록 함
  return {
    result: "FAILED",
    errorMessage: "알림톡 템플릿 미승인(설정 후 활성화)",
  };
}

/** 지사 배정 안내 (고객용) */
export function buildBranchAssignedMessage(
  customerName: string,
  branchName: string,
  branchPhone?: string | null
): string {
  const phonePart = branchPhone ? `\n지사 연락처: ${branchPhone}` : "";
  return `[퓨처에너지테크]\n${customerName}님, 접수하신 건의 담당 지사가 '${branchName}'(으)로 배정되었습니다.${phonePart}\n곧 방문 일정을 안내드리겠습니다.\n문의: 031-8042-7310`;
}

/** 방문 일정 확정/변경 안내 (고객용) */
export function buildScheduleConfirmedMessage(
  customerName: string,
  scheduledDate: string,
  scheduledTime: string,
  isChanged: boolean,
  changeReason?: string | null
): string {
  const head = isChanged ? "방문 일정이 변경되었습니다" : "방문 일정이 확정되었습니다";
  const reasonPart =
    isChanged && changeReason ? `\n변경 사유: ${changeReason}` : "";
  return `[퓨처에너지테크]\n${customerName}님, ${head}.\n방문 일정: ${scheduledDate} ${scheduledTime}${reasonPart}\n문의: 031-8042-7310`;
}

/** 기사 도착 안내 (고객용) */
export function buildTechnicianArrivedMessage(
  customerName: string,
  technicianName: string
): string {
  return `[퓨처에너지테크]\n${customerName}님, 담당 기사(${technicianName})가 도착했습니다.\n잠시만 기다려 주세요.\n문의: 031-8042-7310`;
}

/** 작업 완료 안내 (고객용, 후기 링크 선택) */
export function buildWorkCompletedMessage(
  customerName: string,
  reviewUrl?: string | null
): string {
  const reviewPart = reviewUrl ? `\n후기 작성: ${reviewUrl}` : "";
  return `[퓨처에너지테크]\n${customerName}님, 요청하신 작업이 완료되었습니다.\n이용해 주셔서 감사합니다.${reviewPart}\n문의: 031-8042-7310`;
}
