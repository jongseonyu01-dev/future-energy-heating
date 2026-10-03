/**
 * SOLAPI 테스트 문자 발송 스크립트
 * 실행: npx tsx scripts/test-sms.ts
 */
import "./load-env.js";
import crypto from "crypto";

const SOLAPI_BASE_URL = "https://api.solapi.com";

async function main() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;

  console.log("=== SOLAPI 설정 확인 ===");
  console.log("API Key:", apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : "❌ 미설정");
  console.log("API Secret:", apiSecret ? `${apiSecret.slice(0, 4)}...${apiSecret.slice(-4)}` : "❌ 미설정");
  console.log("발신번호:", sender || "❌ 미설정");
  console.log("");

  if (!apiKey || !apiSecret || !sender) {
    console.error("❌ SOLAPI 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  // 발신번호로 자가 발송 (테스트)
  const to = sender.replace(/[^0-9]/g, "");
  const from = sender.replace(/[^0-9]/g, "");

  console.log(`수신번호: ${to} (자가 발송)`);
  console.log(`발신번호: ${from}`);
  console.log("");

  // HMAC-SHA256 인증 헤더 생성
  function buildAuthHeader(key: string, secret: string): string {
    const date = new Date().toISOString();
    const salt = crypto.randomBytes(32).toString("hex");
    const signature = crypto
      .createHmac("sha256", secret)
      .update(date + salt)
      .digest("hex");
    return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
  }

  const text = `[퓨처에너지테크] SOLAPI 연동 테스트 문자입니다. 정상 수신 확인용입니다. (${new Date().toLocaleString("ko-KR")})`;

  console.log("발송 메시지:", text);
  console.log("");
  console.log("발송 중...");

  const response = await fetch(`${SOLAPI_BASE_URL}/messages/v4/send-many/detail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(apiKey, apiSecret),
    },
    body: JSON.stringify({
      messages: [{ to, from, text }],
    }),
  });

  const data = await response.json() as any;

  console.log("=== 응답 결과 ===");
  console.log("HTTP 상태:", response.status);
  console.log("응답 전체:", JSON.stringify(data, null, 2));
  console.log("");

  if (response.ok && data.errorCount === 0) {
    console.log("✅ 문자 발송 성공!");
    const msg = data.resultList?.[0];
    if (msg) {
      console.log(`  - 메시지 ID: ${msg.messageId}`);
      console.log(`  - 상태: ${msg.statusCode} (${msg.statusMessage || ""})`);
    }
  } else {
    console.error("❌ 발송 실패");
    if (data.errorCount > 0 && data.resultList) {
      data.resultList.forEach((m: any) => {
        if (m.statusCode !== "2000") {
          console.error(`  - 오류 코드: ${m.statusCode}`);
          console.error(`  - 오류 메시지: ${m.statusMessage}`);
        }
      });
    }
    if (data.errorCode) {
      console.error(`  - 오류 코드: ${data.errorCode}`);
      console.error(`  - 오류 메시지: ${data.errorMessage || data.message}`);
    }
  }
}

main().catch((e) => {
  console.error("❌ 실행 오류:", e.message);
  process.exit(1);
});
