import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());
const baseline = process.argv[3] ?? "d17debf2";
const changed = execFileSync("git", ["diff", "--name-only", baseline, "--"], { cwd: root, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const publicWebChanges = changed.filter((file) => file.startsWith("public/web/"));
const migrationChanges = changed.filter((file) => /^drizzle\/\d+.*\.sql$/.test(file));
const disallowed = changed.filter((file) => file.startsWith("public/web/") || file.startsWith("public/estimate"));

assert.deepEqual(publicWebChanges, [], "Homepage static estimate files must not change in the mobile candidate");
assert.deepEqual(migrationChanges, [], "Candidate must not introduce a shared DB migration");
assert.deepEqual(disallowed, [], "Candidate must not change the homepage estimate UI or public estimate renderer");

console.log(JSON.stringify({ baseline, changed, publicWebChanges, migrationChanges, result: "PASS" }, null, 2));
