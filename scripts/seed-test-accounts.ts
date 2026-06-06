/**
 * 테스트 계정 시드 스크립트
 * 실행: npx tsx scripts/seed-test-accounts.ts
 */
import "../scripts/load-env.js";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { appRoles, branches, technicians } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "../server/_core/env";

function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

async function main() {
  const connection = await mysql.createConnection(ENV.databaseUrl);
  const db = drizzle(connection);

  console.log("🔧 테스트 계정 생성 시작...");

  // 1. 안산지사 생성 (없으면)
  const existingBranches = await db.select().from(branches).where(eq(branches.name, "안산지사"));
  let branchId: number;
  if (existingBranches.length === 0) {
    const [result] = await db.insert(branches).values({
      name: "안산지사",
      code: "AS",
      region: "경기도 안산시",
      address: "경기도 안산시 단원구 광덕대로 123",
      phoneNumber: "031-400-0000",
      managerUserId: null,
      isActive: true,
      createdAt: new Date(),
    });
    branchId = (result as any).insertId;
    console.log(`✅ 안산지사 생성 완료 (ID: ${branchId})`);
  } else {
    branchId = existingBranches[0].id;
    console.log(`ℹ️  안산지사 이미 존재 (ID: ${branchId})`);
  }

  // 2. 본사 관리자 계정 (admin / admin1234)
  const adminExisting = await db.select().from(appRoles).where(eq(appRoles.loginId, "admin"));
  if (adminExisting.length === 0) {
    await db.insert(appRoles).values({
      userId: 100001,
      appRole: "hq_admin",
      loginId: "admin",
      passwordHash: simpleHash("admin1234"),
      phoneNumber: "010-0000-0001",
      isActive: true,
      createdAt: new Date(),
    });
    console.log("✅ 본사 관리자 계정 생성 완료 (admin / admin1234)");
  } else {
    // 비밀번호 업데이트
    await db.update(appRoles)
      .set({ passwordHash: simpleHash("admin1234"), appRole: "hq_admin", isActive: true })
      .where(eq(appRoles.loginId, "admin"));
    console.log("ℹ️  본사 관리자 계정 업데이트 완료 (admin / admin1234)");
  }

  // 3. 안산지사장 계정 (ansan / ansan1234)
  const ansanExisting = await db.select().from(appRoles).where(eq(appRoles.loginId, "ansan"));
  let ansanUserId = 100002;
  if (ansanExisting.length === 0) {
    await db.insert(appRoles).values({
      userId: ansanUserId,
      appRole: "branch_manager",
      loginId: "ansan",
      passwordHash: simpleHash("ansan1234"),
      phoneNumber: "010-0000-0002",
      isActive: true,
      createdAt: new Date(),
    });
    console.log("✅ 안산지사장 계정 생성 완료 (ansan / ansan1234)");
  } else {
    ansanUserId = ansanExisting[0].userId;
    await db.update(appRoles)
      .set({ passwordHash: simpleHash("ansan1234"), appRole: "branch_manager", isActive: true })
      .where(eq(appRoles.loginId, "ansan"));
    console.log("ℹ️  안산지사장 계정 업데이트 완료 (ansan / ansan1234)");
  }

  // 안산지사 manager_user_id 업데이트
  await db.update(branches)
    .set({ managerUserId: ansanUserId })
    .where(eq(branches.id, branchId));
  console.log(`✅ 안산지사 지사장 연결 완료 (userId: ${ansanUserId})`);

  // 4. 호남지사 생성 및 지사장 계정 (fethn / fethn5533)
  const honamBranchExisting = await db.select().from(branches).where(eq(branches.code, 'HN'));
  let honamBranchId: number;
  if (honamBranchExisting.length === 0) {
    const [result] = await db.insert(branches).values({
      name: '퓨처에너지테크 호남지사',
      code: 'HN',
      region: '호남권',
      address: '상세 주소 추가 예정',
      phoneNumber: '010-3241-5533',
      managerUserId: null,
      isActive: true,
      createdAt: new Date(),
    });
    honamBranchId = (result as any).insertId;
    console.log(`✅ 호남지사 생성 완료 (ID: ${honamBranchId})`);
  } else {
    honamBranchId = honamBranchExisting[0].id;
    await db.update(branches).set({ phoneNumber: '010-3241-5533' }).where(eq(branches.id, honamBranchId));
    console.log(`ℹ️  호남지사 이미 존재 (ID: ${honamBranchId})`);
  }
  const honamExisting = await db.select().from(appRoles).where(eq(appRoles.loginId, 'fethn'));
  let honamUserId = 100005;
  if (honamExisting.length === 0) {
    await db.insert(appRoles).values({
      userId: honamUserId,
      appRole: 'branch_manager',
      loginId: 'fethn',
      passwordHash: simpleHash('fethn5533'),
      phoneNumber: '010-3241-5533',
      isActive: true,
      createdAt: new Date(),
    });
    console.log('✅ 호남지사장 계정 생성 완료 (fethn / fethn5533)');
  } else {
    honamUserId = honamExisting[0].userId;
    await db.update(appRoles)
      .set({ passwordHash: simpleHash('fethn5533'), appRole: 'branch_manager', isActive: true, phoneNumber: '010-3241-5533' })
      .where(eq(appRoles.loginId, 'fethn'));
    console.log('ℹ️  호남지사장 계정 업데이트 완료 (fethn / fethn5533)');
  }
  await db.update(branches).set({ managerUserId: honamUserId }).where(eq(branches.id, honamBranchId));
  console.log(`✅ 호남지사 지사장 연결 완료 (userId: ${honamUserId})`);

  // 5. 부천지사 생성 및 지사장 계정 (bucheon / bucheon1234)
  const bucheonBranchExisting = await db.select().from(branches).where(eq(branches.code, 'BC'));
  let bucheonBranchId: number;
  if (bucheonBranchExisting.length === 0) {
    const [result] = await db.insert(branches).values({
      name: '퓨처에너지테크 부천지사',
      code: 'BC',
      region: '경기 부천',
      address: '상세 주소 추가 예정',
      phoneNumber: '010-5380-8317',
      managerUserId: null,
      isActive: true,
      createdAt: new Date(),
    });
    bucheonBranchId = (result as any).insertId;
    console.log(`✅ 부천지사 생성 완료 (ID: ${bucheonBranchId})`);
  } else {
    bucheonBranchId = bucheonBranchExisting[0].id;
    console.log(`ℹ️  부천지사 이미 존재 (ID: ${bucheonBranchId})`);
  }
  const bucheonExisting = await db.select().from(appRoles).where(eq(appRoles.loginId, 'bucheon'));
  let bucheonUserId = 100006;
  if (bucheonExisting.length === 0) {
    await db.insert(appRoles).values({
      userId: bucheonUserId,
      appRole: 'branch_manager',
      loginId: 'bucheon',
      passwordHash: simpleHash('bucheon1234'),
      phoneNumber: '010-5380-8317',
      isActive: true,
      createdAt: new Date(),
    });
    console.log('✅ 부천지사장 계정 생성 완료 (bucheon / bucheon1234)');
  } else {
    bucheonUserId = bucheonExisting[0].userId;
    await db.update(appRoles)
      .set({ passwordHash: simpleHash('bucheon1234'), appRole: 'branch_manager', isActive: true })
      .where(eq(appRoles.loginId, 'bucheon'));
    console.log('ℹ️  부천지사장 계정 업데이트 완료 (bucheon / bucheon1234)');
  }
  await db.update(branches).set({ managerUserId: bucheonUserId }).where(eq(branches.id, bucheonBranchId));
  console.log(`✅ 부천지사 지사장 연결 완료 (userId: ${bucheonUserId})`);

  // 6. 현장 기사 계정 (worker1 / worker1234)
  const workerExisting = await db.select().from(appRoles).where(eq(appRoles.loginId, "worker1"));
  let workerUserId = 100003;
  if (workerExisting.length === 0) {
    await db.insert(appRoles).values({
      userId: workerUserId,
      appRole: "technician",
      loginId: "worker1",
      passwordHash: simpleHash("worker1234"),
      phoneNumber: "010-0000-0003",
      isActive: true,
      createdAt: new Date(),
    });
    console.log("✅ 현장 기사 계정 생성 완료 (worker1 / worker1234)");
  } else {
    workerUserId = workerExisting[0].userId;
    await db.update(appRoles)
      .set({ passwordHash: simpleHash("worker1234"), appRole: "technician", isActive: true })
      .where(eq(appRoles.loginId, "worker1"));
    console.log("ℹ️  현장 기사 계정 업데이트 완료 (worker1 / worker1234)");
  }

  // 기사 technicians 테이블에도 등록 (없으면)
  const techExisting = await db.select().from(technicians).where(eq(technicians.userId, workerUserId));
  if (techExisting.length === 0) {
    await db.insert(technicians).values({
      name: "홍길동 기사",
      phoneNumber: "010-0000-0003",
      branchId: branchId,
      userId: workerUserId,
      isActive: true,
      createdAt: new Date(),
    });
    console.log(`✅ 기사 정보 등록 완료 (안산지사 소속)`);
  } else {
    await db.update(technicians)
      .set({ branchId: branchId, isActive: true })
      .where(eq(technicians.userId, workerUserId));
    console.log(`ℹ️  기사 정보 업데이트 완료 (안산지사 소속)`);
  }

  console.log("\n🎉 테스트 계정 생성 완료!");
  console.log("─────────────────────────────────────────");
  console.log("| 역할          | 아이디  | 비밀번호    |");
  console.log("─────────────────────────────────────────");
  console.log("| 본사 관리자   | admin   | admin1234   |");
  console.log("| 안산지사장    | ansan   | ansan1234   |");
  console.log("| 현장 기사     | worker1 | worker1234  |");
  console.log("─────────────────────────────────────────");

  await connection.end();
}

main().catch(console.error);
