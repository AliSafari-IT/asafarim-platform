import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import { RUN_TITLE_PREFIX, WORKSPACES } from "./plan";
import { cleanupTestData, pruneRunData, setupTestData, verifyTestData, type IdentityMap } from "./provision";

vi.mock("../session", () => ({ getViewer: vi.fn(async () => ({ id: "noop" })) }));

/**
 * #742 slice 2b on a throwaway TasksAI database that ALSO holds ordinary
 * (non-synthetic) data: setup → setup (no-op) → reset → prune-runs → cleanup,
 * and the ordinary data is byte-for-byte untouched throughout.
 */
const IDS: IdentityMap = {
  owner: "seed-tasksai-test-owner",
  admin: "seed-tasksai-test-admin",
  member: "seed-tasksai-test-member",
  member2: "seed-tasksai-test-member2",
  guest: "seed-tasksai-test-guest",
  outsider: "seed-tasksai-test-outsider",
};

describe.skipIf(!hasTestDatabase())("test-data lifecycle (integration)", () => {
  let db: PrismaClient;
  const real = `real-ws-${Date.now()}`;

  /** A fingerprint of every non-synthetic row we care about. */
  async function ordinary() {
    const ws = await db.workspace.findMany({ where: { NOT: { slug: { startsWith: "tasksai-synthetic-" } } }, orderBy: { id: "asc" } });
    const ids = ws.map((w) => w.id);
    const [memberships, projects, tasks, activity] = await Promise.all([
      db.membership.count({ where: { workspaceId: { in: ids } } }),
      db.project.count({ where: { workspaceId: { in: ids } } }),
      db.task.findMany({ where: { workspaceId: { in: ids } }, select: { id: true, title: true, updatedAt: true }, orderBy: { id: "asc" } }),
      db.activityEvent.count({ where: { workspaceId: { in: ids } } }),
    ]);
    return JSON.stringify({ ws: ws.map((w) => [w.id, w.slug, w.updatedAt]), memberships, projects, tasks, activity });
  }

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    await cleanupTestData(db);
    // Ordinary user data the lifecycle must never touch — including a run-prefixed
    // title OUTSIDE the synthetic workspaces.
    const w = await db.workspace.create({ data: { name: "Real", slug: real } });
    const m = await db.membership.create({ data: { workspaceId: w.id, platformUserId: "real-user", role: "owner" } });
    const p = await db.project.create({ data: { workspaceId: w.id, name: "Real project", key: "REAL" } });
    await db.task.create({ data: { workspaceId: w.id, projectId: p.id, title: "Real task", creatorId: m.id } });
    await db.task.create({ data: { workspaceId: w.id, projectId: p.id, title: `${RUN_TITLE_PREFIX}x] looks like run data`, creatorId: m.id } });
  }, 120_000);
  afterAll(async () => {
    await cleanupTestData(db);
    await db?.workspace.deleteMany({ where: { slug: real } });
    await db?.$disconnect();
  });

  it("setup creates everything verify expects; a second setup is a no-op; cleanup leaves ordinary data untouched", async () => {
    const before = await ordinary();

    const first = await setupTestData(db, { mode: "full", identities: IDS, anchor: new Date("2026-10-03T08:00:00Z") });
    expect(Object.values(first.workspaces).every((w) => w.created)).toBe(true);
    expect((await verifyTestData(db, "full")).ok).toBe(true);
    const main = await db.workspace.findUniqueOrThrow({ where: { slug: WORKSPACES.main }, include: { _count: { select: { tasks: true, memberships: true } } } });
    expect(main._count.memberships).toBe(5);
    const counts = async () => JSON.stringify(await Promise.all([db.task.count(), db.membership.count(), db.taskCheck.count(), db.taskRelation.count(), db.activityEvent.count()]));
    const afterFirst = await counts();

    const second = await setupTestData(db, { mode: "full", identities: IDS });
    expect(Object.values(second.workspaces).some((w) => w.created)).toBe(false);
    expect(await counts()).toBe(afterFirst);

    // reset = cleanup + setup: rebuilt, same shape.
    await cleanupTestData(db);
    await setupTestData(db, { mode: "full", identities: IDS });
    expect((await verifyTestData(db, "full")).ok).toBe(true);

    // prune-runs: removes run data in synthetic workspaces only.
    const ws = await db.workspace.findUniqueOrThrow({ where: { slug: WORKSPACES.main }, include: { memberships: true, projects: true } });
    await db.task.create({
      data: { workspaceId: ws.id, projectId: ws.projects[0]!.id, title: `${RUN_TITLE_PREFIX}run-1] created by a run`, creatorId: ws.memberships[0]!.id },
    });
    expect(await pruneRunData(db, { runId: "run-1" })).toMatchObject({ tasks: 1 });
    expect((await verifyTestData(db, "full")).ok).toBe(true);

    const removed = await cleanupTestData(db);
    expect(removed.workspaces.sort()).toEqual(Object.values(WORKSPACES).sort());
    expect(await db.workspace.count({ where: { slug: { startsWith: "tasksai-synthetic-" } } })).toBe(0);
    expect(await db.membership.count({ where: { platformUserId: { startsWith: "seed-tasksai-test-" } } })).toBe(0);
    expect(await ordinary()).toBe(before);
  });

  it("production-baseline mode builds the main workspace only, with the member only", async () => {
    await setupTestData(db, { mode: "production-baseline", identities: { member: IDS.member } });
    const workspaces = await db.workspace.findMany({ where: { slug: { startsWith: "tasksai-synthetic-" } }, include: { memberships: true } });
    expect(workspaces.map((w) => w.slug)).toEqual([WORKSPACES.main]);
    expect(workspaces[0]!.memberships.map((m) => [m.platformUserId, m.role])).toEqual([[IDS.member, "member"]]);
    expect((await verifyTestData(db, "production-baseline")).ok).toBe(true);
    await cleanupTestData(db);
  });
});
