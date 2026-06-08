#!/usr/bin/env python3
import json, urllib.request, urllib.parse, sys

API = "http://127.0.0.1:3000/api/trpc"

def post(proc, payload):
    data = json.dumps({"json": payload}).encode()
    req = urllib.request.Request(f"{API}/{proc}", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)

def get(proc, payload):
    q = urllib.parse.quote(json.dumps({"json": payload}))
    with urllib.request.urlopen(f"{API}/{proc}?input={q}") as r:
        return json.load(r)

def stage(rid):
    d = get("repair.getById", {"id": rid})
    r = d.get("result", {}).get("data", {}).get("json", {}) or {}
    return f"stage={r.get('workflowStage')} status={r.get('status')} tech={r.get('technicianId')} sched={r.get('scheduledDate')} {r.get('scheduledTime')}"

def err_or_ok(d, ok_msg="성공"):
    if "error" in d:
        return "차단됨: " + d["error"]["json"]["message"]
    return ok_msg

RID = int(sys.argv[1]) if len(sys.argv) > 1 else 180002

print("=== 접수 #%d 전체 워크플로우 검증 ===" % RID)
print("[초기]", stage(RID))

print("\n[1] 견적 전달")
print("  ", err_or_ok(post("repair.updateEstimate", {"id": RID, "estimateAmount": 90000})))
print("  ", stage(RID))

print("\n[2] 견적 미승인 상태에서 기사 출발 시도 (차단 기대)")
d = post("location.startTracking", {
    "requestId": RID, "technicianId": 1, "technicianName": "테스트기사",
    "customerName": "테스트고객", "customerPhone": "010-7777-0002",
    "customerAddress": "안산", "demoMode": True})
print("  ", err_or_ok(d, "출발 성공(차단 실패!)"))

print("\n[3] 견적 승인")
print("  ", err_or_ok(post("repair.approveEstimate", {"id": RID})))
print("  ", stage(RID))

print("\n[4] 기사 배정 + 일정 확정")
print("  배정:", err_or_ok(post("repair.assignTechnician", {
    "id": RID, "technicianId": 1, "technicianName": "테스트기사",
    "scheduledDate": "2026-06-16", "scheduledTime": "10:00", "notify": False})))
print("  일정:", err_or_ok(post("repair.updateSchedule", {
    "id": RID, "scheduledDate": "2026-06-16", "scheduledTime": "10:00", "notify": False})))
print("  ", stage(RID))

print("\n[5] 견적 승인 후 기사 출발 (성공 기대)")
d = post("location.startTracking", {
    "requestId": RID, "technicianId": 1, "technicianName": "테스트기사",
    "customerName": "테스트고객", "customerPhone": "010-7777-0002",
    "customerAddress": "안산", "demoMode": True})
ok = "성공" if "result" in d else ("실패: " + d.get("error", {}).get("json", {}).get("message", ""))
print("   출발:", ok)
print("  ", stage(RID))
token = d.get("result", {}).get("data", {}).get("json", {}).get("trackingToken") if "result" in d else None

print("\n[6] 도착 처리")
print("  ", err_or_ok(post("location.markArrived", {"requestId": RID, "token": token})))
print("  ", stage(RID))

print("\n[7] 작업 완료 처리")
print("  ", err_or_ok(post("location.markWorkCompleted", {"requestId": RID})))
print("  ", stage(RID))

print("\n[8] 결제 완료 처리")
print("  ", err_or_ok(post("repair.markPaid", {"id": RID})))
print("  ", stage(RID))

print("\n[9] 후기 요청 발송")
print("  ", err_or_ok(post("repair.requestReview", {"id": RID})))
print("  ", stage(RID))
