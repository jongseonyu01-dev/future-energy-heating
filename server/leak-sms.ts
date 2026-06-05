import * as db from "./db";
import { sendSms } from "./notification";

/**
 * 누수 감지 SMS 발송 헬퍼
 * - 고객에게 발송
 * - 해당 지사장에게 발송 (센서에 branchId가 있는 경우)
 * - 본사 관리자(admin_phone 설정)에게 발송
 * - 발송 결과를 notification_logs에 기록
 */
export async function dispatchLeakSms(
  sensor: {
    phoneNumber: string;
    branchId?: number | null;
    apartmentName?: string;
    dong?: string;
    ho?: string;
  },
  message: string
) {
  const results: Record<string, string | null> = {};

  // 1) 고객 발송
  const customerResult = await sendSms(sensor.phoneNumber, message);
  results.customer = customerResult.result;
  await db.createNotificationLog({
    requestId: null,
    phoneNumber: sensor.phoneNumber,
    channel: "SMS",
    messageType: "누수감지:고객",
    content: message,
    result: customerResult.result,
    errorMessage: customerResult.errorMessage,
  });

  // 2) 지사장 발송 (센서에 branchId가 있고, 지사 전화번호가 등록된 경우)
  if (sensor.branchId) {
    const branch = await db.getBranchById(sensor.branchId);
    if (branch?.phoneNumber) {
      const branchMessage = `[퓨처에너지테크 누수경보]\n${branch.name} 관할 고객 누수 감지\n${sensor.apartmentName ?? ""} ${sensor.dong ?? ""}동 ${sensor.ho ?? ""}호\n즉시 확인 바랍니다.`;
      const branchResult = await sendSms(branch.phoneNumber, branchMessage);
      results.branch = branchResult.result;
      await db.createNotificationLog({
        requestId: null,
        phoneNumber: branch.phoneNumber,
        channel: "SMS",
        messageType: "누수감지:지사장",
        content: branchMessage,
        result: branchResult.result,
        errorMessage: branchResult.errorMessage,
      });
    }
  }

  // 3) 본사 관리자 발송 (설정된 관리자 번호가 있을 경우)
  const adminPhone = await db.getSetting("admin_phone");
  if (adminPhone) {
    const adminMessage = `[퓨처에너지테크 본사 누수경보]\n${sensor.apartmentName ?? ""} ${sensor.dong ?? ""}동 ${sensor.ho ?? ""}호 누수 감지\n${sensor.branchId ? `담당 지사 ID: ${sensor.branchId}` : "담당 지사 없음 (본사 접수)"}`;
    const adminResultRaw = await sendSms(adminPhone, adminMessage);
    results.admin = adminResultRaw.result;
    await db.createNotificationLog({
      requestId: null,
      phoneNumber: adminPhone,
      channel: "SMS",
      messageType: "누수감지:본사관리자",
      content: adminMessage,
      result: adminResultRaw.result,
      errorMessage: adminResultRaw.errorMessage,
    });
  }

  return results;
}
