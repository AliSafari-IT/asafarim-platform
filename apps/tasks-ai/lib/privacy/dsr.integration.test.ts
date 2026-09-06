import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("privacy + admin (integration)", () => {
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

  it("DSR delete removes the subject's data, redacts comments, and verifies zero residual", async () => {
    const { createDsr, processDsr } = await import("./dsr");
    const { createProject } = await import("../services/projects");
    const { createTask } = await import("../services/tasks");
    const { addComment } = await import("../services/comments");
    const a = await ws("dsr");
    const subject = await db.membership.create({ data: { workspaceId: a.w.id, platformUserId: "subject-1", role: "member" } });
    const subjectCtx: RequestContext = { ...a.ctx, actor: { membershipId: subject.id, platformUserId: "subject-1", role: "member" } };

    const proj = await createProject(a.ctx, { name: "P", key: "DSR" });
    const task = await createTask(a.ctx, { projectId: proj.id, title: "t" });
    await addComment(subjectCtx, task.id, { body: "sensitive note from the subject" });
    await db.timeEntry.create({ data: { workspaceId: a.w.id, taskId: task.id, membershipId: subject.id, minutes: 30, spentOn: new Date() } });
    await db.searchHistory.create({ data: { workspaceId: a.w.id, membershipId: subject.id, query: "private search" } });

    const dsr = await createDsr(a.ctx, { subjectUserId: "subject-1", kind: "delete" });
    const done = await processDsr(a.ctx, dsr.id);
    expect(done.state).toBe("completed");

    const v = done.verification as { residualNonComment: unknown[]; afterCounts: Record<string, number> };
    expect(v.residualNonComment).toHaveLength(0);
    expect(v.afterCounts.timeEntries).toBe(0);
    expect(v.afterCounts.searches).toBe(0);

    const comment = await db.comment.findFirst({ where: { authorId: subject.id } });
    expect(comment?.body).toMatch(/removed at the author's request/);
    expect((await db.membership.findUnique({ where: { id: subject.id } }))?.archivedAt).toBeTruthy();
  });

  it("DSR export builds a bundle with the subject's own rows only", async () => {
    const { createDsr, processDsr } = await import("./dsr");
    const a = await ws("dsrx");
    const subject = await db.membership.create({ data: { workspaceId: a.w.id, platformUserId: "s2", role: "member" } });
    await db.searchHistory.create({ data: { workspaceId: a.w.id, membershipId: subject.id, query: "q" } });

    const dsr = await createDsr(a.ctx, { subjectUserId: "s2", kind: "export" });
    const done = await processDsr(a.ctx, dsr.id);
    const m = done.manifest as { export: { searchHistory: unknown[] } };
    expect(done.state).toBe("completed");
    expect(m.export.searchHistory).toHaveLength(1);
  });

  it("audit search filters by name + revoking a member revokes their API tokens", async () => {
    const { searchAudit, revokeMemberAccess } = await import("../admin/service");
    const { createToken } = await import("../tokens/service");
    const a = await ws("adm");
    const member = await db.membership.create({ data: { workspaceId: a.w.id, platformUserId: "mm", role: "member" } });
    const memberCtx: RequestContext = { ...a.ctx, actor: { membershipId: member.id, platformUserId: "mm", role: "admin" } };
    const tok = await createToken(memberCtx, { name: "t", scopes: ["tasks:read"] });

    await revokeMemberAccess(a.ctx, member.id);
    expect((await db.apiToken.findUnique({ where: { id: tok.id } }))?.revokedAt).toBeTruthy();
    expect((await db.membership.findUnique({ where: { id: member.id } }))?.archivedAt).toBeTruthy();

    const audit = await searchAudit(a.ctx, { name: "member.access_revoked" });
    expect(audit.items.length).toBeGreaterThan(0);
  });

  it("rate limiter allows up to max then 429s within the window", async () => {
    const { consume } = await import("../security/ratelimit");
    const key = `test:${Date.now()}`;
    for (let i = 0; i < 3; i++) await consume(db, { key, max: 3, windowSec: 60 });
    await expect(consume(db, { key, max: 3, windowSec: 60 })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("break-glass grant self-expires and is not returned once past expiry", async () => {
    const { grantBreakGlass, activeBreakGlass } = await import("../admin/service");
    const a = await ws("bg");
    const g = await grantBreakGlass(a.ctx, { grantedTo: "support-1", reason: "incident 42 triage", minutes: 15 });
    expect((await activeBreakGlass(a.ctx)).some((x) => x.id === g.id)).toBe(true);
    await db.breakGlassGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await activeBreakGlass(a.ctx)).some((x) => x.id === g.id)).toBe(false);
  });
});
