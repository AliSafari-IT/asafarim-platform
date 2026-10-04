import { createHash } from "node:crypto";
import { SignJWT, decodeJwt, exportJWK, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/auth", () => ({ auth: vi.fn() }));
vi.mock("@asafarim/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { GET } from "./route";
import { resumeKey, signResume, verifyResume } from "@/lib/oidc-handoff";

let identity: Awaited<ReturnType<typeof generateKeyPair>>;

beforeAll(async () => {
  identity = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const hub = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  process.env.HUB_IDENTITY_TICKET_PUBLIC_JWK = JSON.stringify(await exportJWK(identity.publicKey));
  process.env.HUB_OIDC_ASSERTION_PRIVATE_JWK = JSON.stringify(await exportJWK(hub.privateKey));
  process.env.IDENTITY_ISSUER_URL = "https://id.asafarim.site";
  process.env.AUTH_SECRET = "a-route-test-secret-of-some-length";
});

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(prisma.user.findUnique).mockReset();
});

async function ticket(uid = "uid-abc") {
  return new SignJWT({ uid, nonce: "n".repeat(22) })
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer("id")
    .setAudience("hub")
    .setIssuedAt()
    .setExpirationTime("120s")
    .sign(identity.privateKey);
}

const request = (t: string) => new Request(`https://hub.asafarim.com/oidc/continue?ticket=${encodeURIComponent(t)}`);

// #801: the resume cookie. NODE_ENV is "test" here, so it is the plain, non-Secure name.
const COOKIE = "hub_handoff";
const bare = (cookie?: string) =>
  new Request("https://hub.asafarim.com/oidc/continue", cookie === undefined ? {} : { headers: { cookie: `${COOKIE}=${cookie}` } });
const withBoth = (t: string, cookie: string) =>
  new Request(`https://hub.asafarim.com/oidc/continue?ticket=${encodeURIComponent(t)}`, { headers: { cookie: `${COOKIE}=${cookie}` } });
const resume = (uid: string) => signResume(uid, resumeKey());
const signedIn = (id = "user-1", isActive = true) => {
  vi.mocked(auth).mockResolvedValue({ user: { id } } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id, isActive } as never);
};
/** The value of the resume cookie a response sets, if any. */
const setCookieValue = (res: Response) => /^hub_handoff=([^;]*)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
const assertionOf = (html: string) => decodeJwt(/name="assertion" value="([^"]+)"/.exec(html)![1]!);

describe("GET /oidc/continue (#782)", () => {
  it("with a session → an auto-POST page whose form targets exactly <issuer>/interaction/<uid>/hub", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", isActive: true } as never);
    const res = await GET(request(await ticket("uid-abc")));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    const action = /<form id="handoff" method="post" action="([^"]+)">/.exec(html)![1];
    expect(action).toBe("https://id.asafarim.site/interaction/uid-abc/hub");
    const assertion = /name="assertion" value="([^"]+)"/.exec(html)![1]!;
    expect(decodeJwt(assertion)).toMatchObject({ sub: "user-1", uid: "uid-abc", aud: "id", iss: "hub" });
  });

  it("the assertion page has its own strict CSP (#794): form-action = the identity origin, script-src = the inline script's hash", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", isActive: true } as never);
    const res = await GET(request(await ticket()));
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeTruthy();
    const directives = Object.fromEntries(
      csp!.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(" ")]),
    );
    expect(directives["default-src"]).toBe("'none'");
    expect(directives["form-action"]).toBe("https://id.asafarim.site");
    expect(directives["base-uri"]).toBe("'none'");
    expect(directives["frame-ancestors"]).toBe("'none'");
    expect(directives["style-src"]).toBe("'unsafe-inline'");

    // Hash the inline script exactly as served: it must be the only allowed script.
    const html = await res.text();
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts).toHaveLength(1);
    const hash = `'sha256-${createHash("sha256").update(scripts[0]!).digest("base64")}'`;
    expect(directives["script-src"]).toBe(hash);
  });

  it("every other response gets a no-script, no-form CSP", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-3" } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-3", isActive: false } as never);
    for (const res of [await GET(request("bad")), await GET(request(await ticket()))]) {
      const csp = res.headers.get("content-security-policy")!;
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(csp).not.toContain("script-src");
    }
  });

  it("without a session → Hub's sign-in with a return path back here, without the ticket (#801)", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const t = await ticket();
    const res = await GET(request(t));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/sign-in");
    expect(to.searchParams.get("callbackUrl")).toBe("/oidc/continue");
    expect(res.headers.get("location")).not.toContain("ticket");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("an inactive user → refused, no assertion (read from the DB, not the session)", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-2", isActive: true } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-2", isActive: false } as never);
    const res = await GET(request(await ticket()));
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("account_inactive");
    expect(html).not.toContain('name="assertion"');
  });

  it("an invalid or expired ticket → error page with 'start again', no assertion, even when signed out", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const forged = await new SignJWT({ uid: "u", nonce: "n".repeat(22) })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuer("id")
      .setAudience("hub")
      .setIssuedAt()
      .setExpirationTime("120s")
      .sign((await generateKeyPair("EdDSA", { crv: "Ed25519" })).privateKey);
    for (const t of [forged, "not-a-jwt", ""]) {
      const res = await GET(request(t));
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("start signing in again");
      expect(html).not.toContain('name="assertion"');
    }
    expect(auth).not.toHaveBeenCalled();
  });

  it("not configured (before P2.3) → 'not enabled', nothing else runs", async () => {
    const saved = process.env.IDENTITY_ISSUER_URL;
    const savedPub = process.env.HUB_IDENTITY_TICKET_PUBLIC_JWK;
    const savedPriv = process.env.HUB_OIDC_ASSERTION_PRIVATE_JWK;
    delete process.env.IDENTITY_ISSUER_URL;
    delete process.env.HUB_IDENTITY_TICKET_PUBLIC_JWK;
    delete process.env.HUB_OIDC_ASSERTION_PRIVATE_JWK;
    try {
      const res = await GET(request("x"));
      expect(res.status).toBe(503);
      expect(await res.text()).toContain("handoff_not_enabled");
      expect(auth).not.toHaveBeenCalled();
    } finally {
      process.env.IDENTITY_ISSUER_URL = saved;
      process.env.HUB_IDENTITY_TICKET_PUBLIC_JWK = savedPub;
      process.env.HUB_OIDC_ASSERTION_PRIVATE_JWK = savedPriv;
    }
  });
});

describe("GET /oidc/continue: the resume cookie across a slow sign-in (#801, spec §4.3)", () => {
  it("ticket + no session → 303 to /sign-in?callbackUrl=%2Foidc%2Fcontinue, no ticket in Location, resume cookie set", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const t = await ticket("uid-slow");
    const res = await GET(request(t));
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toBe("https://hub.asafarim.com/sign-in?callbackUrl=%2Foidc%2Fcontinue");
    expect(location).not.toContain("ticket");
    const header = res.headers.get("set-cookie")!;
    expect(header).toMatch(/^hub_handoff=[\w.-]+;/);
    for (const attr of ["Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=600"]) expect(header).toContain(attr);
    expect(header).not.toContain("Secure"); // local http
    expect(await verifyResume(setCookieValue(res)!, resumeKey())).toEqual({ uid: "uid-slow" });
  });

  it("the resume cookie never carries the ticket or anything secret: just the uid", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const t = await ticket("uid-slow");
    const value = setCookieValue(await GET(request(t)))!;
    expect(value).not.toContain(t);
    expect(decodeJwt(value)).toEqual({ uid: "uid-slow", iat: expect.any(Number), exp: expect.any(Number) });
  });

  it("no ticket + valid cookie + session → the assertion page for the cookie's uid; the cookie is not cleared", async () => {
    signedIn();
    const res = await GET(bare(await resume("uid-from-cookie")));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(/<form id="handoff" method="post" action="([^"]+)">/.exec(html)![1]).toBe("https://id.asafarim.site/interaction/uid-from-cookie/hub");
    expect(assertionOf(html)).toMatchObject({ sub: "user-1", uid: "uid-from-cookie" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("no ticket + no cookie → 400 handoff_missing, no assertion, no session lookup", async () => {
    signedIn();
    const res = await GET(bare());
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("handoff_missing");
    expect(html).toContain("start signing in again");
    expect(html).not.toContain('name="assertion"');
    expect(html).not.toContain("<a ");
    expect(auth).not.toHaveBeenCalled();
  });

  it("no ticket + an invalid cookie (garbage, tampered, wrong key, expired) → 400 handoff_missing", async () => {
    signedIn();
    const good = await resume("uid-x");
    const wrongKey = await signResume("uid-x", resumeKey({ AUTH_SECRET: "some-other-secret-of-some-length" }));
    const expired = await signResume("uid-x", resumeKey(), new Date(Date.now() - 700_000));
    for (const value of ["garbage", `${good.slice(0, -3)}AAA`, wrongKey, expired]) {
      const res = await GET(bare(value));
      expect(res.status, value).toBe(400);
      expect(await res.text()).toContain("handoff_missing");
    }
    expect(auth).not.toHaveBeenCalled();
  });

  it("ticket + a cookie for another uid → the assertion uses the ticket's uid, and the cookie is replaced", async () => {
    signedIn();
    const res = await GET(withBoth(await ticket("uid-ticket"), await resume("uid-old")));
    expect(res.status).toBe(200);
    expect(assertionOf(await res.text())).toMatchObject({ uid: "uid-ticket" });
    expect(await verifyResume(setCookieValue(res)!, resumeKey())).toEqual({ uid: "uid-ticket" });
  });

  it("an expired ticket → a 400 page with exactly one link, to <issuer>/interaction/<uid>; the CSP is still the error policy", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const expiredTicket = await new SignJWT({ uid: "uid-late", nonce: "n".repeat(22) })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuer("id")
      .setAudience("hub")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 300)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 180)
      .sign(identity.privateKey);
    const res = await GET(request(expiredTicket));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<a href="https://id.asafarim.site/interaction/uid-late">Try again</a>');
    expect(html).not.toContain("<form");
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain("script-src");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });

  it("an invalid (forged) ticket gets no 'Try again' link", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const forged = await new SignJWT({ uid: "uid-late", nonce: "n".repeat(22) })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuer("id")
      .setAudience("hub")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 300)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 180)
      .sign((await generateKeyPair("EdDSA", { crv: "Ed25519" })).privateKey);
    const html = await (await GET(request(forged))).text();
    expect(html).not.toContain("<a ");
  });

  it("an inactive user via the cookie → 403, no assertion, and the cookie is cleared", async () => {
    signedIn("user-9", false);
    const res = await GET(bare(await resume("uid-x")));
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("account_inactive");
    expect(html).not.toContain('name="assertion"');
    const header = res.headers.get("set-cookie")!;
    expect(header).toMatch(/^hub_handoff=;/);
    expect(header).toContain("Max-Age=0");
  });

  it("in production the cookie is __Host- prefixed and Secure, and that is the one the route reads", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      vi.mocked(auth).mockResolvedValue(null as never);
      const res = await GET(request(await ticket("uid-prod")));
      const header = res.headers.get("set-cookie")!;
      expect(header).toMatch(/^__Host-hub_handoff=/);
      expect(header).toContain("Secure");
      expect(header).toContain("Path=/");
      expect(header).not.toContain("Domain");
      signedIn();
      const value = /^__Host-hub_handoff=([^;]*)/.exec(header)![1]!;
      const resumed = await GET(new Request("https://hub.asafarim.com/oidc/continue", { headers: { cookie: `__Host-hub_handoff=${value}` } }));
      expect(resumed.status).toBe(200);
      // the plain (non-prefixed) cookie name is not accepted in production
      const plain = await GET(new Request("https://hub.asafarim.com/oidc/continue", { headers: { cookie: `hub_handoff=${value}` } }));
      expect(plain.status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
