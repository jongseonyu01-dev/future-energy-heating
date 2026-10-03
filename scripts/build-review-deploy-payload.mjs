import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sources = [
  ["package.json", "review-server/package.json"],
  ["api/trpc/[procedure].js", "review-server/api/trpc/[procedure].js"],
  ["api/location/update.js", "review-server/api/location/update.js"],
  ["api/location/stop.js", "review-server/api/location/stop.js"],
];

const files = await Promise.all(
  sources.map(async ([file, source]) => ({
    file,
    data: await readFile(resolve(root, source), "utf8"),
  })),
);

const payload = {
  name: "futureenergytech",
  target: "preview",
  teamId: "futureenergytech",
  files,
};

await writeFile(
  resolve(root, "evidence", "review-preview-v37-deploy.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
  "utf8",
);

console.log("Wrote evidence/review-preview-v37-deploy.json with current isolated review-server sources.");
