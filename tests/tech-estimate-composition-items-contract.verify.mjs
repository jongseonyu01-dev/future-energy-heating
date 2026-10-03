import fs from "node:fs";
import assert from "node:assert/strict";

const screen = fs.readFileSync(new URL("../app/tech-estimate.tsx", import.meta.url), "utf8");
const reviewApi = fs.readFileSync(new URL("../review-server/api/trpc/[procedure].js", import.meta.url), "utf8");

assert.match(screen, /const standaloneQuickItems = \["단자함", "라인보수 20A", "라인보수 25A"\] as const;/);
assert.match(screen, /toggleTerminalBoxItem/);
assert.match(screen, /\+ 공급측 라인보수 추가 \(단독 120,000원\)/);
assert.match(screen, /toggleStandaloneQuickItem\(name\)/);
assert.match(screen, /addSupplyLineRepair\(lines, priceMode\)/);
assert.match(screen, /toggleDirectItem\(lines, item, priceMode\)/);
for (const label of ["제어기", "와이파이형", "V타입"]) assert.match(screen, new RegExp(`label: "${label}"`));
assert.match(screen, />단자함</);
for (const name of ["단자함", "라인보수 20A", "라인보수 25A"]) assert.match(reviewApi, new RegExp(`name: "${name}"`));
console.log("PASS composition items: configuration terminal box, standalone terminal/20A/25A, approved review snapshot, and supply-only 120,000 button contract");
