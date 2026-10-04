import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALLBACK,
  createCallbackUrlNormalizer,
  normalizeCallbackUrl as realNormalizer,
} from "./callback-url";

const HUB = "https://hub.asafarim.com";
const normalize = createCallbackUrlNormalizer({
  hubOrigin: HUB,
  trustedOrigins: new Set([
    HUB,
    "https://testora.cloud",
    "https://asafarim.com",
  ]),
});

/** What the sign-in page actually sees: `searchParams.get` DECODES the value once. */
const fromQuery = (query: string) =>
  normalize(new URLSearchParams(query).get("callbackUrl"));

/** The origin a browser would navigate to for a value Hub returned. */
const originOf = (result: string) => new URL(result, HUB).origin;

describe("callbackUrl: the safe values keep working", () => {
  it("a plain Hub path, with its query and hash", () => {
    expect(normalize("/dashboard")).toBe("/dashboard");
    expect(normalize("/apps?tab=mine#top")).toBe("/apps?tab=mine#top");
  });

  it("the sign-in hand-off: /oidc/continue, with and without its query, unchanged (#801)", () => {
    expect(normalize("/oidc/continue")).toBe("/oidc/continue");
    expect(normalize("/oidc/continue?ticket=x")).toBe(
      "/oidc/continue?ticket=x"
    );
    const ticket = "eyJhbGciOiJFZERTQSJ9.eyJ1aWQiOiJ4In0.c2ln_-Z";
    expect(normalize(`/oidc/continue?ticket=${ticket}`)).toBe(
      `/oidc/continue?ticket=${ticket}`
    );
  });

  it("a trusted absolute URL is accepted (as the resolved URL)", () => {
    expect(normalize("https://testora.cloud/runs?x=1")).toBe(
      "https://testora.cloud/runs?x=1"
    );
    expect(normalize("https://asafarim.com")).toBe("https://asafarim.com/");
  });

  it("an absolute URL on Hub's own origin becomes a relative path", () => {
    expect(normalize(`${HUB}/profile?x=1`)).toBe("/profile?x=1");
  });

  it("nothing, empty and the default fall back to /dashboard", () => {
    for (const v of [null, undefined, "", "/dashboard"])
      expect(normalize(v)).toBe(DEFAULT_CALLBACK);
  });

  it("/sign-in and /sign-up map to /dashboard, however they're spelled", () => {
    for (const v of [
      "/sign-in",
      "/sign-in?callbackUrl=/x",
      "/sign-up",
      "/sign-up/",
      "/sign-in/../sign-up",
      `${HUB}/sign-in`,
    ]) {
      expect(normalize(v), v).toBe("/dashboard");
    }
  });
});

describe("callbackUrl: values that would leave the site are refused", () => {
  it("a backslash anywhere, raw or percent-encoded (searchParams.get decodes it)", () => {
    for (const v of [
      "/\\example.test",
      "/a\\b",
      "\\\\example.test",
      "/x?next=\\y",
    ])
      expect(normalize(v), v).toBe(DEFAULT_CALLBACK);
    for (const q of [
      "callbackUrl=%2F%5Cexample.test",
      "callbackUrl=%2F%5cexample.test",
      "callbackUrl=%5C%5Cexample.test",
    ]) {
      expect(fromQuery(q), q).toBe(DEFAULT_CALLBACK);
    }
  });

  it("a double-encoded backslash stays a literal path character: same origin, nothing leaves", () => {
    const out = fromQuery("callbackUrl=%2F%255Cexample.test");
    expect(out).toBe("/%5Cexample.test");
    expect(originOf(out)).toBe(HUB);
  });

  it("tab, newline, carriage return and other control characters inside the path", () => {
    for (const v of [
      "/\t/example.test",
      "/\n/example.test",
      "/\r/example.test",
      "/\u0000x",
      "/a\u001fb",
      "/a\u007fb",
      "/ok\n",
    ]) {
      expect(normalize(v), JSON.stringify(v)).toBe(DEFAULT_CALLBACK);
    }
    for (const q of [
      "callbackUrl=%2F%09%2Fexample.test",
      "callbackUrl=%2F%0A%2Fexample.test",
      "callbackUrl=%2F%0D%2Fexample.test",
    ]) {
      expect(fromQuery(q), q).toBe(DEFAULT_CALLBACK);
    }
  });

  it("protocol-relative //host (and the same with a trusted host)", () => {
    for (const v of [
      "//example.test",
      "//example.test/path",
      "///example.test",
      "//testora.cloud",
    ]) {
      expect(normalize(v), v).toBe(DEFAULT_CALLBACK);
    }
  });

  it("a path that RESOLVES to a protocol-relative one once dot segments are removed", () => {
    for (const v of [
      "/.//example.test",
      "/a/..//example.test",
      "/.///x".replace("//", "/"),
    ]) {
      const out = normalize(v);
      expect(out, v).toBe(DEFAULT_CALLBACK);
    }
    // whatever Hub returns for these is the default: it never starts with a second slash
    expect(normalize("/.//example.test")).not.toMatch(/^\/[\\/]/);
  });

  it("javascript:, data: and other schemes", () => {
    for (const v of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "file:///etc/passwd",
      "ftp://testora.cloud/x",
    ]) {
      expect(normalize(v), v).toBe(DEFAULT_CALLBACK);
    }
  });

  it("an untrusted absolute URL, and look-alikes of trusted ones", () => {
    for (const v of [
      "https://example.test/x",
      "http://example.test",
      "https://testora.cloud.example.test/",
      "https://example.test/testora.cloud",
      "https://testora.cloud@example.test/", // userinfo: the host is example.test
      "https://example.test#@testora.cloud/",
      "https://nottestora.cloud/",
    ]) {
      expect(normalize(v), v).toBe(DEFAULT_CALLBACK);
    }
  });

  it("a relative value that isn't a path, and an over-long value", () => {
    for (const v of [
      "dashboard",
      "foo/bar",
      "./x",
      "?x=1",
      "#x",
      " /dashboard",
      "x:y",
    ])
      expect(normalize(v), v).toBe(DEFAULT_CALLBACK);
    expect(normalize(`/${"a".repeat(3000)}`)).toBe(DEFAULT_CALLBACK);
  });

  it("whatever it returns, a browser would stay on Hub or go to a trusted origin", () => {
    const inputs = [
      "/dashboard",
      "/\\example.test",
      "/\t/example.test",
      "//example.test",
      "/.//example.test",
      "/a/..//example.test",
      "javascript:alert(1)",
      "https://example.test/",
      "https://testora.cloud/x",
      `${HUB}/x`,
      "/%5Cexample.test",
      "/%2F%2Fexample.test",
      "/sign-in",
      "https://testora.cloud@example.test/",
      "/x?y=//example.test",
      "/#//example.test",
    ];
    const allowed = new Set([
      HUB,
      "https://testora.cloud",
      "https://asafarim.com",
    ]);
    for (const v of inputs)
      expect(allowed.has(originOf(normalize(v))), v).toBe(true);
  });
});

describe("the real helper, and a guard against a second copy", () => {
  it("the platform's real helper agrees on the basics", () => {
    expect(realNormalizer("/dashboard")).toBe("/dashboard");
    expect(realNormalizer("/oidc/continue?ticket=x")).toBe(
      "/oidc/continue?ticket=x"
    );
    expect(realNormalizer("/\\example.test")).toBe(DEFAULT_CALLBACK);
    expect(realNormalizer("//example.test")).toBe(DEFAULT_CALLBACK);
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
