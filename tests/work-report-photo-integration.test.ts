import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("work report photo integration", () => {
  it("compresses before upload and never writes signed photo URLs through save", () => {
    const source = readFileSync(path.join(root, "app/work-report.tsx"), "utf8");
    expect(source).toContain('import("expo-image-manipulator")');
    expect(source).toContain("estimateBase64Bytes(normalized.base64)");

    const saveSection = source.slice(
      source.indexOf("const handleSave"),
      source.indexOf("if (requestLoading)"),
    );
    expect(saveSection).not.toMatch(/\bbeforePhotoUrl\s*,/);
    expect(saveSection).not.toMatch(/\bafterPhotoUrl\s*,/);
  });

  it("uses the shared SecureStore key when restoring a validated session", () => {
    const source = readFileSync(path.join(root, "lib/auth-context.tsx"), "utf8");
    expect(source).toContain('import { SESSION_TOKEN_KEY } from "@/constants/oauth"');
    expect(source).toContain("SecureStore.setItemAsync(SESSION_TOKEN_KEY, saved.token)");
    expect(source).not.toContain("APP_SESSION_TOKEN_KEY");
  });

  it("locks the native dependency and increments the Android build number", () => {
    const packageSource = readFileSync(path.join(root, "package.json"), "utf8");
    const lockSource = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
    const configSource = readFileSync(path.join(root, "app.config.ts"), "utf8");
    expect(packageSource).toContain('"expo-image-manipulator": "~14.0.8"');
    expect(lockSource).toContain("expo-image-manipulator@14.0.8");
    expect(configSource).toContain('version: "1.1.13"');
    expect(configSource).toContain("versionCode: 24");
  });
});
