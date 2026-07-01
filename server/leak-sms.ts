import * as db from "./db";
import { sendSms } from "./notification";

/**
 * 누수 감지 SMS 발송 헬퍼
 *
 * 발송 대상:
 * 1) 고객 (sensor.phoneNumber)
 * 2) 지사장 (sensor.branchId가 있는 경우 해당 지사 phoneNumber)
 * 3) 본사 관리자 (app_settings.admin_phone)
 * 4) 추가 알림 번호 (app_settings.leak_alert_phones, 쉼표 구분)
 *
 * 모든 발송 결과는 notification_logs에 상세 저장됨:
 * - sensorUid, customerName, customerPhone, provider, groupId, messageId,
 *   sendStatus, failReason, responsePayload, sentAt
 */
export async function dispatchLeakSms(
  sensor: {
    sensorUid?: string;
    customerName?: string;
    phoneNumber: string;
    branchId?: number | null;
    apartmentName?: string;
    dong?: string;
    ho?: string;
    installLocation?: string;
  },
  message: string
) {
  const results: Record<string, string | null> = {};
  const sentAt = new Date();

  // 공통 로그 저장 헬퍼
  async function logSms(
    phoneNumber: string,
    messageType: string,
    content: string,
    smsResult: Awaited<ReturnType<typeof sendSms>>
  ) {
    const sendStatus = smsResult.result;
    await db.createNotificationLog({
      requestId: null,
      phoneNumber,
      channel: "SMS",
      messageType,
      content,
      result: (sendStatus === "REQUESTED" || sendStatus === "SUCCESS") ? "SUCCESS" : sendStatus as "FAILED" | "SKIPPED",
      errorMessage: smsResult.errorMessage,
      fallbackUsed: false,
      // 상세 필드
      sensorUid: sensor.sensorUid ?? null,
      customerName: sensor.customerName ?? null,
      customerPhone: sensor.phoneNumber,
      provider: smsResult.provider ?? "solapi",
      groupId: smsResult.groupId ?? null,
      messageId: smsResult.messageId ?? null,
      sendStatus,
      failReason: smsResult.errorMessage ?? null,
      responsePayload: smsResult.responsePayload ?? null,
      sentAt,
    } as Parameters<typeof db.createNotificationLog>[0]);
  }

  // 1) 고객 발송
  const customerResult = await sendSms(sensor.phoneNumber, message);
  results.customer = customerResult.result;
  await logSms(sensor.phoneNumber, "누수감지:고객", message, customerResult);

  // 2) 지사장 발송 (센서에 branchId가 있고, 지사 전화번호가 등록된 경우)
  if (sensor.branchId) {
    const branch = await db.getBranchById(sensor.branchId);
    if (branch?.phoneNumber) {
      const branchMessage = `[퓨처에너지테크 누수경보]\n${branch.name} 관할 고객 누수 감지\n${sensor.apartmentName ?? ""} ${sensor.dong ?? ""}동 ${sensor.ho ?? ""}호\n${sensor.installLocation ? `위치: ${sensor.installLocation}\n` : ""}즉시 확인 바랍니다. 031-8042-7310`;
      const branchResult = await sendSms(branch.phoneNumber, branchMessage);
      results.branch = branchResult.result;
      await logSms(branch.phoneNumber, "누수감지:지사장", branchMessage, branchResult);
    }
  }

  // 3) 본사 관리자 발송 (app_settings.admin_phone)
  const adminPhone = await db.getSetting("admin_phone");
  if (adminPhone) {
    const normalizedAdmin = adminPhone.replace(/[^0-9]/g, "");
    if (normalizedAdmin && normalizedAdmin !== sensor.phoneNumber.replace(/[^0-9]/g, "")) {
      const adminMessage = `[퓨처에너지테크 본사 누수경보]\n${sensor.apartmentName ?? ""} ${sensor.dong ?? ""}동 ${sensor.ho ?? ""}호 누수 감지${sensor.installLocation ? `\n위치: ${sensor.installLocation}` : ""}\n고객: ${sensor.customerName ?? "-"} (${sensor.phoneNumber})\n${sensor.branchId ? `담당 지사 ID: ${sensor.branchId}` : "담당 지사 없음 (본사 접수)"}`;
      const adminResult = await sendSms(adminPhone, adminMessage);
      results.admin = adminResult.result;
      await logSms(adminPhone, "누수감지:본사관리자", adminMessage, adminResult);
    }
  }

  // 4) 추가 알림 번호 발송 (app_settings.leak_alert_phones, 쉼표 구분)
  const extraPhonesRaw = await db.getSetting("leak_alert_phones");
  if (extraPhonesRaw) {
    const extraPhones = extraPhonesRaw
      .split(/[,\s]+/)
      .map((p) => p.replace(/[^0-9]/g, ""))
      .filter((p) => p.length >= 10);

    const alreadySent = new Set([
      sensor.phoneNumber.replace(/[^0-9]/g, ""),
      adminPhone ? adminPhone.replace(/[^0-9]/g, "") : "",
    ]);

    for (const extraPhone of extraPhones) {
      if (alreadySent.has(extraPhone)) continue;
      alreadySent.add(extraPhone);
      const extraMessage = `[퓨처에너지테크 누수경보]\n${sensor.apartmentName ?? ""} ${sensor.dong ?? ""}동 ${sensor.ho ?? ""}호 누수 감지${sensor.installLocation ? `\n위치: ${sensor.installLocation}` : ""}\n고객: ${sensor.customerName ?? "-"} (${sensor.phoneNumber})`;
      const extraResult = await sendSms(extraPhone, extraMessage);
      results[`extra_${extraPhone}`] = extraResult.result;
      await logSms(extraPhone, "누수감지:추가알림", extraMessage, extraResult);
    }
  }

  return results;
}
