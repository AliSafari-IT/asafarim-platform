import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_APPLICATION_LIST_QUERY, type ApplicationListQuery } from "./listQuery";

/**
 * The paginated tracker list (issue #897) against a real database: stable
 * pages over equal timestamps and dates, workspace-scoped rows and counts,
 * search on title/employer only, due filters against the client's day,
 * null follow-up placement, and an edit moving a row out of a filter.
 * Guarded behind `RESUMATCH_TEST_DATABASE_URL`.
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run --config vitest.integration.config.ts lib/applications/list.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

const SAME_INSTANT = new Date("2026-11-01T10:00:00Z");
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const q = (change: Partial<ApplicationListQuery>): ApplicationListQuery => ({ ...DEFAULT_APPLICATION_LIST_QUERY, ...change });

describe.skipIf(!TEST_DB)("listApplicationPage", () => {
  let db: import("../db/generated").PrismaClient;
  let service: typeof import("./service");
  const workspaceIds: string[] = [];

  async function workspace() {
    const ws = await db.workspace.create({
      data: { platformUserId: `applications-list-test-${Date.now()}-${Math.random()}` },
      select: { id: true },
    });
    workspaceIds.push(ws.id);
    return ws.id;
  }

  async function job(workspaceId: string, title: string | null, employer: string | null) {
    return db.targetJob.create({
      data: { workspaceId, sourceUrl: "https://example.test/jobs/1", title, employer, status: "FETCHED" },
      select: { id: true },
    });
  }

  /** Many rows sharing one createdAt, half of them one follow-up day. */
  async function seedMany(workspaceId: string, count: number) {
    const target = await job(workspaceId, "Platform Engineer", "Acme");
    await db.application.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        workspaceId,
        targetJobId: target.id,
        createdAt: SAME_INSTANT,
        followUpDate: i % 2 === 0 ? day("2026-12-01") : null,
        notes: `note ${i}`,
      })),
    });
  }

  async function allPages(workspaceId: string, query: ApplicationListQuery) {
    const ids: string[] = [];
    for (let page = 1; ; page++) {
      const result = await service.listApplicationPage(workspaceId, { ...query, page });
      ids.push(...result.applications.map((a) => a.id));
      if (page >= result.pageCount) return { ids, total: result.total };
    }
  }

  beforeAll(async () => {
    service = await import("./service");
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || workspaceIds.length === 0) return;
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  it("pages hundreds of rows with equal timestamps and dates without duplicates or omissions", async () => {
    const ws = await workspace();
    await seedMany(ws, 301);
    const expected = (await db.application.findMany({ where: { workspaceId: ws }, select: { id: true } })).map((a) => a.id);

    for (const sort of ["newest", "followUp"] as const) {
      const { ids, total } = await allPages(ws, q({ sort, pageSize: 7 }));
      expect(total).toBe(301);
      expect(ids).toHaveLength(301);
      expect(new Set(ids).size).toBe(301);
      expect([...ids].sort()).toEqual([...expected].sort());
      // And the same order on a second walk.
      expect((await allPages(ws, q({ sort, pageSize: 7 }))).ids).toEqual(ids);
    }

    const first = await service.listApplicationPage(ws, DEFAULT_APPLICATION_LIST_QUERY);
    expect(first.applications).toHaveLength(20);
    expect(first.pageCount).toBe(16);
  });

  it("puts applications without a follow-up date last when sorting by next follow-up", async () => {
    const ws = await workspace();
    await seedMany(ws, 10);
    const { ids } = await allPages(ws, q({ sort: "followUp", pageSize: 3 }));
    const rows = await db.application.findMany({ where: { id: { in: ids } }, select: { id: true, followUpDate: true } });
    const dated = new Map(rows.map((r) => [r.id, r.followUpDate !== null]));
    expect(ids.map((id) => dated.get(id))).toEqual([...Array(5).fill(true), ...Array(5).fill(false)]);
  });

  it("never returns or counts another workspace's rows", async () => {
    const mine = await workspace();
    const theirs = await workspace();
    await seedMany(mine, 3);
    await seedMany(theirs, 5);
    const result = await service.listApplicationPage(mine, q({ q: "acme" }));
    expect(result.total).toBe(3);
    expect(result.workspaceTotal).toBe(3);
    const owners = await db.application.findMany({
      where: { id: { in: result.applications.map((a) => a.id) } },
      select: { workspaceId: true },
    });
    expect(owners.every((o) => o.workspaceId === mine)).toBe(true);
  });

  it("searches title and employer case-insensitively, literally, and never notes", async () => {
    const ws = await workspace();
    const a = await job(ws, "Senior Frontend Developer", "Globex");
    const b = await job(ws, "Data Analyst", "Initech 100% Remote");
    const c = await job(ws, null, null);
    await db.application.createMany({
      data: [
        { workspaceId: ws, targetJobId: a.id, notes: "Initech referral" },
        { workspaceId: ws, targetJobId: b.id },
        { workspaceId: ws, targetJobId: c.id, notes: "frontend globex" },
      ],
    });
    const titles = async (text: string) =>
      (await service.listApplicationPage(ws, q({ q: text }))).applications.map((x) => x.targetJob.title);

    expect(await titles("FRONTEND")).toEqual(["Senior Frontend Developer"]);
    expect(await titles("globex")).toEqual(["Senior Frontend Developer"]);
    expect(await titles("initech")).toEqual(["Data Analyst"]);
    expect(await titles("100%")).toEqual(["Data Analyst"]);
    expect(await titles("%")).toEqual(["Data Analyst"]);
    expect(await titles("_")).toEqual([]);
    expect(await titles("\\\\")).toEqual([]);
    expect(await titles("referral")).toEqual([]);
  });

  it("filters due days against the client's today, skipping closed and undated applications", async () => {
    const ws = await workspace();
    const target = await job(ws, "Role", "Co");
    const rows = [
      { key: "overdue", followUpDate: day("2026-11-18"), status: "APPLIED" as const },
      { key: "today", followUpDate: day("2026-11-19"), status: "SAVED" as const },
      // A legacy timestamp row, read as its UTC day (followUp.ts).
      { key: "todayLegacy", followUpDate: new Date("2026-11-19T17:45:00Z"), status: "INTERVIEWING" as const },
      { key: "upcoming", followUpDate: day("2026-11-20"), status: "APPLIED" as const },
      { key: "closedOverdue", followUpDate: day("2026-11-01"), status: "REJECTED" as const },
      { key: "closedToday", followUpDate: day("2026-11-19"), status: "OFFER" as const },
      { key: "undated", followUpDate: null, status: "APPLIED" as const },
    ];
    const ids = new Map<string, string>();
    for (const row of rows) {
      const created = await db.application.create({
        data: { workspaceId: ws, targetJobId: target.id, status: row.status, followUpDate: row.followUpDate },
      });
      ids.set(created.id, row.key);
    }
    const keys = async (query: ApplicationListQuery) =>
      (await service.listApplicationPage(ws, query)).applications.map((a) => ids.get(a.id)).sort();

    expect(await keys(q({ due: "overdue", today: "2026-11-19" }))).toEqual(["overdue"]);
    expect(await keys(q({ due: "today", today: "2026-11-19" }))).toEqual(["today", "todayLegacy"]);
    expect(await keys(q({ due: "upcoming", today: "2026-11-19" }))).toEqual(["upcoming"]);
    // Another client's day moves the boundaries, not the server's clock.
    expect(await keys(q({ due: "today", today: "2026-11-20" }))).toEqual(["upcoming"]);
    expect(await keys(q({ due: "overdue", today: "2026-11-20" }))).toEqual(["overdue", "today", "todayLegacy"]);
    // Combined with a status.
    expect(await keys(q({ due: "today", today: "2026-11-19", status: "SAVED" }))).toEqual(["today"]);
    expect(await keys(q({ due: "today", today: "2026-11-19", status: "OFFER" }))).toEqual([]);
  });

  it("drops a row edited out of the filter from both the results and the count", async () => {
    const ws = await workspace();
    await seedMany(ws, 21);
    const applied = q({ status: "SAVED", pageSize: 20 });
    let result = await service.listApplicationPage(ws, { ...applied, page: 2 }, { clampPage: true });
    expect(result).toMatchObject({ total: 21, page: 2, pageCount: 2 });
    const lastRow = result.applications[0];

    await service.updateApplication(ws, lastRow.id, { status: "APPLIED" });

    // The page that held the moved row no longer exists: the page view
    // clamps to the last page, the API returns an empty page.
    result = await service.listApplicationPage(ws, { ...applied, page: 2 }, { clampPage: true });
    expect(result).toMatchObject({ total: 20, workspaceTotal: 21, page: 1, pageCount: 1 });
    expect(result.applications.map((a) => a.id)).not.toContain(lastRow.id);
    const api = await service.listApplicationPage(ws, { ...applied, page: 2 });
    expect(api).toMatchObject({ total: 20, page: 2, applications: [] });
  });
});
