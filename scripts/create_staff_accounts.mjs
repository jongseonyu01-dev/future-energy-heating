/**
 * 직원/관리자 테스트 계정 생성 스크립트
 * 실행: node scripts/create_staff_accounts.mjs
 */
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { resolve } from "path";

// .env 로드
try {
  const envPath = resolve(process.cwd(), ".env");
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
} catch {}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다.");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

const accounts = [
  {
    openId: "staff-test-001",
    name: "직원 테스트",
    email: "staff@futureenergytech.co.kr",
    loginId: "staff@futureenergytech.co.kr",
    password: "Staff1234!",
    appRole: "technician",
    phoneNumber: "010-1111-0001",
  },
  {
    openId: "admin-test-001",
    name: "관리자 테스트",
    email: "admin@futureenergytech.co.kr",
    loginId: "admin@futureenergytech.co.kr",
    password: "Admin1234!",
    appRole: "hq_admin",
    phoneNumber: "010-1111-0002",
  },
];

try {
  for (const acc of accounts) {
    const passwordHash = bcrypt.hashSync(acc.password, 10);

    // 1. users 테이블
    const [existing] = await conn.execute(
      "SELECT id FROM users WHERE openId = ?",
      [acc.openId]
    );
    let userId;

    if (existing.length > 0) {
      userId = existing[0].id;
      console.log(`✅ users 기존 사용: ${acc.loginId} (id=${userId})`);
    } else {
      const [r] = await conn.execute(
        `INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn)
         VALUES (?, ?, ?, 'password', 'admin', NOW(), NOW(), NOW())`,
        [acc.openId, acc.name, acc.email]
      );
      userId = r.insertId;
      console.log(`✅ users 생성: ${acc.loginId} (id=${userId})`);
    }

    // 2. app_roles 테이블
    const [existingRole] = await conn.execute(
      "SELECT id FROM app_roles WHERE userId = ?",
      [userId]
    );

    if (existingRole.length > 0) {
      await conn.execute(
        `UPDATE app_roles SET
           appRole=?, loginId=?, passwordHash=?,
           phoneNumber=?, name=?,
           isActive=1, mustChangePassword=0, updatedAt=NOW()
         WHERE userId=?`,
        [acc.appRole, acc.loginId, passwordHash, acc.phoneNumber, acc.name, userId]
      );
      console.log(`✅ app_roles 업데이트: ${acc.loginId} (role=${acc.appRole})`);
    } else {
      await conn.execute(
        `INSERT INTO app_roles
           (userId, appRole, loginId, passwordHash, phoneNumber, name, isActive, mustChangePassword, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
        [userId, acc.appRole, acc.loginId, passwordHash, acc.phoneNumber, acc.name]
      );
      console.log(`✅ app_roles 생성: ${acc.loginId} (role=${acc.appRole})`);
    }

    // 3. 로그인 검증
    const ok = bcrypt.compareSync(acc.password, passwordHash);
    console.log(`   비밀번호 검증: ${ok ? "OK" : "FAIL"}`);
  }

  // 4. 기사(technician) 계정에 technicians 테이블 연결
  const [staffUser] = await conn.execute(
    "SELECT id FROM users WHERE openId = 'staff-test-001'",
    []
  );
  if (staffUser.length > 0) {
    const userId = staffUser[0].id;
    const [existingTech] = await conn.execute(
      "SELECT id FROM technicians WHERE userId = ?",
      [userId]
    );
    if (existingTech.length === 0) {
      await conn.execute(
        `INSERT INTO technicians (name, phoneNumber, specialty, userId, isActive, isDeleted, createdAt)
         VALUES ('직원 테스트', '010-1111-0001', '난방 수리', ?, 1, 0, NOW())`,
        [userId]
      );
      console.log(`✅ technicians 레코드 생성 (userId=${userId})`);
    } else {
      console.log(`✅ technicians 기존 사용 (userId=${userId})`);
    }
  }

  console.log("\n=== 생성된 테스트 계정 ===");
  console.log("직원 계정:");
  console.log("  ID: staff@futureenergytech.co.kr");
  console.log("  PW: Staff1234!");
  console.log("  권한: 기사 (technician)");
  console.log("");
  console.log("관리자 계정:");
  console.log("  ID: admin@futureenergytech.co.kr");
  console.log("  PW: Admin1234!");
  console.log("  권한: 본사 관리자 (hq_admin)");
  console.log("");
  console.log("접속 URL: https://futureenergytech.co.kr/web/login.html");
  console.log("견적서 생성기: https://futureenergytech.co.kr/web/admin/tech-estimate.html");

} catch (err) {
  console.error("❌ 오류:", err.message);
} finally {
  await conn.end();
}
