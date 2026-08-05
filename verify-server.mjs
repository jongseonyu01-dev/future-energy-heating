import mysql from 'mysql2/promise';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env 로드
const envPath = join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^=#][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const PROD_URL = 'https://futureheat-htdx5kse.manus.space';

async function main() {
  // 1. DB에서 app_roles, technicians 조회
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [roleRows] = await conn.query(
    'SELECT userId, loginId, passwordHash FROM app_roles WHERE userId = 1770546140 LIMIT 1'
  );
  const [techRows] = await conn.query(
    'SELECT id, name, userId FROM technicians WHERE userId = 1770546140 LIMIT 1'
  );
  await conn.end();

  if (!roleRows.length) { console.log('ERROR: app_role 없음'); return; }
  const role = roleRows[0];
  const tech = techRows[0];

  console.log('=== DB 확인 ===');
  console.log('app_roles.userId:', role.userId);
  console.log('technicians.id:', tech?.id, '(기대값: 540003)');
  console.log('technicians.userId:', tech?.userId);

  // 2. 예상 토큰 계산 (서버와 동일 로직)
  const sig = crypto
    .createHmac('sha256', role.passwordHash || 'seed')
    .update(String(role.userId))
    .digest('hex');
  const expectedToken = `${role.userId}:${sig}`;

  console.log('\n=== 토큰 형식 검증 ===');
  console.log('토큰에 userId:sig 형식:', expectedToken.includes(':'));
  console.log('토큰 앞부분:', expectedToken.substring(0, 15) + '...(생략)');

  // 3. listMySchedule API 호출 (Bearer userId:sig)
  console.log('\n=== listMySchedule 검증 ===');
  const scheduleResp = await fetch(`${PROD_URL}/api/trpc/repair.listMySchedule`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${expectedToken}`,
      'Content-Type': 'application/json',
    },
  });
  console.log('listMySchedule HTTP 상태:', scheduleResp.status);

  if (scheduleResp.ok) {
    const scheduleData = await scheduleResp.json();
    const items = scheduleData?.result?.data?.json ?? [];
    console.log('listMySchedule 결과 건수:', Array.isArray(items) ? items.length : '배열 아님');
    if (Array.isArray(items) && items.length > 0) {
      // KST 기준 오늘/내일
      const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
      const todayStr = kstNow.toISOString().slice(0, 10);
      const tomorrowDate = new Date(kstNow);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

      const todayItems = items.filter(i => i.scheduledDate && String(i.scheduledDate).startsWith(todayStr));
      const tomorrowItems = items.filter(i => i.scheduledDate && String(i.scheduledDate).startsWith(tomorrowStr));
      console.log('오늘(' + todayStr + ') 배정 건수:', todayItems.length);
      if (todayItems.length > 0) {
        console.log('  오늘 접수 requestNumber:', todayItems[0].requestNumber);
        console.log('  오늘 접수 technicianId:', todayItems[0].technicianId);
      }
      console.log('내일(' + tomorrowStr + ') 배정 건수:', tomorrowItems.length);
      if (tomorrowItems.length > 0) {
        console.log('  내일 접수 requestNumber:', tomorrowItems[0].requestNumber);
        console.log('  내일 접수 technicianId:', tomorrowItems[0].technicianId);
      }
    }
  } else {
    const errText = await scheduleResp.text();
    console.log('listMySchedule 오류:', errText.substring(0, 300));
  }

  // 4. verifyToken API 호출
  console.log('\n=== verifyToken 검증 ===');
  const vtResp = await fetch(`${PROD_URL}/api/trpc/auth.verifyToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { userId: role.userId, token: expectedToken } }),
  });
  console.log('verifyToken HTTP 상태:', vtResp.status);
  if (vtResp.ok) {
    const vtData = await vtResp.json();
    const vtResult = vtData?.result?.data?.json ?? {};
    console.log('verifyToken success:', vtResult.success);
    console.log('verifyToken technicianId:', vtResult.technicianId, '(기대값: 540003)');
  }
}

main().catch(e => console.error('ERROR:', e.message));
