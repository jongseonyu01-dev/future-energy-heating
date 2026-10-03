const base = String(process.env.REVIEW_API_BASE_URL || "").replace(/\/$/, "");

if (!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(base)) {
  throw new Error("REVIEW_API_BASE_URL must be the approved HTTPS Vercel preview origin.");
}

async function call(procedure, method, input, token) {
  const isGet = method === "GET";
  const url = isGet
    ? `${base}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}`
    : `${base}/api/trpc/${procedure}`;
  const response = await fetch(url, {
    method,
    headers: {
      ...(isGet ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(isGet ? {} : { body: JSON.stringify({ json: input }) }),
  });
  return { status: response.status, json: await response.json() };
}

async function rest(path, input) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return { status: response.status, json: await response.json() };
}

function resultOf(reply) {
  return reply.json?.result?.data?.json;
}

function errorOf(reply) {
  return reply.json?.error?.json;
}

function assert(condition, label) {
  if (!condition) throw new Error(`Review preview assertion failed: ${label}`);
}

function assertTrpcError(reply, expectedStatus, expectedCode, label) {
  const error = errorOf(reply);
  assert(reply.status === expectedStatus, `${label}: HTTP ${expectedStatus}`);
  assert(typeof error?.code === "number", `${label}: JSON-RPC numeric code`);
  assert(error?.data?.code === expectedCode && error?.data?.httpStatus === expectedStatus && typeof error?.data?.path === "string", `${label}: tRPC error metadata`);
}

function kstDate(offsetDays = 0) {
  const kst = new Date(Date.now() + (9 * 60 * 60 * 1000) + (offsetDays * 24 * 60 * 60 * 1000));
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

const [unauthPrice, unauthSubmit, unauthList] = await Promise.all([
  call("prices.listActive", "GET"),
  call("estimates.techRequest", "POST", { requestId: 0 }),
  call("estimates.listMyTechRequests", "GET"),
]);
assertTrpcError(unauthPrice, 401, "UNAUTHORIZED", "unauthenticated price lookup is blocked");
assertTrpcError(unauthSubmit, 401, "UNAUTHORIZED", "unauthenticated report submission is blocked");
assertTrpcError(unauthList, 401, "UNAUTHORIZED", "unauthenticated report lookup is blocked");

const loginOne = await call("auth.login", "POST", { loginId: "review-tech", password: "review-only", source: "app" });
const loginTwo = await call("auth.login", "POST", { loginId: "review-tech-2", password: "review-only-2", source: "app" });
const primary = resultOf(loginOne);
const secondary = resultOf(loginTwo);
assert(loginOne.status === 200 && primary?.success && primary?.appRole === "technician", "primary synthetic technician login");
assert(loginTwo.status === 200 && secondary?.success && secondary?.appRole === "technician", "secondary synthetic technician login");

const authorizedPrice = await call("prices.listActive", "GET", undefined, primary.token);
const primaryAssigned = await call("estimates.reviewMyAssignedRequests", "GET", undefined, primary.token);
const secondaryAssigned = await call("estimates.reviewMyAssignedRequests", "GET", undefined, secondary.token);
const primaryRequest = resultOf(primaryAssigned)?.[0];
const secondaryRequest = resultOf(secondaryAssigned)?.[0];
assert(primaryAssigned.status === 200 && primaryRequest?.id && primaryRequest?.technicianId === primary.technicianId, "primary sees only an assigned synthetic request");
assert(secondaryAssigned.status === 200 && secondaryRequest?.id && secondaryRequest?.technicianId === secondary.technicianId, "secondary sees only an assigned synthetic request");

const primarySchedule = await call("repair.listMySchedule", "GET", undefined, primary.token);
const consentBefore = await call("location.getConsent", "GET", { technicianId: primary.technicianId }, primary.token);
const trackingBeforeConsent = await call("location.startTracking", "POST", { requestId: primaryRequest.id }, primary.token);
const consentSaved = await call("location.saveConsent", "POST", { technicianId: primary.technicianId }, primary.token);
const consentAfter = await call("location.getConsent", "GET", { technicianId: primary.technicianId }, primary.token);
const trackingStarted = await call("location.startTracking", "POST", { requestId: primaryRequest.id }, primary.token);
const checklistRequest = await call("repair.getById", "GET", { id: primaryRequest.id }, primary.token);
const checklistReport = await call("workReport.getByRequest", "GET", { requestId: primaryRequest.id }, primary.token);
const crossChecklist = await call("repair.getById", "GET", { id: primaryRequest.id }, secondary.token);
const crossConsent = await call("location.getConsent", "GET", { technicianId: primary.technicianId }, secondary.token);

assert(primarySchedule.status === 200 && resultOf(primarySchedule)?.[0]?.id === primaryRequest.id, "primary schedule supplies own synthetic work");
assert(resultOf(primarySchedule)?.[0]?.scheduledDate === kstDate(-1) && resultOf(primarySchedule)?.[0]?.scheduledDate < kstDate(), "synthetic schedule is a current-KST overdue work item");
assert(consentBefore.status === 200 && resultOf(consentBefore)?.hasConsented === false, "consent begins unset for synthetic technician");
assertTrpcError(trackingBeforeConsent, 412, "PRECONDITION_FAILED", "tracking is blocked before authenticated consent save");
assert(consentSaved.status === 200 && resultOf(consentSaved)?.success === true && !Object.hasOwn(resultOf(consentSaved) ?? {}, "hasConsented"), "review save response preserves operational { success: true } compatibility");
assert(consentAfter.status === 200 && resultOf(consentAfter)?.hasConsented === true, "authenticated consent readback confirms stored consent");
assert(trackingStarted.status === 200 && resultOf(consentAfter)?.hasConsented === true && resultOf(trackingStarted)?.requestId === primaryRequest.id && resultOf(trackingStarted)?.synthetic === true, "tracking starts only after authenticated readback for own synthetic request");
assert(checklistRequest.status === 200 && resultOf(checklistRequest)?.apartmentName && resultOf(checklistRequest)?.symptom, "checklist request has synthetic apartment and symptom fields");
assert(checklistReport.status === 200 && resultOf(checklistReport) === null, "empty synthetic checklist report is represented safely");
assertTrpcError(crossChecklist, 403, "FORBIDDEN", "other technician cannot load primary checklist");
assertTrpcError(crossConsent, 403, "FORBIDDEN", "other technician cannot read primary consent");

const locationToken = resultOf(trackingStarted)?.token;
const [unauthLocationUpdate, locationUpdate, locationStop] = await Promise.all([
  rest("/api/location/update", { token: "invalid" }),
  rest("/api/location/update", { token: locationToken, latitude: 37.5, longitude: 127.0 }),
  rest("/api/location/stop", { token: locationToken }),
]);
assert(unauthLocationUpdate.status === 401 && unauthLocationUpdate.json?.code === "UNAUTHORIZED", "unauthenticated review location update is blocked");
assert(locationUpdate.status === 200 && locationUpdate.json?.synthetic === true, "review location update is isolated and synthetic");
assert(locationStop.status === 200 && locationStop.json?.synthetic === true, "review location stop is isolated and synthetic");

const ownInput = {
  requestId: primaryRequest.id,
  customerName: primaryRequest.customerName,
  phoneNumber: primaryRequest.phoneNumber,
  amount: 220000,
  autoEstimateItems: JSON.stringify([
    { name: "와이파이형 제어기", qty: 1, unitPrice: 220000, subtotal: 220000 },
  ]),
};
const ownSubmit = await call("estimates.techRequest", "POST", ownInput, primary.token);
const crossSubmit = await call("estimates.techRequest", "POST", ownInput, secondary.token);
assert(authorizedPrice.status === 200, "authenticated price snapshot is available");
assert(resultOf(authorizedPrice)?.find((item) => item.id === -1001)?.discPrice === 58000, "partial-repair flow-valve price snapshot");
assert(resultOf(authorizedPrice)?.find((item) => item.id === 60009)?.stdPrice === 38000 && resultOf(authorizedPrice)?.find((item) => item.id === 60009)?.discPrice === 30000, "terminal-box approved price snapshot");
assert(resultOf(authorizedPrice)?.find((item) => item.id === 60010)?.stdPrice === 166000 && resultOf(authorizedPrice)?.find((item) => item.id === 60010)?.discPrice === 143000, "line-repair 20A approved price snapshot");
assert(resultOf(authorizedPrice)?.find((item) => item.id === 60011)?.stdPrice === 203000 && resultOf(authorizedPrice)?.find((item) => item.id === 60011)?.discPrice === 194000, "line-repair 25A approved price snapshot");
assert(ownSubmit.status === 200 && resultOf(ownSubmit)?.smsSubstituted === true, "own synthetic report uses SMS substitution");
assertTrpcError(crossSubmit, 403, "FORBIDDEN", "other technician cannot submit the primary synthetic request");

const primaryReports = await call("estimates.listMyTechRequests", "GET", undefined, primary.token);
const secondaryReports = await call("estimates.listMyTechRequests", "GET", undefined, secondary.token);
assert(primaryReports.status === 200 && resultOf(primaryReports)?.length >= 1 && resultOf(primaryReports)?.every((report) => report.requestId === primaryRequest.id && report.technicianId === primary.technicianId), "primary sees only own synthetic reports");
assert(secondaryReports.status === 200 && resultOf(secondaryReports)?.length === 0, "secondary cannot read primary synthetic reports");

console.log(JSON.stringify({
  apiOrigin: base,
  unauthenticated: { prices: unauthPrice.status, submit: unauthSubmit.status, reportList: unauthList.status },
  logins: { primary: primary.technicianId, secondary: secondary.technicianId },
  assignments: { primaryRequestId: primaryRequest.id, secondaryRequestId: secondaryRequest.id },
  schedule: primarySchedule.status,
  consent: { before: resultOf(consentBefore)?.hasConsented, savePayload: resultOf(consentSaved), after: resultOf(consentAfter)?.hasConsented, blockedStart: trackingBeforeConsent.status, started: trackingStarted.status },
  checklist: { request: checklistRequest.status, report: checklistReport.status, crossActor: crossChecklist.status },
  locationRest: { unauth: unauthLocationUpdate.status, update: locationUpdate.status, stop: locationStop.status },
  authenticatedPrice: authorizedPrice.status,
  ownSubmit: ownSubmit.status,
  crossSubmit: crossSubmit.status,
  ownReportCount: resultOf(primaryReports)?.length,
  otherReportCount: resultOf(secondaryReports)?.length,
  smsSubstituted: resultOf(ownSubmit)?.smsSubstituted,
  approvedPriceSnapshot: {
    terminalBox: resultOf(authorizedPrice)?.find((item) => item.id === 60009),
    lineRepair20A: resultOf(authorizedPrice)?.find((item) => item.id === 60010),
    lineRepair25A: resultOf(authorizedPrice)?.find((item) => item.id === 60011),
  },
}));
