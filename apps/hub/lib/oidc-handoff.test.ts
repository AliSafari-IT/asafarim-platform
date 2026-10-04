import { SignJWT, decodeJwt, exportJWK, generateKeyPair, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ASSERTION_AUDIENCE,
  ASSERTION_ISSUER,
  TicketError,
  assertionPage,
  assertionTarget,
  loadHandoffConfig,
  signAssertion,
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

async function refusal(t: Promise<string>, now = NOW) {
  try {
    await verifyTicket(await t, identity.publicKey, now);
    return "accepted";
  } catch (err) {
    expect(err).toBeInstanceOf(TicketError);
    return (err as TicketError).code;
  }
}

describe("ticket verifier (#782)", () => {
  it("accepts a valid ticket and returns its uid", async () => {
    expect(await verifyTicket(await ticket(), identity.publicKey, NOW)).toMatchObject({ uid: "uid-1" });
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
