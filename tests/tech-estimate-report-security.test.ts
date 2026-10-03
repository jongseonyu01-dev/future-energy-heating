import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routerPath = resolve(process.cwd(), "server/routers.ts");

describe("technician estimate report authorization contract", () => {
  it("derives the reporting technician and branch from the authenticated caller, not client-submitted IDs", async () => {
    const source = await readFile(routerPath, "utf8");
    const start = source.indexOf("techRequest: publicProcedure");
    const end = source.indexOf("// ─── 기사 본인이 보고한 견적만 조회", start);
    const handler = source.slice(start, end);

    expect(handler).toContain("const caller = await resolveCallerRole(ctx)");
    expect(handler).toContain('caller.appRole !== "technician"');
    expect(handler).toContain("const technician = await db.getTechnicianByUserId(caller.userId)");
    expect(handler).toContain("const branchId = request.branchId ?? technician.branchId ?? caller.branchId ?? null");
    expect(handler).toContain("techRequesterId: technician.id");
    expect(handler).not.toContain("techRequesterId: input.techRequesterId");
    expect(handler).not.toContain("branchId: input.branchId");
  });

  it("limits report history to the authenticated technician's own tech-request records", async () => {
    const source = await readFile(routerPath, "utf8");
    const start = source.indexOf("listMyTechRequests: publicProcedure");
    const end = source.indexOf("// ─── 기사 송출 요청 승인", start);
    const handler = source.slice(start, end);

    expect(handler).toContain("const caller = await resolveCallerRole(ctx)");
    expect(handler).toContain('caller.appRole !== "technician"');
    expect(handler).toContain('db.listEstimates({ sourceType: "tech_request", techRequesterId: technician.id })');
  });
});
