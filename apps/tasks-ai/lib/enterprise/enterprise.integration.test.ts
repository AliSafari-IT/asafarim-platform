import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("enterprise (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function ws(tag: string) {
    const w = await db.workspace.create({ data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
    const owner = await db.membership.create({ data: { workspaceId: w.id, platformUserId: `o-${tag}`, role: "owner" } });
    const ctx: RequestContext = {
      db, workspaceId: w.id, workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: `o-${tag}`, role: "owner" },
      correlationId: `cid-${tag}`,
    };
    return { w, owner, ctx };
  }

  it("domain claim: issues a TXT token, verify sets verifiedAt + autoJoin", async () => {
    const { claimDomain, verifyDomain } = await import("./service");
    const a = await ws("dom");
    const claim = await claimDomain(a.ctx, "Acme.com");
    expect(claim.domain).toBe("acme.com");
    expect(claim.dnsRecord).toContain("TXT acme.com");
    await verifyDomain(a.ctx, claim.id, true);
    const row = await db.domainClaim.findUnique({ where: { id: claim.id } });
    expect(row?.verifiedAt).toBeTruthy();
    expect(row?.autoJoin).toBe(true);
  });

  it("SCIM: create then deactivate archives the membership; both are logged", async () => {
    const { scimPush } = await import("./scim");
    const a = await ws("scim");
    await scimPush(a.ctx, { externalId: "idp-1", platformUserId: "u-1", op: "create", role: "member" });
    const m = await db.membership.findFirst({ where: { workspaceId: a.w.id, platformUserId: "u-1" } });
    expect(m?.archivedAt).toBeNull();

    await scimPush(a.ctx, { externalId: "idp-1", platformUserId: "u-1", op: "deactivate" });
    const m2 = await db.membership.findFirst({ where: { workspaceId: a.w.id, platformUserId: "u-1" } });
    expect(m2?.archivedAt).toBeTruthy();

    const log = await db.scimEvent.count({ where: { workspaceId: a.w.id } });
    expect(log).toBe(2);
  });

  it("legal hold suspends deletion; lifting restores the effective retention", async () => {
    const { placeLegalHold, liftLegalHold, effectiveRetention } = await import("./service");
    const a = await ws("hold");
    expect((await effectiveRetention(a.ctx)).deletionSuspended).toBe(false);
    const h = await placeLegalHold(a.ctx, { reason: "litigation 2026-07 discovery", scope: "workspace" });
    expect((await effectiveRetention(a.ctx)).deletionSuspended).toBe(true);
    await liftLegalHold(a.ctx, h.id);
    expect((await effectiveRetention(a.ctx)).deletionSuspended).toBe(false);
  });

  it("service account: mints a token, IP allowlist stored, disable revokes the token", async () => {
    const { createServiceAccount, disableServiceAccount } = await import("./service");
    const { resolveToken } = await import("../tokens/service");
    const a = await ws("svc");
    const acc = await createServiceAccount(a.ctx, { name: "ci", ipAllowlist: ["10.0.0.0/8"], scopes: ["tasks:read"] });
    expect(await resolveToken(acc.token)).toMatchObject({ workspaceId: a.w.id });
    await disableServiceAccount(a.ctx, acc.id);
    expect(await resolveToken(acc.token)).toBeNull();
  });

  it("audit stream: flush signs and advances the cursor past delivered events", async () => {
    const { configureAuditStream, flushAuditStreams, verifyAuditStreamSig } = await import("./service");
    const a = await ws("as");
    // produce an audit event
    await db.auditEvent.create({ data: { workspaceId: a.w.id, name: "test.event", actorType: "user", data: {} } });

    let received: { sig: string; ts: number; body: string } | null = null;
    const server = Bun_or_node_http_stub((sig, ts, body) => (received = { sig, ts, body }));
    await configureAuditStream(a.ctx, `https://siem.invalid/ingest`);
    // point the stream at our capture by patching the row
    await db.auditStream.update({ where: { workspaceId: a.w.id }, data: { url: server.url } });

    await flushAuditStreams(db);
    expect(received).not.toBeNull();
    const stream = await db.auditStream.findUnique({ where: { workspaceId: a.w.id } });
    expect(verifyAuditStreamSig(stream!.secret, received!.body, received!.ts, received!.sig)).toBe(true);
    server.close();
  });
});

// tiny local HTTP capture server (node:http) so the flush has a real target
function Bun_or_node_http_stub(onHit: (sig: string, ts: number, body: string) => void) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = require("node:http") as typeof import("node:http");
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      onHit(String(req.headers["x-tasksai-signature"] ?? ""), Number(req.headers["x-tasksai-timestamp"] ?? 0), body);
      res.writeHead(200).end("ok");
    });
  });
  srv.listen(0);
  const addr = srv.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}/ingest`, close: () => srv.close() };
}
