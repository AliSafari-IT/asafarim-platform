import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * GET /api/ai-usage (issue #587). The session is the only source of the
 * workspace, so the test swaps `getCurrentWorkspace` for a controllable
 * stub — everything below it (query parsing, read model, SQL scoping) is
 * real, against RESUMATCH_TEST_DATABASE_URL.
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

let currentWorkspace: { id: string } | null = null;
vi.mock("../../../lib/workspace", () => ({
  getCurrentWorkspace: async () => currentWorkspace,
}));
vi.mock("../../../lib/platform-settings", () => ({
  getPlatformSetting: async <T,>(_key: string, fallback: T) => fallback,
}));

describe.skipIf(!TEST_DB)("GET /api/ai-usage", () => {
  let db: import("../../../lib/db/generated").PrismaClient;
  let GET: typeof import("./route").GET;
  let record: typeof import("../../../lib/costs/ledger").recordProviderCost;
  const workspaces: string[] = [];
  let mine: string;
  let theirs: string;
  let myJob: string;
  let theirJob: string;

  async function get(query = "") {
    const res = await GET(new Request(`http://localhost/api/ai-usage${query}`));
    return { status: res.status, body: await res.json() };
  }

  beforeAll(async () => {
    ({ GET } = await import("./route"));
    ({ recordProviderCost: record } = await import("../../../lib/costs/ledger"));
    db = (await import("../../../lib/db/client")).getJobmatchDb();

    for (const tag of ["mine", "theirs"]) {
      const ws = await db.workspace.create({ data: { platformUserId: `ai-usage-${tag}-${Date.now()}` }, select: { id: true } });
      workspaces.push(ws.id);
    }
    [mine, theirs] = workspaces;
    myJob = (await db.targetJob.create({
      data: { workspaceId: mine, sourceUrl: "https://example.test/a", title: "Data Engineer", employer: "Acme", status: "FETCHED" },
      select: { id: true },
    })).id;
    theirJob = (await db.targetJob.create({
      data: { workspaceId: theirs, sourceUrl: "https://example.test/b", title: "Secret Role", employer: "Other", status: "FETCHED" },
      select: { id: true },
    })).id;

    const at = (i: number) => new Date(Date.now() - i * 60_000);
    // Mine: 1 tailor ($0.60 est), 1 cover letter via BYOK-less platform, 1 fixture, 1 unknown, 1 profile rewrite.
    await record({ workspaceId: mine, operation: "tailor", provider: "openai", model: "gpt-4o-mini", outputTokens: 1_000_000, attribution: { subjectType: "target_job", subjectId: myJob, targetJobId: myJob }, occurredAt: at(1) });
    await record({ workspaceId: mine, operation: "cover_letter", provider: "fixture", model: "fixture-cl-1", attribution: { subjectType: "target_job", subjectId: myJob, targetJobId: myJob }, occurredAt: at(2) });
    await record({ workspaceId: mine, operation: "cover_letter", provider: "mistral", model: "x", outputTokens: 10, attribution: { subjectType: "target_job", subjectId: myJob, targetJobId: myJob }, occurredAt: at(3) });
    await record({ workspaceId: mine, operation: "rewrite", provider: "openai", model: "gpt-4o-mini", inputTokens: 1, attribution: { subjectType: "candidate_profile", subjectId: mine }, occurredAt: at(4) });
    // Theirs: a large amount that must never appear in my totals.
    await record({ workspaceId: theirs, operation: "tailor", provider: "openai", model: "gpt-4o-mini", outputTokens: 10_000_000, attribution: { subjectType: "target_job", subjectId: theirJob, targetJobId: theirJob }, occurredAt: at(1) });
  });

  afterAll(async () => {
    if (!db) return;
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  });

  it("401s without a workspace session", async () => {
    currentWorkspace = null;
    const { status } = await get();
    expect(status).toBe(401);
  });

  it("returns only the session workspace's calls, with honest totals", async () => {
    currentWorkspace = { id: mine };
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.summary.eventCount).toBe(4);
    expect(body.summary.unknownCount).toBe(1);
    expect(body.summary.fixtureCount).toBe(1);
    // $0.60 + $0 + (unknown) + 1 input token at $0.15/1M (0.15 → 0 micros after half-up rounding)
    expect(body.summary.effectiveKnownMicros).toBe("600000");
    expect(JSON.stringify(body)).not.toContain("Secret Role");
    expect(JSON.stringify(body)).not.toContain(theirJob);

    const jobGroup = body.groups.find((g: { key: string }) => g.key === `job:${myJob}`);
    expect(jobGroup.label).toBe("Data Engineer");
    expect(jobGroup.application).toBeNull();
    const profile = body.groups.find((g: { key: string }) => g.key === "profile");
    expect(profile.totals.eventCount).toBe(1);
    // Σ group subtotals = total
    const sum = body.groups.reduce((n: bigint, g: { totals: { effectiveKnownMicros: string } }) => n + BigInt(g.totals.effectiveKnownMicros), 0n);
    expect(sum.toString()).toBe(body.summary.effectiveKnownMicros);
  });

  it("a foreign job id in the URL matches nothing (no cross-account exposure)", async () => {
    currentWorkspace = { id: mine };
    const { body } = await get(`?job=${theirJob}`);
    expect(body.summary.eventCount).toBe(0);
    expect(body.items).toEqual([]);
    expect(body.groups).toEqual([]);
  });

  it("filters by job, step and cost status", async () => {
    currentWorkspace = { id: mine };
    expect((await get(`?job=${myJob}`)).body.summary.eventCount).toBe(3);
    expect((await get("?operation=cover_letter")).body.summary.eventCount).toBe(2);
    const unknown = (await get("?status=unknown")).body;
    expect(unknown.summary.eventCount).toBe(1);
    expect(unknown.items[0].amountMicros).toBeNull();
    const fixture = (await get("?status=fixture")).body;
    expect(fixture.items[0]).toMatchObject({ basis: "fixture", amountMicros: "0", credentialSource: "none" });
  });

  it("paginates with an opaque cursor while totals stay fixed", async () => {
    currentWorkspace = { id: mine };
    const first = (await get("?limit=2")).body;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = (await get(`?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)).body;
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(second.summary).toEqual(first.summary);
    expect(new Set([...first.items, ...second.items].map((i: { id: string }) => i.id)).size).toBe(4);
  });

  it("returns operational metadata only — no content fields", async () => {
    currentWorkspace = { id: mine };
    const { body } = await get();
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          "amountMicros", "basis", "costSource", "credentialSource", "finality", "id", "latencyMs", "legacy", "model",
          "occurredAt", "operation", "outcome", "promptVersion", "provider", "subjectId", "subjectType", "usage", "workflowId",
        ].sort(),
      );
    }
  });
});
