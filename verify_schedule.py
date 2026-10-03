#!/usr/bin/env python3
import subprocess, json
from datetime import datetime, timezone, timedelta

ADMIN_TOKEN = "1072094361:fee9f3e44c8ee93f9cc5a49364d06e52ac77f0598007d2928a472e3e00283254"
BASE_URL = "https://www.xn--h50b270bp0ceuddugnobx2m.kr"

KST = timezone(timedelta(hours=9))
today = datetime.now(KST).strftime('%Y-%m-%d')
yesterday = (datetime.now(KST) - timedelta(days=1)).strftime('%Y-%m-%d')
tomorrow = (datetime.now(KST) + timedelta(days=1)).strftime('%Y-%m-%d')
day_after = (datetime.now(KST) + timedelta(days=2)).strftime('%Y-%m-%d')

# API 호출
result = subprocess.run([
    "curl", "-s",
    f"{BASE_URL}/api/trpc/repair.listAll",
    "-H", f"Authorization: Bearer {ADMIN_TOKEN}",
    "-G", "--data-urlencode", 'input={"json":{}}'
], capture_output=True, text=True)

data = json.loads(result.stdout)
items = data.get('result',{}).get('data',{}).get('json',[])
yjs2 = [r for r in items if r.get('technicianId') == 540003 and not r.get('isDeleted')]

# 완료/취소 상태 (미작업 목록에서 제외)
DONE_STATUSES = {'작업완료', '공사완료'}
# 취소 상태 (DB ENUM에 없으므로 재방문필요로 대체)
CANCEL_STATUSES = {'재방문필요'}

# 일정 분류 (앱 로직과 동일)
today_list = [r for r in yjs2 if r.get('scheduledDate') == today]
tomorrow_list = [r for r in yjs2 if r.get('scheduledDate') == tomorrow]
overdue_list = [r for r in yjs2 if (
    (r.get('scheduledDate') and r['scheduledDate'] < today and r['status'] not in DONE_STATUSES and r['status'] not in CANCEL_STATUSES) or
    (not r.get('scheduledDate') and r['status'] not in DONE_STATUSES and r['status'] not in CANCEL_STATUSES)
)]
all_list = [r for r in yjs2]

print(f"=== yjs2 기사 배정 건수: {len(yjs2)}건 ===")
print(f"오늘={today}, 어제={yesterday}, 내일={tomorrow}, 모레={day_after}")
print()

print(f"[오늘 작업] {len(today_list)}건")
for r in sorted(today_list, key=lambda x: x.get('scheduledTime') or ''):
    print(f"  #{r['id']} {r.get('scheduledDate','미정')} {r.get('scheduledTime','')} [{r['status']}] {r.get('customerName','')}")

print(f"\n[내일 일정] {len(tomorrow_list)}건")
for r in sorted(tomorrow_list, key=lambda x: x.get('scheduledTime') or ''):
    print(f"  #{r['id']} {r.get('scheduledDate','미정')} {r.get('scheduledTime','')} [{r['status']}] {r.get('customerName','')}")

print(f"\n[미작업·이월] {len(overdue_list)}건")
for r in sorted(overdue_list, key=lambda x: x.get('scheduledDate') or '9999'):
    print(f"  #{r['id']} {r.get('scheduledDate','미정')} [{r['status']}] {r.get('customerName','')}")

print(f"\n[전체 작업] {len(all_list)}건")
for r in sorted(all_list, key=lambda x: x.get('scheduledDate') or '9999'):
    print(f"  #{r['id']} {r.get('scheduledDate','미정')} [{r['status']}] {r.get('customerName','')}")

print("\n=== 검증 결과 ===")
# 어제 미완료 → 미작업·이월
overdue_ids = {r['id'] for r in overdue_list}
today_ids = {r['id'] for r in today_list}
tomorrow_ids = {r['id'] for r in tomorrow_list}

# 중복 체크
all_shown = today_ids | tomorrow_ids | overdue_ids
duplicates = (today_ids & tomorrow_ids) | (today_ids & overdue_ids) | (tomorrow_ids & overdue_ids)
print(f"중복 표시: {'없음 ✅' if not duplicates else f'있음 ❌ {duplicates}'}")

# 다른 기사 작업이 포함되지 않는지 확인
other_tech = [r for r in items if r.get('technicianId') and r.get('technicianId') != 540003]
print(f"다른 기사 작업 건수: {len(other_tech)}건 (yjs2 목록에 포함되면 안 됨)")
