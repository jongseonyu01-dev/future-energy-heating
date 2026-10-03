import type { Express, Request, Response } from "express";
import * as db from "./db";
import { buildLeakAlertMessage } from "./notification";
import { dispatchLeakSms } from "./leak-sms";

/**
 * 외부 IoT 누수센서 업체 연동용 웹훅 엔드포인트
 *
 * 실제 센서 업체의 API/웹훅이 확정되면 이 엔드포인트로 데이터를 전송하도록 안내합니다.
 *
 * POST /api/sensor-webhook
 * Body(JSON):
 * {
 *   "sensorUid": "SENSOR-XXXX",   // 센서 고유 ID (필수)
 *   "customerId": 123,             // (선택) 고객 식별용 - 현재는 sensorUid로 매핑
 *   "leakDetected": true,          // 누수 여부 (필수)
 *   "batteryLevel": 87,            // 배터리 잔량 0~100 (선택)
 *   "lastCommAt": "2025-01-01T00:00:00Z" // 마지막 통신 시간 ISO8601 (선택)
 * }
 *
 * 보안: 헤더 X-Webhook-Secret 값이 환경변수 SENSOR_WEBHOOK_SECRET 과 일치해야 합니다.
 * (SENSOR_WEBHOOK_SECRET 미설정 시 인증을 건너뜁니다 - 데모/개발 편의)
 */
export function registerSensorWebhook(app: Express) {
  app.post("/api/sensor-webhook", async (req: Request, res: Response) => {
    try {
      // 1) 인증 (시크릿이 설정된 경우에만 검사)
      const expectedSecret = process.env.SENSOR_WEBHOOK_SECRET;
      if (expectedSecret) {
        const provided = req.header("X-Webhook-Secret");
        if (provided !== expectedSecret) {
          return res.status(401).json({ ok: false, error: "Unauthorized" });
        }
      }

      // 2) 페이로드 파싱
      const body = req.body ?? {};
      // 센서 업체마다 필드명이 다를 수 있어 약식 별칭도 허용
      const sensorUid: unknown = body.sensorUid ?? body.sensor_uid ?? body.sensorId;
      const leakDetected: unknown =
        body.leakDetected ?? body.leak_detected ?? body.leak;
      const batteryLevel: unknown =
        body.batteryLevel ?? body.battery_level ?? body.battery;
      const lastCommRaw: unknown =
        body.lastCommAt ?? body.last_comm_at ?? body.lastCommunication;

      if (typeof sensorUid !== "string" || sensorUid.length === 0) {
        return res
          .status(400)
          .json({ ok: false, error: "sensorUid is required" });
      }

      const isLeak = leakDetected === true || leakDetected === "true";
      const battery =
        typeof batteryLevel === "number"
          ? batteryLevel
          : typeof batteryLevel === "string" && batteryLevel !== ""
            ? Number(batteryLevel)
            : undefined;
      const lastCommAt =
        typeof lastCommRaw === "string" && lastCommRaw
          ? new Date(lastCommRaw)
          : new Date();

      // 3) 센서 조회
      const sensor = await db.getSensorByUid(sensorUid);
      if (!sensor) {
        // 미등록 센서도 이벤트는 기록 (추적용)
        await db.createSensorEvent({
          sensorUid,
          leakDetected: isLeak,
          batteryLevel: battery,
          reportedAt: lastCommAt,
          source: "WEBHOOK",
          rawPayload: JSON.stringify(body),
        });
        return res
          .status(404)
          .json({ ok: false, error: "Unknown sensorUid (event logged)" });
      }

      // 4) 상태 결정 (누수 > 배터리부족 > 정상)
      let nextStatus: typeof sensor.status = "정상";
      if (isLeak) {
        nextStatus = "누수감지";
      } else if (battery !== undefined && !Number.isNaN(battery) && battery <= 20) {
        nextStatus = "배터리부족";
      }

      // 5) 센서 상태 업데이트
      await db.updateSensorState(sensorUid, {
        status: nextStatus,
        ...(battery !== undefined && !Number.isNaN(battery)
          ? { batteryLevel: battery }
          : {}),
        lastCommAt,
        ...(isLeak ? { leakDetectedAt: lastCommAt, isResolved: false } : {}),
      });

      // 6) 이벤트 기록
      await db.createSensorEvent({
        sensorUid,
        leakDetected: isLeak,
        batteryLevel: battery,
        reportedAt: lastCommAt,
        source: "WEBHOOK",
        rawPayload: JSON.stringify(body),
      });

      // 7) 누수 감지 시 SMS 발송 (고객 + 관리자)
      let smsResult = null;
      if (isLeak) {
        const message = buildLeakAlertMessage(
          sensor.apartmentName,
          sensor.dong,
          sensor.ho,
          sensor.installLocation
        );
        smsResult = await dispatchLeakSms(sensor, message);
      }

      return res.json({
        ok: true,
        sensorUid,
        status: nextStatus,
        sms: smsResult,
      });
    } catch (error) {
      console.error("[Webhook] sensor-webhook error:", error);
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
