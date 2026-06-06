import express, { type Express, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import {
  getAllRepairRequests,
  getAllFlowRateSettings,
  getFlowRateSettingBySensorId,
  upsertFlowRateSetting,
  updateFlowRateSetting,
  updateFlowRateLastData,
  deleteFlowRateSetting,
  createFlowRateLog,
  getFlowRateLogs,
  getRecentFlowRateLogs,
  getAppRolesByRole,
  getBranchById,
} from "./db";
import { sendSms, buildFlowRateAlertMessage, buildTechnicianDepartedMessage } from "./notification";
import {
  createLocationSession,
  getLocationSessionByToken,
  updateLocationSessionPosition,
  stopLocationSession,
  markLocationSessionSmsSent,
  getActiveLocationSessions,
  getActiveLocationSessionsByBranch,
  expireOldLocationSessions,
  getLocationConsent,
  createLocationConsent,
} from "./db";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export function registerWebRoutes(app: Express) {
  // 정적 파일 서빙 - /web 경로로 홈페이지 HTML 파일 제공
  const webDir = path.join(PUBLIC_DIR, "web");
  if (fs.existsSync(webDir)) {
    app.use("/web", express.static(webDir, { index: "index.html" }));
  }

  // 비공개 테스트용 홈페이지 - /preview 경로 (비밀번호 보호는 클라이언트 측에서 처리)
  const previewDir = path.join(PUBLIC_DIR, "preview");
  if (fs.existsSync(previewDir)) {
    app.use("/preview", express.static(previewDir, { index: "gate.html" }));
  }

  // robots.txt 서빙
  const robotsPath = path.join(PUBLIC_DIR, "robots.txt");
  app.get("/robots.txt", (_req: Request, res: Response) => {
    if (fs.existsSync(robotsPath)) {
      res.setHeader("Content-Type", "text/plain");
      res.sendFile(robotsPath);
    } else {
      res.type("text/plain").send("User-agent: *\nDisallow: /preview/\n");
    }
  });

  // 엑셀(CSV) 다운로드 API - 전국 접수 현황
  app.get("/api/excel/repairs", async (_req: Request, res: Response) => {
    try {
      const repairs = await getAllRepairRequests();
      const csvRows = [
        ["접수번호", "고객명", "전화번호", "아파트명", "동", "호수", "증상", "상태", "접수일", "방문예정일"].join(","),
        ...repairs.map((r: any) => [
          r.id,
          `"${r.customerName || ""}"`,
          r.customerPhone || "",
          `"${r.aptName || ""}"`,
          r.dong || "",
          r.ho || "",
          `"${Array.isArray(r.symptoms) ? r.symptoms.join(" / ") : r.symptom || ""}"`,
          r.status || "pending",
          r.createdAt ? String(r.createdAt).slice(0, 10) : "",
          r.visitDate || "",
        ].join(","))
      ];
      const bom = "\uFEFF"; // UTF-8 BOM for Excel
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent("접수현황_" + new Date().toISOString().slice(0, 10))}.csv`
      );
      res.send(bom + csvRows.join("\n"));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── 위치 추적 API ──────────────────────────────────────────────

  // 고객용 위치 확인 페이지 (토큰 기반)
  app.get("/track/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const trackingPagePath = path.join(PUBLIC_DIR, "preview", "track.html");
    if (fs.existsSync(trackingPagePath)) {
      res.sendFile(trackingPagePath);
    } else {
      res.status(404).send("위치 확인 페이지를 찾을 수 없습니다.");
    }
  });

  // 위치 세션 정보 조회 (고객용 - 토큰으로 조회)
  app.get("/api/location/session/:token", async (req: Request, res: Response) => {
    try {
      await expireOldLocationSessions();
      const session = await getLocationSessionByToken(req.params.token);
      if (!session) {
        return res.status(404).json({ error: "세션을 찾을 수 없거나 만료되었습니다." });
      }
      // 고객에게는 최소한의 정보만 노출 (출발지/전체 이력 제외)
      res.json({
        status: session.status,
        technicianName: session.technicianName,
        technicianPhone: session.technicianPhone,
        customerAddress: session.customerAddress,
        customerLat: session.customerLat,
        customerLng: session.customerLng,
        currentLat: session.currentLat,
        currentLng: session.currentLng,
        currentUpdatedAt: session.currentUpdatedAt,
        departedAt: session.departedAt,
        arrivedAt: session.arrivedAt,
        expiresAt: session.expiresAt,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 위치 업데이트 (기사 앱 → 서버, 30초 간격)
  app.post("/api/location/update", async (req: Request, res: Response) => {
    try {
      const { token, lat, lng } = req.body;
      if (!token || lat === undefined || lng === undefined) {
        return res.status(400).json({ error: "token, lat, lng 필수" });
      }
      const session = await getLocationSessionByToken(token);
      if (!session) {
        return res.status(404).json({ error: "세션 없음" });
      }
      if (session.status !== "이동중") {
        return res.status(400).json({ error: "이미 종료된 세션입니다.", status: session.status });
      }
      // 만료 확인
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        await stopLocationSession(token, "만료");
        return res.status(400).json({ error: "세션이 만료되었습니다.", status: "만료" });
      }
      await updateLocationSessionPosition(token, String(lat), String(lng));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 위치 세션 종료 (기사 앱 → 도착/취소)
  app.post("/api/location/stop", async (req: Request, res: Response) => {
    try {
      const { token, reason } = req.body;
      if (!token || !reason) {
        return res.status(400).json({ error: "token, reason 필수" });
      }
      if (!["도착완료", "업무취소"].includes(reason)) {
        return res.status(400).json({ error: "reason은 도착완료 또는 업무취소" });
      }
      await stopLocationSession(token, reason as "도착완료" | "업무취소");
      res.json({ success: true, status: reason });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 관리자용 - 이동 중 기사 전체 목록
  app.get("/api/location/active", async (_req: Request, res: Response) => {
    try {
      await expireOldLocationSessions();
      const sessions = await getActiveLocationSessions();
      res.json({ sessions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 지사장용 - 소속 지사 이동 중 기사 목록
  app.get("/api/location/active/branch/:branchId", async (req: Request, res: Response) => {
    try {
      await expireOldLocationSessions();
      const branchId = parseInt(req.params.branchId);
      const sessions = await getActiveLocationSessionsByBranch(branchId);
      res.json({ sessions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 루트 / → /web 리다이렉트
  app.get("/", (_req: Request, res: Response) => {
    res.redirect("/web");
  });

  // ─── 유량 관리 API ───────────────────────────────────────────────

  // 세대별 유량 설정 목록 조회
  app.get("/api/flow-rate/settings", async (_req: Request, res: Response) => {
    try {
      const settings = await getAllFlowRateSettings();
      res.json({ success: true, data: settings });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 세대별 유량 설정 수정
  app.put("/api/flow-rate/settings/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { baseFlowRateLpm, warningRangePercent, cautionRangePercent, alertDurationMinutes, apartmentName, buildingNumber, roomNumber, branchId } = req.body;
      await updateFlowRateSetting(id, {
        ...(baseFlowRateLpm !== undefined && { baseFlowRateLpm: String(baseFlowRateLpm) }),
        ...(warningRangePercent !== undefined && { warningRangePercent: Number(warningRangePercent) }),
        ...(cautionRangePercent !== undefined && { cautionRangePercent: Number(cautionRangePercent) }),
        ...(alertDurationMinutes !== undefined && { alertDurationMinutes: Number(alertDurationMinutes) }),
        ...(apartmentName !== undefined && { apartmentName }),
        ...(buildingNumber !== undefined && { buildingNumber }),
        ...(roomNumber !== undefined && { roomNumber }),
        ...(branchId !== undefined && { branchId: Number(branchId) }),
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 세대별 유량 설정 생성
  app.post("/api/flow-rate/settings", async (req: Request, res: Response) => {
    try {
      const { sensorId, branchId, apartmentName, buildingNumber, roomNumber, baseFlowRateLpm, warningRangePercent, cautionRangePercent, alertDurationMinutes } = req.body;
      if (!sensorId || !apartmentName || !buildingNumber || !roomNumber) {
        return res.status(400).json({ success: false, error: "필수 필드 누락" });
      }
      await upsertFlowRateSetting({
        sensorId,
        branchId: branchId ? Number(branchId) : null,
        apartmentName,
        buildingNumber,
        roomNumber,
        baseFlowRateLpm: String(baseFlowRateLpm ?? "5.50"),
        warningRangePercent: Number(warningRangePercent ?? 30),
        cautionRangePercent: Number(cautionRangePercent ?? 15),
        alertDurationMinutes: Number(alertDurationMinutes ?? 10),
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 세대별 유량 설정 삭제
  app.delete("/api/flow-rate/settings/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await deleteFlowRateSetting(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 유량 로그 조회
  app.get("/api/flow-rate/logs", async (req: Request, res: Response) => {
    try {
      const sensorId = req.query.sensorId as string | undefined;
      const limit = parseInt(req.query.limit as string ?? "100");
      const logs = sensorId
        ? await getFlowRateLogs(sensorId, limit)
        : await getRecentFlowRateLogs(limit);
      res.json({ success: true, data: logs });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── ESP32 웹훅 API ───────────────────────────────────────────────
  app.post("/api/webhook/flow-rate", async (req: Request, res: Response) => {
    try {
      const {
        sensorId,
        customerId,
        branchId,
        apartmentName,
        buildingNumber,
        roomNumber,
        flowRateLpm,
        supplyPressure,
        returnPressure,
        differentialPressure,
        measuredAt,
        status: rawStatus,
      } = req.body;

      if (!sensorId || flowRateLpm === undefined) {
        return res.status(400).json({ success: false, error: "sensorId와 flowRateLpm은 필수입니다." });
      }

      const now = measuredAt ? new Date(measuredAt) : new Date();
      const flowNum = parseFloat(String(flowRateLpm));

      // 기존 설정 조회
      let setting = await getFlowRateSettingBySensorId(sensorId);

      // 설정 없으면 자동 생성
      if (!setting) {
        await upsertFlowRateSetting({
          sensorId,
          branchId: branchId ? Number(branchId) : null,
          apartmentName: apartmentName ?? "(미등록)",
          buildingNumber: buildingNumber ?? "-",
          roomNumber: roomNumber ?? "-",
          baseFlowRateLpm: String(flowNum.toFixed(2)),
          warningRangePercent: 30,
          cautionRangePercent: 15,
          alertDurationMinutes: 10,
        });
        setting = await getFlowRateSettingBySensorId(sensorId);
      }

      // 상태 계산 (설정이 있으면 기준 유량 대비 이탈 퍼센트 계산)
      let computedStatus: "정상" | "주의" | "경고" = "정상";
      if (setting) {
        const base = parseFloat(String(setting.baseFlowRateLpm));
        const diffPct = Math.abs((flowNum - base) / base) * 100;
        const warnPct = setting.warningRangePercent;
        const cautionPct = setting.cautionRangePercent;
        if (diffPct >= warnPct) computedStatus = "경고";
        else if (diffPct >= cautionPct) computedStatus = "주의";
        else computedStatus = "정상";
      } else if (rawStatus && ["정상", "주의", "경고"].includes(rawStatus)) {
        computedStatus = rawStatus as "정상" | "주의" | "경고";
      }

      // 로그 기록
      await createFlowRateLog({
        sensorId,
        branchId: branchId ? Number(branchId) : (setting?.branchId ?? null),
        apartmentName: apartmentName ?? setting?.apartmentName,
        buildingNumber: buildingNumber ?? setting?.buildingNumber,
        roomNumber: roomNumber ?? setting?.roomNumber,
        flowRateLpm: String(flowNum.toFixed(2)),
        supplyPressure: supplyPressure !== undefined ? String(parseFloat(supplyPressure).toFixed(3)) : null,
        returnPressure: returnPressure !== undefined ? String(parseFloat(returnPressure).toFixed(3)) : null,
        differentialPressure: differentialPressure !== undefined ? String(parseFloat(differentialPressure).toFixed(3)) : null,
        measuredAt: now,
        status: computedStatus,
        source: "WEBHOOK",
      });

      // 설정 캐시 업데이트 + 경고 추적
      if (setting) {
        const base = parseFloat(String(setting.baseFlowRateLpm));
        const alertMinutes = setting.alertDurationMinutes;
        let alertStartedAt = setting.alertStartedAt ? new Date(setting.alertStartedAt) : null;
        let alertSentAt = setting.alertSentAt ? new Date(setting.alertSentAt) : null;

        if (computedStatus === "정상") {
          // 정상 복교 시 경고 추적 리셋
          alertStartedAt = null;
        } else {
          // 이탈 중 - 시작 시각 기록
          if (!alertStartedAt) alertStartedAt = now;

          // 10분 이상 지속 여부 확인
          const elapsedMs = now.getTime() - alertStartedAt.getTime();
          const elapsedMinutes = elapsedMs / 60000;

          if (elapsedMinutes >= alertMinutes) {
            // 지난 1시간 내 이미 발송한 경우 중복 발송 방지
            const lastSentMs = alertSentAt ? now.getTime() - alertSentAt.getTime() : Infinity;
            if (lastSentMs > 60 * 60 * 1000) {
              // SMS 발송
              const msg = buildFlowRateAlertMessage({
                apartmentName: setting.apartmentName,
                buildingNumber: setting.buildingNumber,
                roomNumber: setting.roomNumber,
                sensorId,
                currentFlowRate: flowNum,
                baseFlowRate: base,
                status: computedStatus as "주의" | "경고",
                durationMinutes: Math.floor(elapsedMinutes),
              });

              // 본사 관리자 번호 조회
              try {
                const admins = await getAppRolesByRole("hq_admin");
                for (const admin of admins) {
                  if (admin.phoneNumber) await sendSms(admin.phoneNumber, msg);
                }
                // 담당 지사장 번호 조회
                const bid = branchId ?? setting.branchId;
                if (bid) {
                  const branch = await getBranchById(Number(bid));
                  if (branch?.phoneNumber) await sendSms(branch.phoneNumber, msg);
                }
              } catch (smsErr) {
                console.error("[FlowRate] SMS 발송 오류:", smsErr);
              }
              alertSentAt = now;
            }
          }
        }

        await updateFlowRateLastData(sensorId, {
          lastFlowRateLpm: String(flowNum.toFixed(2)),
          lastSupplyPressure: supplyPressure !== undefined ? String(parseFloat(supplyPressure).toFixed(3)) : null,
          lastReturnPressure: returnPressure !== undefined ? String(parseFloat(returnPressure).toFixed(3)) : null,
          lastDifferentialPressure: differentialPressure !== undefined ? String(parseFloat(differentialPressure).toFixed(3)) : null,
          lastMeasuredAt: now,
          lastStatus: computedStatus,
          alertStartedAt,
          alertSentAt,
        });
      }

      res.json({
        success: true,
        sensorId,
        status: computedStatus,
        flowRateLpm: flowNum,
        measuredAt: now.toISOString(),
      });
    } catch (e: any) {
      console.error("[FlowRate Webhook] 오류:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}
