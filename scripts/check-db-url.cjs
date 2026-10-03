const u = process.env.DATABASE_URL || "";
if (!u) {
  console.log("DATABASE_URL: (none)");
  process.exit(0);
}
console.log("scheme:", u.split(":")[0]);
const m = u.match(/^[a-z0-9+]+:\/\/([^:]+):[^@]+@([^/:]+)(:\d+)?\/([\w-]+)/i);
if (m) {
  console.log("user:", m[1]);
  console.log("host:", m[2]);
  console.log("port:", (m[3] || "").replace(":", "") || "(default)");
  console.log("db:", m[4]);
} else {
  console.log("could not parse (masked)");
}
