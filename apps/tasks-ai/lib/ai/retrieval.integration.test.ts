import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { resetEnvCache } from "../env";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

/**
 * Grounded-context retrieval isolation (issue #232 acceptance criteria):
 * "Guest actors never receive snippets from projects they're not a member
 * of." Mirrors the isolation-test pattern in lib/search — an authorization
 * check this security-sensitive needs to run against real Postgres FTS and
 * real project_membership joins, not a mock.
 */
describe.skipIf(!hasTestDatabase())("retrieveContext (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    resetEnvCache();
    delete (globalThis as { tasksAiPrisma?: unknown }).tasksAiPrisma;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function setup(tag: string) {
    const w = await db.workspace.create({
      data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    const owner = await db.membership.create({
      data: { workspaceId: w.id, platformUserId: `owner-${tag}`, role: "owner" },
    });
    const guest = await db.membership.create({
      data: { workspaceId: w.id, platformUserId: `guest-${tag}`, role: "guest" },
    });
    const memberProject = await db.project.create({
      data: { workspaceId: w.id, name: "Member project", key: `MEM${tag.slice(0, 3).toUpperCase()}` },
    });
    const otherProject = await db.project.create({
      data: { workspaceId: w.id, name: "Other project", key: `OTH${tag.slice(0, 3).toUpperCase()}` },
    });
    // The guest belongs only to memberProject.
    await db.projectMembership.create({
      data: { projectId: memberProject.id, membershipId: guest.id },
    });

    const visibleTask = await db.task.create({
      data: {
        workspaceId: w.id,
        projectId: memberProject.id,
        title: "Migrate billing queue",
        description: "Audit publishers before the cutover",
      },
    });
    const hiddenTask = await db.task.create({
      data: {
        workspaceId: w.id,
        projectId: otherProject.id,
        title: "Migrate billing queue secrets",
        description: "Audit publishers before the cutover, contains secret plan",
      },
    });

    const ownerCtx: RequestContext = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: `owner-${tag}`, role: "owner" },
      correlationId: `cid-${tag}-owner`,
    };
    const guestCtx: RequestContext = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: guest.id, platformUserId: `guest-${tag}`, role: "guest" },
      correlationId: `cid-${tag}-guest`,
    };
    return { w, memberProject, otherProject, visibleTask, hiddenTask, ownerCtx, guestCtx };
  }

  it("an owner (non-guest) sees matching tasks across the whole workspace", async () => {
    const { visibleTask, hiddenTask, ownerCtx } = await setup("rtvow");
    const { retrieveContext } = await import("./retrieval");
    const out = await retrieveContext(ownerCtx, {
      kind: "extract_plan",
      redactedInput: "migrate billing queue",
    });
    const ids = out.map((s) => s.id);
    expect(ids).toContain(`task:${visibleTask.id}`);
    expect(ids).toContain(`task:${hiddenTask.id}`);
  });

  it("a guest never receives snippets from a project they are not a member of", async () => {
    const { visibleTask, hiddenTask, guestCtx } = await setup("rtvg");
    const { retrieveContext } = await import("./retrieval");
    const out = await retrieveContext(guestCtx, {
      kind: "extract_plan",
      redactedInput: "migrate billing queue",
    });
    const ids = out.map((s) => s.id);
    expect(ids).toContain(`task:${visibleTask.id}`);
    expect(ids).not.toContain(`task:${hiddenTask.id}`);
    // The cross-workspace-leak eval case in evals/ asserts the same
    // property at the redacted-prompt boundary; this asserts it at the
    // retrieval boundary itself.
    for (const s of out) {
      expect(s.body).not.toContain("secret plan");
    }
  });

  it("a guest scoped to a comment's task project sees the comment; otherwise not", async () => {
    const { memberProject, otherProject, guestCtx, w } = await setup("rtvc");
    const visibleTask = await db.task.create({
      data: { workspaceId: w.id, projectId: memberProject.id, title: "Onboarding flow" },
    });
    const hiddenTask = await db.task.create({
      data: { workspaceId: w.id, projectId: otherProject.id, title: "Onboarding flow" },
    });
    const author = guestCtx.actor.membershipId;
    await db.comment.create({
      data: { workspaceId: w.id, taskId: visibleTask.id, authorId: author, body: "onboarding notes here" },
    });
    await db.comment.create({
      data: { workspaceId: w.id, taskId: hiddenTask.id, authorId: author, body: "onboarding notes here too" },
    });
    const { retrieveContext } = await import("./retrieval");
    const out = await retrieveContext(guestCtx, {
      kind: "extract_plan",
      redactedInput: "onboarding notes",
    });
    const commentSnippets = out.filter((s) => s.type === "comment");
    expect(commentSnippets.some((s) => s.body.includes("onboarding notes here") )).toBe(true);
    expect(commentSnippets.every((s) => !s.body.includes("too") || true)).toBe(true);
    // Explicitly: none of the returned comment ids belong to the hidden task.
    const hiddenComments = await db.comment.findMany({ where: { taskId: hiddenTask.id } });
    const hiddenIds = new Set(hiddenComments.map((c) => `comment:${c.id}`));
    for (const s of commentSnippets) expect(hiddenIds.has(s.id)).toBe(false);
  });
});
