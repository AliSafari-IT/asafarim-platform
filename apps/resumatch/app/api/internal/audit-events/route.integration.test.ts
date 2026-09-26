import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ResuMatch audit-event feed for the admin console. Calls the route handler
 * directly against a real database, guarded behind
 * RESUMATCH_TEST_DATABASE_URL like the rest of this app's
 * *.integration.test.ts files.
 *
 *   INTERNAL_API_SECRET=test-secret RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run app/api/internal/audit-events/route.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;
if (TEST_DB && !process.env.INTERNAL_API_SECRET) {
  process.env.INTERNAL_API_SECRET = "audit-events-test-secret";
}

describe.skipIf(!TEST_DB)("GET /api/internal/audit-events", () => {
  let db: import("../../../../lib/db/generated").PrismaClient;
  let GET: typeof import("./route").GET;
  let workspaceId: string;

  beforeAll(async () => {
    ({ GET } = await import("./route"));
    db = (await import("../../../../lib/db/client")).getJobmatchDb();

    const ws = await db.workspace.create({
      data: { platformUserId: `audit-events-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    // Explicit, distinct timestamps: createMany stamps every row with the
    // same now(), which leaves "newest first" undefined.
    const base = Date.now();
    await db.auditEvent.createMany({
      data: [
        { workspaceId, action: "document.uploaded", metadata: { count: 1024 }, createdAt: new Date(base - 2000) },
        {
          workspaceId,
          action: "document.quarantined",
          metadata: { reasonCode: "SCANNER_UNAVAILABLE" },
          createdAt: new Date(base - 1000),
        },
        { workspaceId, action: "profile.confirmed", metadata: {}, createdAt: new Date(base) },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.auditEvent.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("404s without a valid bearer token", async () => {
    const res = await GET(new Request(`http://localhost/api/internal/audit-events?workspaceId=${workspaceId}`));
    expect(res.status).toBe(404);
  });

  it("lists events for a workspace, newest first", async () => {
    const res = await GET(
      new Request(`http://localhost/api/internal/audit-events?workspaceId=${workspaceId}`, {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.events).toHaveLength(3);
    expect(body.events[0].action).toBe("profile.confirmed");
    expect(body.events[2].action).toBe("document.uploaded");
    expect(body.nextCursor).toBeNull();
  });

  it("returns the distinct set of actions for the filter dropdown", async () => {
    const res = await GET(
      new Request(`http://localhost/api/internal/audit-events?workspaceId=${workspaceId}`, {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    const body = await res.json();
    expect(body.actions).toEqual(
      expect.arrayContaining(["document.uploaded", "document.quarantined", "profile.confirmed"]),
    );
  });

  it("filters by action", async () => {
    const res = await GET(
      new Request(`http://localhost/api/internal/audit-events?workspaceId=${workspaceId}&action=document.quarantined`, {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].action).toBe("document.quarantined");
  });

  it("paginates with a cursor when more rows exist than the limit", async () => {
    const res = await GET(
      new Request(`http://localhost/api/internal/audit-events?workspaceId=${workspaceId}&limit=2`, {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    const body = await res.json();
    expect(body.events).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();

    const nextRes = await GET(
      new Request(
        `http://localhost/api/internal/audit-events?workspaceId=${workspaceId}&limit=2&cursor=${body.nextCursor}`,
        { headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` } },
      ),
    );
    const nextBody = await nextRes.json();
    expect(nextBody.events).toHaveLength(1);
    expect(nextBody.nextCursor).toBeNull();
  });

  it("pages through rows sharing a createdAt without repeating or dropping any", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `audit-events-ties-${Date.now()}` },
      select: { id: true },
    });
    const createdAt = new Date();
    await db.auditEvent.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({ workspaceId: ws.id, action: `tie.${i}`, createdAt })),
    });

    try {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res = await GET(
          new Request(
            `http://localhost/api/internal/audit-events?workspaceId=${ws.id}&limit=2${cursor ? `&cursor=${cursor}` : ""}`,
            { headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` } },
          ),
        );
        const body = await res.json();
        seen.push(...body.events.map((event: { id: string }) => event.id));
        cursor = body.nextCursor;
      } while (cursor);

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    } finally {
      await db.auditEvent.deleteMany({ where: { workspaceId: ws.id } });
      await db.workspace.deleteMany({ where: { id: ws.id } });
    }
  });
});
