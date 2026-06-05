import express, { type Express, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { getAllRepairRequests } from "./db";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export function registerWebRoutes(app: Express) {
  // 정적 파일 서빙 - /web 경로로 홈페이지 HTML 파일 제공
  const webDir = path.join(PUBLIC_DIR, "web");
  if (fs.existsSync(webDir)) {
    app.use("/web", express.static(webDir, { index: "index.html" }));
  }

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

  // 루트 / → /web 리다이렉트
  app.get("/", (_req: Request, res: Response) => {
    res.redirect("/web");
  });
}
