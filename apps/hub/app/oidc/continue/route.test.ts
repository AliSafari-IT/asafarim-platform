import { SignJWT, decodeJwt, exportJWK, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/auth", () => ({ auth: vi.fn() }));
vi.mock("@asafarim/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { GET } from "./route";

let identity: Awaited<ReturnType<typeof generateKeyPair>>;

beforeAll(async () => {
  identity = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const hub = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  process.env.HUB_IDENTITY_TICKET_PUBLIC_JWK = JSON.stringify(await exportJWK(identity.publicKey));
  process.env.HUB_OIDC_ASSERTION_PRIVATE_JWK = JSON.stringify(await exportJWK(hub.privateKey));
  process.env.IDENTITY_ISSUER_URL = "https://id.asafarim.site";
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

  it("without a session → Hub's sign-in with a return path back here", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const t = await ticket();
    const res = await GET(request(t));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/sign-in");
    expect(to.searchParams.get("callbackUrl")).toBe(`/oidc/continue?ticket=${encodeURIComponent(t)}`);
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
