import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCallbackUrlNormalizer } from "./callback-url";

const HUB = "https://hub.asafarim.com";
const DEFAULT_CALLBACK = "/dashboard";
const normalize = createCallbackUrlNormalizer({
  selfOrigin: HUB,
  trustedOrigins: new Set([
    HUB,
    "https://testora.cloud",
    "https://asafarim.com",
  ]),
  fallback: DEFAULT_CALLBACK,
  signInPaths: ["/sign-in", "/sign-up"],
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

describe("the policy is configurable (Admin's shape)", () => {
  const admin = createCallbackUrlNormalizer({
    selfOrigin: "https://admin.asafarim.com",
    trustedOrigins: new Set(["https://hub.asafarim.com"]),
    fallback: "/",
    signInPaths: ["/sign-in"],
  });
  it("uses its own fallback, origin and sign-in paths", () => {
    expect(admin("/users")).toBe("/users");
    expect(admin("javascript:alert(1)")).toBe("/");
    expect(admin("/sign-in?callbackUrl=/users")).toBe("/");
    expect(admin("/sign-up")).toBe("/sign-up"); // not a sign-in path for Admin
    expect(admin("https://admin.asafarim.com/users")).toBe("/users");
    expect(admin("https://hub.asafarim.com/dashboard")).toBe(
      "https://hub.asafarim.com/dashboard"
    );
  });
});

describe("guard: no app navigates to a query-derived value without the helper (#807)", () => {
  const appsDir = path.resolve(import.meta.dirname, "../../../apps");
  const NAVIGATES =
    /\blocation\s*\.\s*(?:href\s*=(?!=)|assign\s*\(|replace\s*\()/;

  function* sourceFiles(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      if (["node_modules", ".next", "dist", "e2e"].includes(name)) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) yield* sourceFiles(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
        yield full;
    }
  }

  // Files in apps/hub and apps/admin that may assign to `location`, and why each is safe.
  const ALLOWED: Record<string, RegExp> = {
    // normalises the raw query value with the shared helper and assigns only its result
    "admin/app/sign-in/page.tsx": /createCallbackUrlNormalizer/,
    // the one place Hub navigates after sign-in (#800); takes the already-normalised `callbackUrl` from
    // SignInPageContent / EmailCodeForm, which never assign to location themselves
    "hub/app/sign-in/_components/navigate-after-sign-in.ts":
      /callbackUrl: string/,
  };

  // #811: the helper that navigates must only ever receive a NORMALISED value. These callers are the only
  // ones, and each passes `callbackUrl` (the normalised value), never the raw query string.
  const CALLERS = [
    "hub/app/sign-in/_components/SignInPageContent.tsx",
    "hub/app/sign-in/_components/EmailCodeForm.tsx",
  ];

  it("only the sign-in forms call navigateAfterSignIn, and never with a raw query value", () => {
    const callers: string[] = [];
    for (const file of sourceFiles(path.join(appsDir, "hub"))) {
      const rel = path.relative(appsDir, file).split(path.sep).join("/");
      if (rel.endsWith("/navigate-after-sign-in.ts")) continue; // the definition
      const src = readFileSync(file, "utf8");
      if (!/\bnavigateAfterSignIn\s*\(/.test(src)) continue;
      callers.push(rel);
      expect(CALLERS, `${rel} calls navigateAfterSignIn`).toContain(rel);
      expect(src, rel).toMatch(/navigateAfterSignIn\(\s*callbackUrl\s*,/);
      // never the raw query value
      expect(src, rel).not.toMatch(
        /navigateAfterSignIn\(\s*(?:searchParams|rawCallbackUrl|params|[^,)]*\.get\()/
      );
    }
    expect(callers.sort()).toEqual([...CALLERS].sort());
  });

  it("SignInPageContent derives its callbackUrl with normalizeCallbackUrl", () => {
    const src = readFileSync(
      path.join(appsDir, "hub/app/sign-in/_components/SignInPageContent.tsx"),
      "utf8"
    );
    expect(src).toMatch(/callbackUrl\s*=\s*normalizeCallbackUrl\(/);
  });

  it("EmailCodeForm only takes callbackUrl as a prop, from SignInPageContent", () => {
    const form = readFileSync(
      path.join(appsDir, "hub/app/sign-in/_components/EmailCodeForm.tsx"),
      "utf8"
    );
    expect(form).toMatch(/callbackUrl: string/);
    expect(form).not.toMatch(/searchParams|useSearchParams/);
    const page = readFileSync(
      path.join(appsDir, "hub/app/sign-in/_components/SignInPageContent.tsx"),
      "utf8"
    );
    expect(page).toMatch(/<EmailCodeForm[\s\S]*?callbackUrl=\{callbackUrl\}/);
  });

  it("only the allow-listed sign-in files assign to location, and each uses the helper", () => {
    const found: string[] = [];
    for (const app of ["hub", "admin"]) {
      const root = path.join(appsDir, app);
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (!NAVIGATES.test(src)) continue;
        const rel = path.relative(appsDir, file).split(path.sep).join("/");
        found.push(rel);
        expect(Object.keys(ALLOWED), `${rel} assigns to location`).toContain(
          rel
        );
        expect(src, rel).toMatch(ALLOWED[rel]!);
        // never the raw query value
        expect(src, rel).not.toMatch(
          /location\s*\.\s*(?:href\s*=|assign\s*\(|replace\s*\()\s*(?:searchParams|rawCallbackUrl|params)/
        );
      }
    }
    expect(found.sort()).toEqual(Object.keys(ALLOWED).sort());
  });
});
