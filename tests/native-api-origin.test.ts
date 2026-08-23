import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const officialApiOrigin = "https://xn--h50b270bp0ceuddugnobx2m.kr";
const redirectedWwwOrigin = "https://www.xn--h50b270bp0ceuddugnobx2m.kr";

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("native API origin", () => {
  it("uses the non-redirecting official origin", () => {
    const apiOriginSource = read("constants/api-origin.ts");
    const oauthSource = read("constants/oauth.ts");
    expect(apiOriginSource).toContain(`export const API_BASE_URL = "${officialApiOrigin}"`);
    expect(apiOriginSource).not.toContain(redirectedWwwOrigin);
    expect(oauthSource).toContain('export { API_BASE_URL } from "./api-origin"');
  });

  it("shares one API constant across authenticated native requests", () => {
    for (const relativePath of ["lib/trpc.ts", "lib/auth-context.tsx", "lib/location-tracking.ts"]) {
      const source = read(relativePath);
      expect(source).toContain("API_BASE_URL");
      expect(source).not.toContain(redirectedWwwOrigin);
    }
  });

  it("requires the first fixed Android build", () => {
    const workflowSource = read(".github/workflows/eas-build-apk.yml");
    expect(workflowSource).toContain("minSupportedVersionCode: 29");
    expect(read("app.config.ts")).toContain("versionCode: 29");
  });
});
