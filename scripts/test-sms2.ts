/**
 * SOLAPI 테스트 문자 발송 + 최종 전송 상태 조회 스크립트
 */
import "./load-env.js";
import crypto from "crypto";

const SOLAPI_BASE_URL = "https://api.solapi.com";

function buildAuthHeader(key: string, secret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = process.env.SOLAPI_API_KEY!;
  const apiSecret = process.env.SOLAPI_API_SECRET!;
  const sender = process.env.SOLAPI_SENDER!;

  if (!apiKey || !apiSecret || !sender) {
    console.error("❌ SOLAPI 환경변수 미설정");
    process.exit(1);
  }

  const to = sender.replace(/[^0-9]/g, "");
  const from = sender.replace(/[^0-9]/g, "");
  const text = `[퓨처에너지테크] SOLAPI 연동 테스트 문자입니다. 정상 수신 확인용입니다. (${new Date().toLocaleString("ko-KR")})`;

  console.log("=== 테스트 문자 발송 ===");
  console.log(`수신번호: ${to}`);
  console.log(`발신번호: ${from}`);
  console.log(`메시지: ${text}`);
  console.log("");

  // 1단계: 문자 발송
  const sendRes = await fetch(`${SOLAPI_BASE_URL}/messages/v4/send-many/detail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(apiKey, apiSecret),
    },
    body: JSON.stringify({
      messages: [{ to, from, text }],
    }),
  });

  const sendData = await sendRes.json() as any;
  const groupId = sendData?.groupInfo?.groupId || sendData?.groupInfo?._id;

  if (!sendRes.ok || !groupId) {
    console.error("❌ 발송 요청 실패");
    console.error(JSON.stringify(sendData, null, 2));
    process.exit(1);
  }

  console.log(`✅ 발송 요청 성공 (그룹 ID: ${groupId})`);
  console.log(`   등록 성공: ${sendData.groupInfo?.count?.registeredSuccess}건`);
  console.log(`   등록 실패: ${sendData.groupInfo?.count?.registeredFailed}건`);
  console.log("");

  // 2단계: 10초 대기 후 최종 상태 조회
  console.log("10초 후 최종 전송 상태를 조회합니다...");
  await sleep(10000);

  const statusRes = await fetch(
    `${SOLAPI_BASE_URL}/messages/v4/list?groupId=${groupId}&limit=10`,
    {
      headers: {
        Authorization: buildAuthHeader(apiKey, apiSecret),
      },
    }
  );

  const statusData = await statusRes.json() as any;
  // messageList는 객체(id→message 맵)이거나 배열일 수 있음
  const rawList = statusData?.messageList;
  const messages = Array.isArray(rawList)
    ? rawList
    : rawList && typeof rawList === "object"
    ? Object.values(rawList)
    : [];

  console.log("=== 최종 전송 상태 ===");
  if (messages.length === 0) {
    // 그룹 정보로 대신 확인
    const groupRes = await fetch(
      `${SOLAPI_BASE_URL}/messages/v4/groups/${groupId}`,
      {
        headers: {
          Authorization: buildAuthHeader(apiKey, apiSecret),
        },
      }
    );
    const groupData = await groupRes.json() as any;
    const count = groupData?.count || {};
    console.log(`  전체: ${count.total || 0}건`);
    console.log(`  발송 성공: ${count.sentSuccess || 0}건`);
    console.log(`  발송 실패: ${count.sentFailed || 0}건`);
    console.log(`  처리 중: ${count.sentPending || 0}건`);
    console.log(`  그룹 상태: ${groupData?.status || "알 수 없음"}`);

    if ((count.sentSuccess || 0) > 0) {
      console.log("\n✅ 문자 전송 완료 (수신 성공)");
    } else if ((count.sentFailed || 0) > 0) {
      console.log("\n❌ 문자 전송 실패");
    } else {
      console.log("\n⏳ 아직 처리 중 (통신사 전달 대기)");
    }
  } else {
    messages.forEach((m: any, i: number) => {
      console.log(`[${i + 1}] 메시지 ID: ${m.messageId}`);
      console.log(`    상태 코드: ${m.statusCode}`);
      console.log(`    상태 메시지: ${m.statusMessage || m.networkCode || "-"}`);
      console.log(`    수신번호: ${m.to}`);
      const success = m.statusCode === "2000" || m.statusCode?.startsWith("2");
      console.log(`    결과: ${success ? "✅ 전송 성공" : "❌ 전송 실패"}`);
    });
  }
}

main().catch((e) => {
  console.error("❌ 실행 오류:", e.message);
  process.exit(1);
});
