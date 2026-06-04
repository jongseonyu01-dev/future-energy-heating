import * as db from "./db";
import { sendSms } from "./notification";

/**
 * 누수 감지 SMS 발송 헬퍼
 * - 고객에게 발송
 * - 설정된 관리자 번호(admin_phone)가 있으면 관리자에게도 발송
 * - 발송 결과를 notification_logs에 기록
 */
export async function dispatchLeakSms(
  sensor: { phoneNumber: string },
  message: string
) {
  // 1) 고객 발송
  const customerResult = await sendSms(sensor.phoneNumber, message);
  await db.createNotificationLog({
    requestId: null,
    phoneNumber: sensor.phoneNumber,
    channel: "SMS",
    messageType: "누수감지:고객",
    content: message,
    result: customerResult.result,
    errorMessage: customerResult.errorMessage,
  });

  // 2) 관리자 발송 (설정된 관리자 번호가 있을 경우)
  const adminPhone = await db.getSetting("admin_phone");
  let adminResult: string | null = null;
  if (adminPhone) {
    const adminResultRaw = await sendSms(adminPhone, message);
    adminResult = adminResultRaw.result;
    await db.createNotificationLog({
      requestId: null,
      phoneNumber: adminPhone,
      channel: "SMS",
      messageType: "누수감지:관리자",
      content: message,
      result: adminResultRaw.result,
      errorMessage: adminResultRaw.errorMessage,
    });
  }

  return { customer: customerResult.result, admin: adminResult };
}
