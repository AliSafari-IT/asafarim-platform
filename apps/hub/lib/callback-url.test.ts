import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CALLBACK, normalizeCallbackUrl } from "./callback-url";

// The helper itself (and its full case list) is tested in packages/auth/src/callback-url.test.ts (#807).
// Here: Hub's binding of it, and a guard that Hub keeps no second copy.
describe("Hub's callback check, with the platform's real origins", () => {
  it("agrees on the basics", () => {
    expect(normalizeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(normalizeCallbackUrl("/oidc/continue?ticket=x")).toBe(
      "/oidc/continue?ticket=x"
    );
    expect(normalizeCallbackUrl("/\\example.test")).toBe(DEFAULT_CALLBACK);
    expect(normalizeCallbackUrl("//example.test")).toBe(DEFAULT_CALLBACK);
    expect(normalizeCallbackUrl("javascript:alert(1)")).toBe(DEFAULT_CALLBACK);
    expect(normalizeCallbackUrl("/sign-in")).toBe(DEFAULT_CALLBACK);
    expect(normalizeCallbackUrl(null)).toBe(DEFAULT_CALLBACK);
  });

  it("both sign-in files use the shared helper and define no check of their own", () => {
    const root = path.join(import.meta.dirname, "..");
    for (const file of [
      "app/sign-in/page.tsx",
      "app/sign-in/_components/SignInPageContent.tsx",
    ]) {
      const src = readFileSync(path.join(root, file), "utf8");
      expect(src, file).toContain('from "@/lib/callback-url"');
      expect(src, file).not.toMatch(/function\s+normalizeCallbackUrl/);
      expect(src, file).not.toMatch(/startsWith\("\/\/"\)/);
      expect(src, file).not.toContain("trustedOrigins");
    }
  });
});
