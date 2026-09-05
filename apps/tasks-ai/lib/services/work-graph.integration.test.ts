import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

// getViewer is only used by the workspace service; the project/task
// services take ctx directly. Hoisted by vitest regardless of placement.
vi.mock("../session", () => ({ getViewer: vi.fn() }));

/**
 * The M02 exit tests: two tenants cannot see or mutate each other; retries
 * with an Idempotency-Key do not duplicate; a stale write is a 409; and
 * the audit/outbox rows reconcile with the domain changes.
 *
 * Skipped unless TASKSAI_TEST_DATABASE_URL points at a throwaway database.
 */
describe.skipIf(!hasTestDatabase())("work graph (integration)", () => {
  let db: PrismaClient;
  let url: string;

  beforeAll(async () => {
    url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    // getViewer is only used by the workspace service; the project/task
    // services take ctx directly.
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  async function freshWorkspace(slug: string, platformUserId: string) {
    const ws = await db.workspace.create({ data: { name: slug, slug: `${slug}-${Date.now()}` } });
    const member = await db.membership.create({
      data: { workspaceId: ws.id, platformUserId, role: "owner" },
    });
    const ctx: RequestContext = {
      db,
      workspaceId: ws.id,
      workspaceSlug: ws.slug,
      actor: { membershipId: member.id, platformUserId, role: "owner" },
      correlationId: `cid-${slug}-${Date.now()}`,
    };
    return { ws, ctx };
  }

  it("isolates two tenants: neither can read the other's project", async () => {
    const { createProject } = await import("./projects");
    const { getProject } = await import("../repositories/projects");

    const a = await freshWorkspace("tenant-a", "user-a");
    const b = await freshWorkspace("tenant-b", "user-b");

    const projA = await createProject(a.ctx, { name: "A only", key: "AAA" });

    expect(await getProject(b.ctx, projA.id)).toBeNull();
    expect(await getProject(a.ctx, projA.id)).not.toBeNull();
  });

  it("a cross-tenant task create is rejected as not_found on the project", async () => {
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");

    const a = await freshWorkspace("tenant-c", "user-c");
    const b = await freshWorkspace("tenant-d", "user-d");
    const projA = await createProject(a.ctx, { name: "C proj", key: "CCC" });

    await expect(createTask(b.ctx, { projectId: projA.id, title: "sneak" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("optimistic concurrency: a stale update is a 409", async () => {
    const { createProject, updateProject } = await import("./projects");
    const { assertVersion } = await import("../api/http");

    const a = await freshWorkspace("tenant-e", "user-e");
    const proj = await createProject(a.ctx, { name: "v", key: "VVV" });
    const afterFirst = await updateProject(a.ctx, proj.id, { name: "v2" });

    expect(afterFirst.version).toBe(proj.version + 1);
    expect(() =>
      assertVersion(new Request("https://x/x", { headers: { "if-match": `"${proj.version}"` } }), afterFirst.version),
    ).toThrow();
  });

  it("idempotency: the same key + body replays, a different body is a 409", async () => {
    const { checkIdempotency } = await import("../api/idempotency");
    const a = await freshWorkspace("tenant-g", "user-g");

    const first = await checkIdempotency(a.ctx, "key-1", "POST", "/p", { title: "x" });
    expect(first.replay).toBeUndefined();
    await first.commit!(201, { data: { id: "t1" } });

    const replay = await checkIdempotency(a.ctx, "key-1", "POST", "/p", { title: "x" });
    expect(replay.replay).toMatchObject({ responseCode: 201 });

    await expect(
      checkIdempotency(a.ctx, "key-1", "POST", "/p", { title: "different" }),
    ).rejects.toMatchObject({ code: "idempotency_mismatch" });
  });

  it("audit/outbox reconcile: one task create yields the expected event rows", async () => {
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");

    const a = await freshWorkspace("tenant-f", "user-f");
    const proj = await createProject(a.ctx, { name: "F", key: "FFF" });
    const task = await createTask(a.ctx, { projectId: proj.id, title: "reconcile me" });

    const activity = await db.activityEvent.findMany({
      where: { workspaceId: a.ws.id, targetId: task.id },
    });
    const outbox = await db.outboxEvent.findMany({
      where: { workspaceId: a.ws.id, payload: { path: ["taskId"], equals: task.id } },
    });

    expect(activity.map((e) => e.name)).toContain("task.created");
    // one activity.fanout + one search.index for the create
    expect(outbox.length).toBeGreaterThanOrEqual(1);
  });
});
