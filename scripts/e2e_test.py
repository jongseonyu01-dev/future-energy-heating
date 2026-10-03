"""
전체 시나리오 E2E 테스트
고객 신청 → 기사 배정 → 출발(위치세션 생성) → track 링크 조회 → 위치 갱신 → 도착
"""
import requests
import json
import sys
import urllib.parse

BASE = "http://localhost:3000"

def trpc_post(proc, payload):
    r = requests.post(f"{BASE}/api/trpc/{proc}", json={"json": payload})
    return r.json()

def trpc_get(proc, payload=None):
    if payload is None:
        r = requests.get(f"{BASE}/api/trpc/{proc}")
    else:
        q = urllib.parse.quote(json.dumps({"json": payload}))
        r = requests.get(f"{BASE}/api/trpc/{proc}?input={q}")
    return r.json()

def fail(step, res):
    print(f"  FAIL @ {step}:", json.dumps(res, ensure_ascii=False)[:400])
    sys.exit(1)

print("=" * 64)
print("STEP 1: 고객 신청 (단계형 주소)")
res = trpc_post("repair.create", {
    "customerName": "테스트고객",
    "phoneNumber": "010-1234-5678",
    "sido": "경기도",
    "sigungu": "안산시 단원구",
    "eupmyeondong": "초지동",
    "apartmentName": "초지역메이저타운푸르지오메트로단지",
    "roadAddress": "경기도 안산시 단원구 초지동 산단로 지원",
    "dong": "101",
    "ho": "1501",
    "customerLat": 37.3081,
    "customerLng": 126.8092,
    "requestType": "난방고장",
    "symptom": "집전체가춥다",
})
if "error" in res:
    fail("repair.create", res)
data = res["result"]["data"]["json"]
req_id = data["id"]
req_num = data["requestNumber"]
print(f"  OK - 접수번호={req_num}, id={req_id}")

# 저장 확인
chk = trpc_get("repair.getById", {"id": req_id})["result"]["data"]["json"]
full_addr = f"{chk['sido']} {chk['sigungu']} {chk['eupmyeondong']} {chk['apartmentName']} {chk['dong']}동 {chk['ho']}호"
nav_addr = f"{chk['sido']} {chk['sigungu']} {chk['eupmyeondong']} {chk['apartmentName']}"
print(f"  전체주소(기사/관리자 표시용): {full_addr}")
print(f"  네비 목적지(동/호 제외): {nav_addr}")

print("=" * 64)
print("STEP 2: 기사 배정")
techs = trpc_get("technicians.list")
if "error" in techs:
    techs = trpc_get("technicians.listAll")
tlist = techs["result"]["data"]["json"]
if not tlist:
    print("  기사 없음 → 테스트용 기사 생성 시도")
    fail("technician.list empty", techs)
tech = tlist[0]
tech_id = tech["id"]
tech_name = tech.get("name") or tech.get("loginId") or "기사"
print(f"  배정 기사: id={tech_id}, name={tech_name}")
res = trpc_post("repair.assignTechnician", {
    "id": req_id,
    "technicianId": tech_id,
    "technicianName": tech_name,
    "scheduledDate": "2026-06-20",
    "scheduledTime": "오후 2시",
    "notify": False,
})
if "error" in res:
    fail("assignTechnician", res)
print("  OK - 기사 배정 완료")

print("=" * 64)
print("STEP 3: 기사 출발 → 위치 세션 생성")
res = trpc_post("location.startTracking", {
    "requestId": req_id,
    "technicianId": tech_id,
    "technicianName": tech_name,
    "technicianPhone": "010-9999-0000",
    "customerName": "테스트고객",
    "customerPhone": "010-1234-5678",
        "customerAddress": full_addr,
        "customerLat": float(chk.get("customerLat")) if chk.get("customerLat") else None,
        "customerLng": float(chk.get("customerLng")) if chk.get("customerLng") else None,
        "demoMode": True,
})
if "error" in res:
    fail("startTracking", res)
st = res["result"]["data"]["json"]
token = st["token"]
tracking_url = st["trackingUrl"]
print(f"  OK - 세션 생성, token={token[:16]}...")
print(f"  고객 위치확인 링크: {tracking_url}")

print("=" * 64)
print("STEP 4: 위치 갱신 (기사 현재 위치 전송)")
# 안산 초지동 좌표
res = requests.post(f"{BASE}/api/location/update", json={
    "token": token, "lat": 37.3219, "lng": 126.8309,
})
print(f"  위치 업데이트 응답: {res.status_code} {res.text[:120]}")

print("=" * 64)
print("STEP 5: 고객 track 페이지 세션 조회 (공개 접근)")
res = requests.get(f"{BASE}/api/location/session/{token}")
print(f"  HTTP {res.status_code}")
try:
    sess = res.json()
    print(f"  status={sess.get('status')}")
    print(f"  기사위치 lat={sess.get('currentLat')}, lng={sess.get('currentLng')}")
    print(f"  목적지주소={sess.get('customerAddress')}")
    print(f"  목적지좌표(지도 마커) lat={sess.get('customerLat')}, lng={sess.get('customerLng')}")
    # 민감정보 노출 여부 검사
    leaked = [k for k in ['customerPhone','technicianPhone'] if sess.get(k)]
    print(f"  (민감정보 노출 체크) 노출된 민감필드: {leaked if leaked else '없음'}")
except Exception as e:
    print("  파싱 오류:", res.text[:200])

print("=" * 64)
print("STEP 6: 도착 처리 → 세션 종료")
res = requests.post(f"{BASE}/api/location/stop", json={"token": token, "reason": "도착완료"})
print(f"  도착 처리 응답: {res.status_code} {res.text[:120]}")
res2 = requests.get(f"{BASE}/api/location/session/{token}")
print(f"  종료 후 재조회 HTTP {res2.status_code} (만료/종료 안내 기대)")
try:
    print(f"  응답: {json.dumps(res2.json(), ensure_ascii=False)[:200]}")
except Exception:
    print(f"  응답(raw): {res2.text[:200]}")

print("=" * 64)
print("ALL STEPS DONE")
print(json.dumps({"req_id": req_id, "req_num": req_num, "token": token, "url": tracking_url}, ensure_ascii=False))
