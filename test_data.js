const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/home/ubuntu/future-energy-heating/.env' });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }
  });

  // yjs2 기사 정보 확인
  const [tech] = await conn.query("SELECT id, name FROM technicians WHERE name LIKE '%유종선%' LIMIT 3");
  console.log('기사 목록:', tech);

  // 오늘/어제/내일/모레 날짜 (KST)
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = kst.toISOString().slice(0, 10);
  const yesterday = new Date(kst.getTime() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(kst.getTime() + 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(kst.getTime() + 2 * 86400000).toISOString().slice(0, 10);

  console.log('today:', today, 'yesterday:', yesterday, 'tomorrow:', tomorrow, 'dayAfter:', dayAfter);
  await conn.end();
}

main().catch(console.error);
