import { SignJWT, decodeJwt, exportJWK, generateKeyPair, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ASSERTION_AUDIENCE,
  ASSERTION_ISSUER,
  assertionPage,
  assertionTarget,
  handoffErrorPage,
  loadHandoffConfig,
  readCookie,
  restartTarget,
  resumeClearCookie,
  resumeCookieName,
  resumeKey,
  resumeSetCookie,
  signAssertion,
  signResume,
  verifyResume,
  verifyTicket,
} from "./oidc-handoff";

type Pair = Awaited<ReturnType<typeof generateKeyPair>>;
let identity: Pair;
let hub: Pair;
let other: Pair;

beforeAll(async () => {
  identity = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  hub = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  other = await generateKeyPair("EdDSA", { crv: "Ed25519" });
});

const NOW = new Date("2026-10-04T10:00:00Z");
const iat = Math.floor(NOW.getTime() / 1000);

function ticket(over: Record<string, unknown> = {}, key = identity.privateKey) {
  return new SignJWT({ iss: "id", aud: "hub", uid: "uid-1", nonce: "n".repeat(22), iat, exp: iat + 120, ...over })
    .setProtectedHeader({ alg: "EdDSA" })
    .sign(key);
}

async function check(t: Promise<string>, now = NOW) {
  return verifyTicket(await t, identity.publicKey, now);
}

async function refusal(t: Promise<string>, now = NOW) {
  const result = await check(t, now);
  return result.ok ? "accepted" : result.code;
}

describe("ticket verifier (#782)", () => {
  it("accepts a valid ticket and returns its uid", async () => {
    expect(await verifyTicket(await ticket(), identity.publicKey, NOW)).toMatchObject({ ok: true, uid: "uid-1" });
  });

  it("refuses the wrong audience", async () => {
    expect(await refusal(ticket({ aud: "id" }))).toBe("wrong_audience");
  });

  it("refuses an expired ticket", async () => {
    expect(await refusal(ticket(), new Date(NOW.getTime() + 121_000))).toBe("expired");
  });

  it("refuses a bad signature (not the identity service's pinned key)", async () => {
    expect(await refusal(ticket({}, other.privateKey))).toBe("bad_signature");
  });

  it("refuses a missing nonce", async () => {
    expect(await refusal(ticket({ nonce: undefined }))).toBe("missing_nonce");
    expect(await refusal(ticket({ nonce: "short" }))).toBe("missing_nonce");
  });

  it("refuses a wrong issuer, a malformed uid and a lifetime over 120 s", async () => {
    expect(await refusal(ticket({ iss: "hub" }))).toBe("invalid");
    expect(await refusal(ticket({ uid: "../x" }))).toBe("invalid");
    expect(await refusal(ticket({ exp: iat + 121 }))).toBe("invalid");
  });
});

const LATE = new Date(NOW.getTime() + 121_000);

describe("expired tickets and the restart uid (#801, spec §4.4)", () => {
  it("an expired ticket with a good signature returns restartUid", async () => {
    expect(await check(ticket(), LATE)).toEqual({ ok: false, code: "expired", restartUid: "uid-1" });
  });

  it("restartUid also works when the audience is an array that includes hub", async () => {
    expect(await check(ticket({ aud: ["hub", "other"] }), LATE)).toMatchObject({ code: "expired", restartUid: "uid-1" });
  });

  it("no restartUid for a bad signature, wrong audience, wrong issuer or a malformed uid, even when expired", async () => {
    for (const t of [ticket({}, other.privateKey), ticket({ aud: "id" }), ticket({ iss: "hub" }), ticket({ uid: "../x" })]) {
      const result = await check(t, LATE);
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("restartUid", expect.any(String));
    }
  });

  it("no restartUid for a failure that is not 'expired'", async () => {
    expect(await check(ticket({ nonce: "short" }))).toEqual({ ok: false, code: "missing_nonce" });
  });
});

describe("resume cookie (#801, spec §4.2)", () => {
  const key = resumeKey({ AUTH_SECRET: "a-test-secret-of-some-length" });
  const otherKey = resumeKey({ AUTH_SECRET: "a-different-test-secret-here" });

  function hs256(claims: Record<string, unknown>, typ = "hub-handoff-resume", k = key) {
    return new SignJWT(claims).setProtectedHeader({ alg: "HS256", typ }).sign(k);
  }

  it("signResume / verifyResume round-trip, valid for 600 s", async () => {
    const token = await signResume("uid-1", key, NOW);
    expect(await verifyResume(token, key, NOW)).toEqual({ uid: "uid-1" });
    const { payload } = await jwtVerify(token, key, { currentDate: NOW });
    expect((payload.exp as number) - (payload.iat as number)).toBe(600);
    expect(await verifyResume(token, key, new Date(NOW.getTime() + 599_000))).toEqual({ uid: "uid-1" });
  });

  it("verifyResume returns null, without throwing, for an expired, tampered, foreign-key, wrong-typ or bad-uid token", async () => {
    const token = await signResume("uid-1", key, NOW);
    const tampered = `${token.slice(0, -3)}${token.endsWith("AAA") ? "BBB" : "AAA"}`;
    const noIat = await new SignJWT({ uid: "uid-1" }).setProtectedHeader({ alg: "HS256", typ: "hub-handoff-resume" }).sign(key);
    const cases: [string, string][] = [
      ["expired", token],
      ["tampered", tampered],
      ["another AUTH_SECRET", await signResume("uid-1", otherKey, NOW)],
      ["wrong typ", await hs256({ uid: "uid-1", iat, exp: iat + 600 }, "JWT")],
      ["bad uid", await hs256({ uid: "../x", iat, exp: iat + 600 })],
      ["lifetime over 600 s", await hs256({ uid: "uid-1", iat, exp: iat + 601 })],
      ["no expiry", noIat],
      ["not a jwt", "not-a-jwt"],
      ["empty", ""],
    ];
    for (const [name, t] of cases) {
      const now = name === "expired" ? new Date(NOW.getTime() + 601_000) : NOW;
      await expect(verifyResume(t, key, now), name).resolves.toBeNull();
    }
  });

  it("derives a different key per AUTH_SECRET, is stable per secret, and fails closed without one", () => {
    expect(resumeKey({ AUTH_SECRET: "a-test-secret-of-some-length" })).toBe(key);
    expect(Buffer.from(key).equals(Buffer.from(otherKey))).toBe(false);
    expect(key).toHaveLength(32);
    expect(() => resumeKey({})).toThrow(/AUTH_SECRET/);
  });

  it("cookie name and attributes: __Host- and Secure in production, plain over local http", () => {
    expect(resumeCookieName(true)).toBe("__Host-hub_handoff");
    expect(resumeCookieName(false)).toBe("hub_handoff");
    expect(resumeSetCookie("v", true)).toBe("__Host-hub_handoff=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure");
    expect(resumeSetCookie("v", false)).toBe("hub_handoff=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=600");
    expect(resumeClearCookie(true)).toContain("Max-Age=0");
    expect(resumeClearCookie(true)).toContain("Path=/");
  });

  it("readCookie finds one cookie among several", () => {
    expect(readCookie("a=1; hub_handoff=tok.en.x; b=2", "hub_handoff")).toBe("tok.en.x");
    expect(readCookie("a=1", "hub_handoff")).toBeUndefined();
    expect(readCookie(null, "hub_handoff")).toBeUndefined();
    expect(readCookie("xhub_handoff=1", "hub_handoff")).toBeUndefined();
  });
});

describe("error page action (#801)", () => {
  it("renders exactly one escaped link, and no form", () => {
    const href = restartTarget("https://id.asafarim.site", "uid-1");
    expect(href).toBe("https://id.asafarim.site/interaction/uid-1");
    const html = handoffErrorPage({ title: "t", message: "m", code: "c", action: { href: `${href}?a=1&b="2"`, label: "Try <again>" } });
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<a href="https://id.asafarim.site/interaction/uid-1?a=1&amp;b=&quot;2&quot;">Try &lt;again&gt;</a>');
    expect(html).not.toContain("<form");
  });

  it("has no link without an action", () => {
    expect(handoffErrorPage({ title: "t", message: "m", code: "c" })).not.toContain("<a ");
  });
});

describe("assertion (#782)", () => {
  it("echoes the uid exactly, has sub, aud=id, iss=hub, exp ≤ 60 s, and a unique jti per call", async () => {
    const a1 = await signAssertion("user-1", "uid-xyz", hub.privateKey, NOW);
    const a2 = await signAssertion("user-1", "uid-xyz", hub.privateKey, NOW);
    const { payload, protectedHeader } = await jwtVerify(a1, hub.publicKey, {
      issuer: ASSERTION_ISSUER,
      audience: ASSERTION_AUDIENCE,
      currentDate: NOW,
    });
    expect(protectedHeader.alg).toBe("EdDSA");
    expect(payload).toMatchObject({ sub: "user-1", uid: "uid-xyz" });
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(60);
    expect(decodeJwt(a1).jti).not.toBe(decodeJwt(a2).jti);
  });

  it("posts to exactly <issuer>/interaction/<uid>/hub, with the assertion in the body only", () => {
    const target = assertionTarget("https://id.asafarim.site", "uid-xyz");
    expect(target).toBe("https://id.asafarim.site/interaction/uid-xyz/hub");
    const html = assertionPage(target, "aaa.bbb.ccc");
    expect(html).toContain(`<form id="handoff" method="post" action="https://id.asafarim.site/interaction/uid-xyz/hub">`);
    expect(html).toContain(`<input type="hidden" name="assertion" value="aaa.bbb.ccc">`);
    expect(html).toContain("<noscript>");
    expect(html).toContain('<button type="submit">Continue</button>');
    expect(html).not.toMatch(/\?assertion=/);
  });
});

describe("hand-off config", () => {
  it("is off when nothing is set, refuses a half or wrong config", async () => {
    expect(await loadHandoffConfig({})).toBeNull();
    await expect(loadHandoffConfig({ IDENTITY_ISSUER_URL: "https://id.asafarim.site" })).rejects.toThrow(/half-configured/);
    const pub = JSON.stringify(await exportJWK(identity.publicKey));
    const priv = JSON.stringify(await exportJWK(hub.privateKey));
    const ok = { HUB_IDENTITY_TICKET_PUBLIC_JWK: pub, HUB_OIDC_ASSERTION_PRIVATE_JWK: priv, IDENTITY_ISSUER_URL: "https://id.asafarim.site/" };
    expect((await loadHandoffConfig(ok))!.identityIssuer).toBe("https://id.asafarim.site");
    await expect(loadHandoffConfig({ ...ok, HUB_IDENTITY_TICKET_PUBLIC_JWK: priv })).rejects.toThrow(/public key only/);
    await expect(loadHandoffConfig({ ...ok, HUB_OIDC_ASSERTION_PRIVATE_JWK: pub })).rejects.toThrow(/private key/);
    await expect(loadHandoffConfig({ ...ok, IDENTITY_ISSUER_URL: "http://id.asafarim.site" })).rejects.toThrow(/https/);
  });
});
