import { describe, expect, it } from "vitest";
import { createCallbackUrlNormalizer } from "@asafarim/auth/callback-url";
import { getTrustedPlatformOrigins } from "@asafarim/ui";

// Admin's sign-in policy (#807), with the platform's real trusted origins. The page builds the same policy
// with window.location.origin; here the origin is the production one. The helper's full case list is in
// packages/auth/src/callback-url.test.ts.
const ADMIN = "https://admin.asafarim.com";
// getTrustedPlatformOrigins reads NEXT_PUBLIC_*_URL when called; without them it returns the localhost defaults.
process.env.NEXT_PUBLIC_HUB_URL = "https://hub.asafarim.com";
const normalize = createCallbackUrlNormalizer({
  selfOrigin: ADMIN,
  trustedOrigins: getTrustedPlatformOrigins(),
  fallback: "/",
  signInPaths: ["/sign-in"],
});

describe("Admin sign-in callbackUrl", () => {
  it.each([
    ["javascript:alert(1)", "/"],
    ["JaVaScRiPt:alert(1)", "/"],
    ["https://evil.example", "/"],
    ["https://evil.example/https://hub.asafarim.com", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/\t/evil.example", "/"],
    ["/.//evil.example", "/"],
    ["data:text/html,<script>alert(1)</script>", "/"],
    ["", "/"],
    ["/sign-in", "/"],
  ])("%j lands on %j", (raw, expected) => {
    expect(normalize(raw)).toBe(expected);
  });

  it("nothing at all lands on /", () => {
    expect(normalize(null)).toBe("/");
    expect(normalize(undefined)).toBe("/");
  });

  it("an Admin path is kept, with its query and hash", () => {
    expect(normalize("/users")).toBe("/BROKEN-ON-PURPOSE");
    expect(normalize("/users?tab=audit#top")).toBe("/users?tab=audit#top");
    expect(normalize(`${ADMIN}/users`)).toBe("/users");
  });

  it("a trusted platform URL is allowed, as the resolved URL", () => {
    expect(normalize("https://hub.asafarim.com/dashboard")).toBe(
      "https://hub.asafarim.com/dashboard"
    );
  });

  it("a look-alike of a trusted origin is refused", () => {
    expect(normalize("https://hub.asafarim.com.evil.example/")).toBe("/");
    expect(normalize("https://hub.asafarim.com@evil.example/")).toBe("/");
  });
});
