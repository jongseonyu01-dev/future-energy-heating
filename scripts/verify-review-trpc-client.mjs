import { createTRPCProxyClient, httpLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";

const base = String(process.env.REVIEW_API_BASE_URL || "").replace(/\/$/, "");

if (!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(base)) {
  throw new Error("REVIEW_API_BASE_URL must be the approved HTTPS Vercel preview origin.");
}

function client(token = "") {
  return createTRPCProxyClient({
    links: [
      httpLink({
        url: `${base}/api/trpc`,
        transformer: superjson,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    ],
  });
}

function assert(condition, label) {
  if (!condition) throw new Error(`tRPC client assertion failed: ${label}`);
}

async function expectTrpcError(operation, expectedStatus, expectedCode, label) {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof TRPCClientError, `${label}: TRPCClientError instance`);
    assert(error.data?.httpStatus === expectedStatus, `${label}: HTTP ${expectedStatus}`);
    assert(error.data?.code === expectedCode, `${label}: ${expectedCode} metadata`);
    assert(typeof error.data?.path === "string", `${label}: tRPC path metadata`);
    return {
      httpStatus: error.data.httpStatus,
      code: error.data.code,
      path: error.data.path,
      jsonRpcCode: error.shape?.code,
    };
  }
  throw new Error(`tRPC client assertion failed: ${label}: expected an error`);
}

const anonymous = client();
const unauthenticated = await expectTrpcError(
  () => anonymous.prices.listActive.query(),
  401,
  "UNAUTHORIZED",
  "anonymous price query",
);

const primaryLogin = await anonymous.auth.login.mutate({
  loginId: "review-tech",
  password: "review-only",
  source: "app",
});
const secondaryLogin = await anonymous.auth.login.mutate({
  loginId: "review-tech-2",
  password: "review-only-2",
  source: "app",
});
assert(primaryLogin?.success && primaryLogin?.token, "primary synthetic login");
assert(secondaryLogin?.success && secondaryLogin?.token, "secondary synthetic login");

const primary = client(primaryLogin.token);
const secondary = client(secondaryLogin.token);
const schedule = await primary.repair.listMySchedule.query();
const work = schedule.find((candidate) => Number(candidate?.id) === 810001);
assert(work?.id === 810001 && work.requestNumber === "REVIEW-810001" && work.technicianId === primaryLogin.technicianId, "primary own synthetic 810001 schedule for work-list visibility");

const consentBefore = await primary.location.getConsent.query({ technicianId: primaryLogin.technicianId });
assert(consentBefore?.hasConsented === false, "synthetic consent begins unset");
const blockedDeparture = await expectTrpcError(
  () => primary.location.startTracking.mutate({ requestId: work.id }),
  412,
  "PRECONDITION_FAILED",
  "departure before authenticated consent",
);
assert(blockedDeparture.jsonRpcCode === -32012, "PRECONDITION_FAILED JSON-RPC numeric code");

const savedConsent = await primary.location.saveConsent.mutate({ technicianId: primaryLogin.technicianId });
assert(savedConsent?.success === true, "authenticated consent save returns operational-compatible success");
assert(!Object.hasOwn(savedConsent ?? {}, "hasConsented"), "consent save does not require a non-operational hasConsented field");
const consentAfter = await primary.location.getConsent.query({ technicianId: primaryLogin.technicianId });
assert(consentAfter?.hasConsented === true, "authenticated consent readback confirms stored consent");
const departure = await primary.location.startTracking.mutate({ requestId: work.id });
assert(consentAfter?.hasConsented === true && departure?.requestId === work.id && departure?.synthetic === true, "own synthetic departure after authenticated consent readback");

const checklist = await primary.repair.getById.query({ id: work.id });
const report = await primary.workReport.getByRequest.query({ requestId: work.id });
assert(checklist?.apartmentName && checklist?.symptom, "checklist has non-null synthetic display fields");
assert(report === null, "empty work report is a nullable value, not a malformed response");

const crossChecklist = await expectTrpcError(
  () => secondary.repair.getById.query({ id: work.id }),
  403,
  "FORBIDDEN",
  "cross-technician checklist query",
);

console.log(JSON.stringify({
  transport: "@trpc/client httpLink + superjson (same app transport configuration)",
  apiOrigin: base,
  authorization: {
    approvedScope: "synthetic review-tech/review-only and review-tech-2/review-only-2 only",
    operationalCustomerData: false,
    operationalSms: false,
  },
  unauthenticated,
  login: {
    primaryTechnicianId: primaryLogin.technicianId,
    secondaryTechnicianId: secondaryLogin.technicianId,
  },
  schedule: { requestId: work.id, requestNumber: work.requestNumber, workListRequiredSyntheticRequest: 810001, ownTechnicianOnly: true },
  consent: {
    before: consentBefore.hasConsented,
    blockedDeparture,
    saveResponse: savedConsent,
    readback: consentAfter.hasConsented,
    startedSynthetic: departure.synthetic,
  },
  checklist: {
    requestId: checklist.id,
    apartmentName: checklist.apartmentName,
    symptom: checklist.symptom,
    nullableEmptyReport: report === null,
    crossTechnician: crossChecklist,
  },
}));
