import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const { z } = require("zod");
const routerText = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
const fixtureText = fs.readFileSync(path.join(root, "server/tech-estimate-review-fixture.ts"), "utf8");

function compile(text, filename) {
  return ts.transpileModule(text, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function extractRouterParts() {
  const ast = ts.createSourceFile("routers.ts", routerText, ts.ScriptTarget.Latest, true);
  const extracted = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "resolveCallerRole") extracted.set("resolveCallerRole", node.getText(ast));
    if (ts.isPropertyAssignment(node)) {
      const propertyName = node.name.getText(ast);
      const initializer = node.initializer.getText(ast);
      const isEstimateList = propertyName === "list" && initializer.includes("techRequestStatus") && initializer.includes("resolveCallerRole");
      if (["techRequest", "listMyTechRequests", "reviewMyAssignedRequests", "approveTechRequest", "rejectTechRequest"].includes(propertyName) || isEstimateList) {
        extracted.set(propertyName, initializer);
      }
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "listActive") extracted.set("listActive", node.initializer.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of ["resolveCallerRole", "techRequest", "list", "listMyTechRequests", "reviewMyAssignedRequests", "approveTechRequest", "rejectTechRequest", "listActive"]) {
    assert.ok(extracted.has(name), `Missing actual server implementation: ${name}`);
  }
  return extracted;
}

function loadActualFixture() {
  const fixtureModule = { exports: {} };
  const context = vm.createContext({ module: fixtureModule, exports: fixtureModule.exports, console });
  vm.runInContext(compile(fixtureText, "tech-estimate-review-fixture.ts"), context);
  return fixtureModule.exports;
}

class TRPCError extends Error {
  constructor(options) {
    super(options.message);
    this.code = options.code;
  }
}

const publicProcedure = {
  input(schema) { return { mutation(fn) { return { schema, fn }; }, query(fn) { return { schema, fn }; } }; },
  query(fn) { return { fn }; },
};

function createHarness() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requestId INTEGER NOT NULL,
    estimateNumber TEXT NOT NULL,
    customerPhone TEXT NOT NULL,
    amount TEXT NOT NULL,
    sourceType TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','viewed','approved','rejected','expired')),
    techRequesterId INTEGER NOT NULL,
    branchId INTEGER,
    techRequestStatus TEXT NOT NULL,
    autoEstimateItems TEXT NOT NULL
  )`);
  const roles = new Map([
    [101, { userId: 101, appRole: "technician", isActive: true, branchId: 7, passwordHash: "tech-secret" }],
    [201, { userId: 201, appRole: "hq_admin", isActive: true, branchId: null, passwordHash: "hq-secret" }],
    [301, { userId: 301, appRole: "branch_manager", isActive: true, branchId: 7, passwordHash: "branch-7-secret" }],
    [302, { userId: 302, appRole: "branch_manager", isActive: true, branchId: 8, passwordHash: "branch-8-secret" }],
  ]);
  const request = { id: 42, isDeleted: false, technicianId: 11, branchId: 7, customerName: "격리 검수 고객", phoneNumber: "0100000000" };
  let reviewMode = false;
  const sends = [];
  const updates = [];
  const db = {
    getAppRole: async (userId) => roles.get(userId) ?? null,
    getTechnicianByUserId: async (userId) => userId === 101 ? ({ id: 11, name: "격리 검수 기사", isActive: true, branchId: 7 }) : null,
    getRepairRequestById: async (id) => id === request.id ? request : null,
    createEstimate: async (value) => {
      const result = sql.prepare(`INSERT INTO estimates (requestId, estimateNumber, customerPhone, amount, sourceType, status, techRequesterId, branchId, techRequestStatus, autoEstimateItems)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        value.requestId, value.estimateNumber, value.customerPhone, value.amount, value.sourceType, value.status,
        value.techRequesterId, value.branchId, value.techRequestStatus, value.autoEstimateItems,
      );
      return Number(result.lastInsertRowid);
    },
    getBranchPhone: async () => null,
    getSetting: async () => null,
    listEstimates: async (filter) => {
      const clauses = [];
      const values = [];
      for (const [column, value] of Object.entries({ branchId: filter.branchId, status: filter.status, sourceType: filter.sourceType, techRequesterId: filter.techRequesterId, techRequestStatus: filter.techRequestStatus })) {
        if (value != null) { clauses.push(`${column} = ?`); values.push(value); }
      }
      return sql.prepare(`SELECT * FROM estimates${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY id DESC`).all(...values);
    },
    getEstimateById: async () => ({ id: 77, sourceType: "tech_request", techRequestStatus: "pending", branchId: 7, token: "isolated-token", customerPhone: "0100000000", customerName: "격리 검수 고객", amount: "220000" }),
    updateEstimateById: async (_id, update) => { updates.push(update); },
    createEstimateMessageLog: async () => undefined,
  };
  const fixture = loadActualFixture();
  const extracted = extractRouterParts();
  const context = vm.createContext({
    z, crypto, db, TRPCError, publicProcedure, console,
    process: { env: { SITE_URL: "https://review.invalid" } },
    isSyntheticTechEstimateReviewMode: () => reviewMode,
    resolveSyntheticTechEstimateReviewActor: fixture.resolveSyntheticTechEstimateReviewActor,
    listSyntheticTechEstimateReviewRequests: fixture.listSyntheticTechEstimateReviewRequests,
    listSyntheticTechEstimateReviews: fixture.listSyntheticTechEstimateReviews,
    submitSyntheticTechEstimateReview: fixture.submitSyntheticTechEstimateReview,
    SYNTHETIC_REVIEW_PRICES: fixture.SYNTHETIC_REVIEW_PRICES,
    sendSms: async () => undefined,
    sendNotification: async (...args) => { sends.push(args); return { result: "SUCCESS" }; },
    buildEstimateDocMessage: () => "격리 검수 메시지",
  });
  const code = `${extracted.get("resolveCallerRole")}
const techRequest = ${extracted.get("techRequest")};
const list = ${extracted.get("list")};
const listMyTechRequests = ${extracted.get("listMyTechRequests")};
const reviewMyAssignedRequests = ${extracted.get("reviewMyAssignedRequests")};
const approveTechRequest = ${extracted.get("approveTechRequest")};
const rejectTechRequest = ${extracted.get("rejectTechRequest")};
const listActive = ${extracted.get("listActive")};
globalThis.handlers = { techRequest, list, listMyTechRequests, reviewMyAssignedRequests, approveTechRequest, rejectTechRequest, listActive };`;
  vm.runInContext(compile(code, "isolated-router-procedures.ts"), context);
  const handler = context.handlers;
  const signedCtx = (userId) => {
    const role = roles.get(userId);
    const issuedAt = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", role.passwordHash).update(`${userId}:${issuedAt}`).digest("hex");
    return { req: { headers: { authorization: `Bearer ${userId}:${issuedAt}:${sig}` } } };
  };
  const callMutation = (name, input, ctx) => handler[name].fn({ input: handler[name].schema.parse(input), ctx });
  const callQuery = (name, inputOrCtx, maybeCtx) => {
    const ctx = maybeCtx ?? inputOrCtx;
    const input = maybeCtx == null ? undefined : inputOrCtx;
    const procedure = handler[name];
    return procedure.fn({ input: procedure.schema ? procedure.schema.parse(input) : input, ctx });
  };
  return { sql, fixture, sends, updates, setReviewMode: (next) => { reviewMode = next; }, signedCtx, callMutation, callQuery };
}

const line = {
  lineId: "controller:42:wifi", name: "와이파이형 제어기", category: "제어/조절", unit: "개",
  qty: 1, unitPrice: 220000, subtotal: 220000, priceMode: "standard", stdPrice: 220000,
  discPrice: 220000, priceItemId: 42, source: "controller", auto: true, distOnly: false, controllerType: "wifi",
};
const reportInput = {
  requestId: 42, customerName: "격리 검수 고객", phoneNumber: "0100000000", title: "격리 검수 견적",
  amount: 220000, autoEstimateItems: JSON.stringify([line]),
};

const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({ name, result: "PASS" }); }
  catch (error) {
    checks.push({
      name,
      result: "FAIL",
      detail: JSON.stringify({ name: error?.name, code: error?.code, message: error?.message, stack: error?.stack }),
    });
  }
}

await check("actual server techRequest persists pending schema status and returns only the authenticated technician history", async () => {
  const h = createHarness();
  await h.callMutation("techRequest", reportInput, h.signedCtx(101));
  const stored = h.sql.prepare("SELECT requestId, customerPhone, status, techRequesterId, techRequestStatus FROM estimates").get();
  assert.deepEqual({ ...stored }, { requestId: 42, customerPhone: "0100000000", status: "pending", techRequesterId: 11, techRequestStatus: "pending" });
  const rows = await h.callQuery("listMyTechRequests", h.signedCtx(101));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customerPhone, "0100000000");
});

await check("actual server denies unauthenticated, wrong-role, malformed, and mismatched reports before isolated DB write", async () => {
  const h = createHarness();
  await assert.rejects(async () => h.callMutation("techRequest", reportInput, { req: { headers: {} } }));
  await assert.rejects(async () => h.callMutation("techRequest", reportInput, h.signedCtx(201)));
  await assert.rejects(async () => h.callMutation("techRequest", { ...reportInput, amount: 0 }, h.signedCtx(101)));
  await assert.rejects(async () => h.callMutation("techRequest", { ...reportInput, customerName: "다른 고객" }, h.signedCtx(101)));
  assert.equal(h.sql.prepare("SELECT count(*) AS count FROM estimates").get().count, 0);
  assert.equal(h.sends.length, 0);
});

await check("actual server review branch binds synthetic request and history to the authenticated review actor", async () => {
  const h = createHarness();
  h.setReviewMode(true);
  const first = h.fixture.getSyntheticReviewActorByLoginId("review-tech");
  const second = h.fixture.getSyntheticReviewActorByLoginId("review-tech-2");
  const ctx = (token) => ({ req: { headers: { authorization: `Bearer ${token}` } } });
  const assigned = await h.callQuery("reviewMyAssignedRequests", ctx(first.token));
  assert.equal(assigned[0].id, first.request.id);
  await h.callMutation("techRequest", {
    ...reportInput,
    requestId: first.request.id,
    customerName: first.request.name,
    phoneNumber: first.request.phone,
  }, ctx(first.token));
  assert.equal((await h.callQuery("listMyTechRequests", ctx(first.token))).length, 1);
  assert.equal((await h.callQuery("listMyTechRequests", ctx(second.token))).length, 0);
  await assert.rejects(h.callMutation("techRequest", {
    ...reportInput,
    requestId: first.request.id,
    customerName: first.request.name,
    phoneNumber: first.request.phone,
  }, ctx(second.token)));
});

await check("actual server approval blocks anonymous, technician, and other-branch callers before notification, while hq and assigned branch remain allowed", async () => {
  const input = { estimateId: 77 };
  for (const denied of [null, 101, 302]) {
    const h = createHarness();
    const ctx = denied == null ? { req: { headers: {} } } : h.signedCtx(denied);
    await assert.rejects(h.callMutation("approveTechRequest", input, ctx));
    assert.equal(h.updates.length, 0);
    assert.equal(h.sends.length, 0);
  }
  for (const allowed of [201, 301]) {
    const h = createHarness();
    const result = await h.callMutation("approveTechRequest", input, h.signedCtx(allowed));
    assert.equal(result.success, true);
    assert.equal(h.updates.length, 1);
    assert.equal(h.updates[0].techRequestStatus, "approved");
    assert.equal(h.sends.length, 1);
  }
});

await check("actual server list and reject block anonymous, technician, and other-branch callers while keeping headquarters and assigned branch scope", async () => {
  const input = { status: "pending", sourceType: "tech_request", techRequestStatus: "pending" };
  for (const denied of [null, 101]) {
    const h = createHarness();
    await h.callMutation("techRequest", reportInput, h.signedCtx(101));
    const ctx = denied == null ? { req: { headers: {} } } : h.signedCtx(denied);
    await assert.rejects(h.callQuery("list", input, ctx));
    await assert.rejects(h.callMutation("rejectTechRequest", { estimateId: 77 }, ctx));
    assert.equal(h.updates.length, 0);
  }

  const branchMismatch = createHarness();
  await branchMismatch.callMutation("techRequest", reportInput, branchMismatch.signedCtx(101));
  await assert.rejects(branchMismatch.callQuery("list", { ...input, branchId: 7 }, branchMismatch.signedCtx(302)));
  await assert.rejects(branchMismatch.callMutation("rejectTechRequest", { estimateId: 77 }, branchMismatch.signedCtx(302)));
  assert.equal(branchMismatch.updates.length, 0);

  const hq = createHarness();
  await hq.callMutation("techRequest", reportInput, hq.signedCtx(101));
  assert.equal((await hq.callQuery("list", input, hq.signedCtx(201))).length, 1);

  const branch = createHarness();
  await branch.callMutation("techRequest", reportInput, branch.signedCtx(101));
  assert.equal((await branch.callQuery("list", input, branch.signedCtx(301))).length, 1);
  const rejected = await branch.callMutation("rejectTechRequest", { estimateId: 77, rejectReason: "격리 검수" }, branch.signedCtx(301));
  assert.equal(rejected.success, true);
  assert.equal(branch.updates[0].techRequestStatus, "rejected");
  assert.equal(branch.updates[0].rejectReason, "격리 검수");
});

console.log(JSON.stringify({ checks, passed: checks.filter((item) => item.result === "PASS").length, failed: checks.filter((item) => item.result === "FAIL").length }, null, 2));
process.exitCode = checks.some((item) => item.result === "FAIL") ? 1 : 0;
