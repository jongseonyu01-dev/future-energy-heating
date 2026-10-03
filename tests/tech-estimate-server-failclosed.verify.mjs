import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const root = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const { z } = require("zod");
const routerText = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");

function compile(text, filename) {
  return ts.transpileModule(text, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

const ast = ts.createSourceFile("routers.ts", routerText, ts.ScriptTarget.Latest, true);
const extracted = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "resolveCallerRole") extracted.set("resolveCallerRole", node.getText(ast));
  if (ts.isPropertyAssignment(node) && ["techRequest", "listMyTechRequests"].includes(node.name.getText(ast))) {
    extracted.set(node.name.getText(ast), node.initializer.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
for (const name of ["resolveCallerRole", "techRequest", "listMyTechRequests"]) assert.ok(extracted.has(name), `Missing ${name} implementation`);

function makeHarness({ role = "technician", requestPatch = {} } = {}) {
  const writes = [];
  const sends = [];
  const caller = { userId: 101, appRole: role, isActive: true, branchId: 3, name: "Synthetic technician", passwordHash: "SYNTHETIC_TEST_ONLY" };
  const request = {
    id: 42,
    isDeleted: false,
    technicianId: 11,
    branchId: 3,
    customerName: "Synthetic customer",
    phoneNumber: "0000000000",
    ...requestPatch,
  };
  const db = {
    getAppRole: async () => caller,
    getTechnicianByUserId: async () => ({ id: 11, name: "Synthetic technician", isActive: true, branchId: 3 }),
    getRepairRequestById: async () => request,
    createEstimate: async (value) => { writes.push(value); return 1; },
    getBranchPhone: async () => null,
    getSetting: async () => null,
    listEstimates: async (filter) => ({ filter }),
  };
  class TRPCError extends Error { constructor(options) { super(options.message); this.code = options.code; } }
  const publicProcedure = {
    input(schema) {
      return {
        mutation(fn) { return { schema, fn }; },
        query(fn) { return { schema, fn }; },
      };
    },
    query(fn) { return { fn }; },
  };
  const context = vm.createContext({
    z, crypto, db, TRPCError, publicProcedure,
    isSyntheticTechEstimateReviewMode: () => false,
    listSyntheticTechEstimateReviews: () => [],
    submitSyntheticTechEstimateReview: () => { throw new Error("synthetic review mode is disabled"); },
    sendSms: async (...args) => sends.push(args), console,
  });
  const code = `${extracted.get("resolveCallerRole")}
const create = ${extracted.get("techRequest")};
const list = ${extracted.get("listMyTechRequests")};
globalThis.handlers = { create, list };`;
  vm.runInContext(compile(code, "tech-estimate-procedures.ts"), context);
  const ctx = { req: { headers: { authorization: `Bearer 101:${crypto.createHmac("sha256", caller.passwordHash).update("101").digest("hex")}` } } };
  return {
    writes,
    sends,
    create: async (input, suppliedCtx = ctx) => context.handlers.create.fn({ input: context.handlers.create.schema.parse(input), ctx: suppliedCtx }),
    list: async () => context.handlers.list.fn({ ctx }),
  };
}

const line = {
  lineId: "partial:42:one", name: "와이파이형 제어기", category: "제어/조절", unit: "개",
  qty: 1, unitPrice: 220000, subtotal: 220000, priceMode: "standard", stdPrice: 220000,
  discPrice: 220000, priceItemId: 42, source: "partial", auto: false, distOnly: false,
};
const validInput = {
  requestId: 42, customerName: "Synthetic customer", phoneNumber: "0000000000", title: "Synthetic quote",
  amount: 220000, autoEstimateItems: JSON.stringify([line]),
};

const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({ name, result: "PASS" }); }
  catch (error) { checks.push({ name, result: "FAIL", detail: String(error.message) }); }
}

await check("unauthenticated caller is denied before write", async () => {
  const h = makeHarness(); await assert.rejects(h.create(validInput, {})); assert.equal(h.writes.length, 0); assert.equal(h.sends.length, 0);
});
await check("wrong role is denied before write", async () => {
  const h = makeHarness({ role: "customer" }); await assert.rejects(h.create(validInput)); assert.equal(h.writes.length, 0); assert.equal(h.sends.length, 0);
});
await check("unassigned request is denied before write", async () => {
  const h = makeHarness({ requestPatch: { technicianId: 12 } }); await assert.rejects(h.create(validInput)); assert.equal(h.writes.length, 0); assert.equal(h.sends.length, 0);
});
await check("customer mismatch is denied before write", async () => {
  const h = makeHarness(); await assert.rejects(h.create({ ...validInput, customerName: "Other" })); assert.equal(h.writes.length, 0); assert.equal(h.sends.length, 0);
});
await check("malformed JSON and zero amount are denied before write", async () => {
  const h = makeHarness(); await assert.rejects(h.create({ ...validInput, amount: 0, autoEstimateItems: "not-json" })); assert.equal(h.writes.length, 0); assert.equal(h.sends.length, 0);
});
await check("line subtotal and total mismatches are denied before write", async () => {
  const h = makeHarness();
  await assert.rejects(h.create({ ...validInput, autoEstimateItems: JSON.stringify([{ ...line, subtotal: 1 }]) }));
  await assert.rejects(h.create({ ...validInput, amount: 1 }));
  assert.equal(h.writes.length, 0); assert.equal(h.sends.length, 0);
});
await check("valid report persists request linkage and authenticated technician only", async () => {
  const h = makeHarness(); await h.create({ ...validInput, techRequesterId: 999, branchId: 999 });
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].requestId, 42);
  assert.equal(h.writes[0].techRequesterId, 11); assert.equal(h.writes[0].branchId, 3);
  assert.equal(h.writes[0].customerPhone, "0000000000");
  assert.equal(h.writes[0].phoneNumber, undefined);
});
await check("own-history query supplies source and authenticated technician filters", async () => {
  const h = makeHarness(); const result = await h.list();
  assert.equal(result.filter.sourceType, "tech_request"); assert.equal(result.filter.techRequesterId, 11);
});

console.log(JSON.stringify({ checks, passed: checks.filter((item) => item.result === "PASS").length, failed: checks.filter((item) => item.result === "FAIL").length }, null, 2));
process.exitCode = checks.some((item) => item.result === "FAIL") ? 1 : 0;
