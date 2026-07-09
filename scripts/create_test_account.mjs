/**
 * App Store 심사용 테스트 계정 및 샘플 데이터 생성 스크립트
 * 실행: node scripts/create_test_account.mjs
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

const PW = "AppleTest1234!";
const EMAIL = "test@futureenergytech.co.kr";
const LOGIN_ID = "test@futureenergytech.co.kr";
const OPEN_ID = "test-apple-review-001";

const passwordHash = bcrypt.hashSync(PW, 10);

try {
  // ── 1. users 테이블에 이미 있는지 확인 ──────────────────────────
  const [existingUsers] = await conn.execute(
    "SELECT id FROM users WHERE openId = ?",
    [OPEN_ID]
  );
  let userId;

  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
    console.log(`✅ users 기존 레코드 사용 (id=${userId})`);
  } else {
    const [r] = await conn.execute(
      `INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn)
       VALUES (?, ?, ?, 'password', 'admin', NOW(), NOW(), NOW())`,
      [OPEN_ID, "Apple 심사 테스트", EMAIL]
    );
    userId = r.insertId;
    console.log(`✅ users 레코드 생성 (id=${userId})`);
  }

  // ── 2. app_roles 테이블 ──────────────────────────────────────────
  const [existingRoles] = await conn.execute(
    "SELECT id FROM app_roles WHERE userId = ?",
    [userId]
  );

  if (existingRoles.length > 0) {
    await conn.execute(
      `UPDATE app_roles SET
         appRole='hq_admin', loginId=?, passwordHash=?,
         phoneNumber='010-0000-0000', name='Apple 심사 테스트',
         isActive=1, mustChangePassword=0, updatedAt=NOW()
       WHERE userId=?`,
      [LOGIN_ID, passwordHash, userId]
    );
    console.log(`✅ app_roles 업데이트 완료 (userId=${userId})`);
  } else {
    await conn.execute(
      `INSERT INTO app_roles
         (userId, appRole, loginId, passwordHash, phoneNumber, name, isActive, mustChangePassword, createdAt, updatedAt)
       VALUES (?, 'hq_admin', ?, ?, '010-0000-0000', 'Apple 심사 테스트', 1, 0, NOW(), NOW())`,
      [userId, LOGIN_ID, passwordHash]
    );
    console.log(`✅ app_roles 생성 완료 (userId=${userId})`);
  }

  // ── 3. 테스트 지사 생성 ─────────────────────────────────────────
  const [existingBranch] = await conn.execute(
    "SELECT id FROM branches WHERE code = 'TEST'",
    []
  );
  let branchId;

  if (existingBranch.length > 0) {
    branchId = existingBranch[0].id;
    console.log(`✅ 테스트 지사 기존 사용 (id=${branchId})`);
  } else {
    const [br] = await conn.execute(
      `INSERT INTO branches (name, code, region, managerName, phoneNumber, address, isActive, isDeleted, createdAt, updatedAt)
       VALUES ('테스트 지사', 'TEST', '경기도 수원시', '테스트 지사장', '031-000-0000', '경기도 수원시 팔달구 테스트로 1', 1, 0, NOW(), NOW())`,
      []
    );
    branchId = br.insertId;
    console.log(`✅ 테스트 지사 생성 (id=${branchId})`);
  }

  // ── 4. 테스트 기사 생성 ─────────────────────────────────────────
  const [existingTech] = await conn.execute(
    "SELECT id FROM technicians WHERE name = '테스트 기사' AND isDeleted = 0",
    []
  );
  let techId;

  if (existingTech.length > 0) {
    techId = existingTech[0].id;
    console.log(`✅ 테스트 기사 기존 사용 (id=${techId})`);
  } else {
    const [tr] = await conn.execute(
      `INSERT INTO technicians (name, phoneNumber, specialty, branchId, isActive, isDeleted, createdAt)
       VALUES ('테스트 기사', '010-1234-5678', '난방 수리 전문', ?, 1, 0, NOW())`,
      [branchId]
    );
    techId = tr.insertId;
    console.log(`✅ 테스트 기사 생성 (id=${techId})`);
  }

  // ── 5. 샘플 접수 데이터 ─────────────────────────────────────────
  const sampleRequests = [
    {
      requestNumber: "TEST-2026-0001",
      customerName: "김테스트",
      phoneNumber: "010-1111-2222",
      sido: "경기도", sigungu: "수원시 팔달구", eupmyeondong: "우만동",
      apartmentName: "테스트아파트", dong: "101", ho: "1001",
      roadAddress: "경기도 수원시 팔달구 우만로 1",
      customerLat: "37.2636", customerLng: "127.0286",
      requestType: "난방고장", symptom: "집전체가춥다",
      status: "방문예정", ownerType: "branch",
      branchId, technicianId: techId, technicianName: "테스트 기사",
      scheduledDate: "2026-07-15", scheduledTime: "오전 10시",
      workflowStage: "일정확정",
    },
    {
      requestNumber: "TEST-2026-0002",
      customerName: "이테스트",
      phoneNumber: "010-3333-4444",
      sido: "경기도", sigungu: "수원시 영통구", eupmyeondong: "망포동",
      apartmentName: "샘플아파트", dong: "202", ho: "505",
      roadAddress: "경기도 수원시 영통구 망포로 2",
      customerLat: "37.2430", customerLng: "127.0571",
      requestType: "난방고장", symptom: "기타문의",
      status: "신규접수", ownerType: "unassigned",
      branchId: null, technicianId: null, technicianName: null,
      scheduledDate: null, scheduledTime: null,
      workflowStage: "접수완료",
    },
    {
      requestNumber: "TEST-2026-0003",
      customerName: "박테스트",
      phoneNumber: "010-5555-6666",
      sido: "경기도", sigungu: "수원시 권선구", eupmyeondong: "권선동",
      apartmentName: "완료아파트", dong: "303", ho: "1203",
      roadAddress: "경기도 수원시 권선구 권선로 3",
      customerLat: "37.2523", customerLng: "126.9960",
      requestType: "배관청소", symptom: "배관청소가필요하다",
      status: "작업완료", ownerType: "branch",
      branchId, technicianId: techId, technicianName: "테스트 기사",
      scheduledDate: "2026-07-08", scheduledTime: "오후 2시",
      workflowStage: "작업완료",
    },
  ];

  for (const req of sampleRequests) {
    const [ex] = await conn.execute(
      "SELECT id FROM repair_requests WHERE requestNumber = ?",
      [req.requestNumber]
    );
    if (ex.length > 0) {
      console.log(`✅ 접수 기존 사용: ${req.requestNumber}`);
      continue;
    }
    await conn.execute(
      `INSERT INTO repair_requests
         (requestNumber, branchId, customerName, phoneNumber,
          sido, sigungu, eupmyeondong, apartmentName, dong, ho,
          roadAddress, customerLat, customerLng,
          requestType, symptom, status, ownerType,
          technicianId, technicianName, scheduledDate, scheduledTime,
          workflowStage, isDeleted, isUrgent, needsRevisit, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NOW(), NOW())`,
      [
        req.requestNumber, req.branchId, req.customerName, req.phoneNumber,
        req.sido, req.sigungu, req.eupmyeondong, req.apartmentName, req.dong, req.ho,
        req.roadAddress, req.customerLat, req.customerLng,
        req.requestType, req.symptom, req.status, req.ownerType,
        req.technicianId, req.technicianName, req.scheduledDate, req.scheduledTime,
        req.workflowStage,
      ]
    );
    console.log(`✅ 접수 생성: ${req.requestNumber} (${req.customerName})`);
  }

  // ── 6. 테스트 누수 센서 ─────────────────────────────────────────
  const sensors = [
    {
      sensorUid: "FE-LEAK-TEST01",
      customerName: "센서테스트 고객",
      phoneNumber: "010-7777-8888",
      apartmentName: "센서테스트아파트",
      dong: "101", ho: "201",
      sensorName: "보일러실 누수감지기",
      installLocation: "보일러실 바닥",
      status: "정상",
      batteryLevel: 95,
    },
    {
      sensorUid: "FE-LEAK-TEST02",
      customerName: "누수감지 테스트",
      phoneNumber: "010-9999-0000",
      apartmentName: "누수테스트아파트",
      dong: "202", ho: "301",
      sensorName: "세탁실 누수감지기",
      installLocation: "세탁실 배수구 옆",
      status: "누수감지",
      batteryLevel: 78,
    },
  ];

  for (const s of sensors) {
    const [ex] = await conn.execute(
      "SELECT id FROM leak_sensors WHERE sensorUid = ?",
      [s.sensorUid]
    );
    if (ex.length > 0) {
      console.log(`✅ 센서 기존 사용: ${s.sensorUid}`);
      continue;
    }
    await conn.execute(
      `INSERT INTO leak_sensors
         (sensorUid, branchId, customerName, phoneNumber, apartmentName, dong, ho,
          sensorName, installLocation, status, batteryLevel, lastCommAt, isResolved, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, NOW(), NOW())`,
      [
        s.sensorUid, branchId, s.customerName, s.phoneNumber,
        s.apartmentName, s.dong, s.ho,
        s.sensorName, s.installLocation, s.status, s.batteryLevel,
      ]
    );
    console.log(`✅ 센서 생성: ${s.sensorUid} (${s.status})`);
  }

  // ── 7. 최종 확인 ────────────────────────────────────────────────
  const [roleCheck] = await conn.execute(
    "SELECT ar.appRole, ar.loginId, ar.isActive FROM app_roles ar WHERE ar.userId = ?",
    [userId]
  );
  console.log("\n=== 테스트 계정 최종 확인 ===");
  console.log("loginId:", roleCheck[0]?.loginId);
  console.log("appRole:", roleCheck[0]?.appRole);
  console.log("isActive:", roleCheck[0]?.isActive);
  console.log("비밀번호 검증:", bcrypt.compareSync(PW, passwordHash) ? "OK" : "FAIL");
  console.log("\n✅ 모든 테스트 데이터 생성 완료");

} catch (err) {
  console.error("❌ 오류:", err.message);
} finally {
  await conn.end();
}
