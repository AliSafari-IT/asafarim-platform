import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The budget under test comes from RESUMATCH_AI_MONTHLY_BUDGET_USD. Pin the
// admin-console override layer to "no override" so a live local Admin (or an
// exported INTERNAL_API_SECRET) can never change what these tests assert.
vi.mock("../../platform-settings", () => ({
  getPlatformSetting: async <T,>(_key: string, fallback: T) => fallback,
}));

/**
 * End-to-end extraction-pipeline test against a real database. Guarded
 * behind `RESUMATCH_TEST_DATABASE_URL`, mirroring
 * lib/tailoring/ai/generate.integration.test.ts — `pnpm test` never
 * touches a database. Run explicitly:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/extraction/ai/degraded.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

// The dates use a layout the deterministic extractor recognises ("MM/YYYY -
// MM/YYYY" on the role line). It has never matched an ISO "2020-01 to
// 2023-12" range; with that range it found no experience at all.
const SAMPLE_CV = `Jane Doe
jane@example.test

EXPERIENCE
ICT Developer at Acme Corp 01/2020 - 12/2023
Built full-stack web applications.`;

describe.skipIf(!TEST_DB)("extractProfileWithFallback — end-to-end pipeline", () => {
  let db: import("../../db/generated").PrismaClient;
  let extractProfileWithFallback: typeof import("./degraded").extractProfileWithFallback;
  let extractProfileFromText: typeof import("../profileExtractor").extractProfileFromText;
  let resetEnvCache: typeof import("../../env").resetEnvCache;
  let workspaceId: string;

  beforeAll(async () => {
    ({ extractProfileWithFallback } = await import("./degraded"));
    ({ extractProfileFromText } = await import("../profileExtractor"));
    ({ resetEnvCache } = await import("../../env"));
    db = (await import("../../db/client")).getJobmatchDb();

    const ws = await db.workspace.create({
      data: { platformUserId: `extract-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;
  });

  afterEach(() => {
    delete process.env.RESUMATCH_AI_MONTHLY_BUDGET_USD;
    delete process.env.OPENAI_API_KEY;
    resetEnvCache();
  });

  afterAll(async () => {
    if (!db) return;
    await db.aiUsageLedger.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("fixture provider matches the deterministic extractor exactly and never writes a ledger row", async () => {
    const result = await extractProfileWithFallback(workspaceId, SAMPLE_CV, { provider: "fixture" });

    expect(result.degraded).toBe(true);
    expect(result.extractorName).toBe("resumatch-rules");
    expect(result.content.experience[0]?.employer).toBe("Acme Corp");
    const { content, confidence } = extractProfileFromText(SAMPLE_CV);
    expect(result.content).toEqual(content);
    expect(result.confidence).toEqual(confidence);

    const ledger = await db.aiUsageLedger.findMany({ where: { workspaceId, kind: "extract" } });
    expect(ledger).toHaveLength(0);
  });

  it("degrades to the deterministic extractor when the real provider has no API key configured", async () => {
    const result = await extractProfileWithFallback(workspaceId, SAMPLE_CV, { provider: "openai" });

    expect(result.degraded).toBe(true);
    expect(result.extractorName).toBe("resumatch-rules");
    expect(result.content.experience[0]?.employer).toBe("Acme Corp");

    const ledger = await db.aiUsageLedger.findMany({ where: { workspaceId, kind: "extract" } });
    expect(ledger).toHaveLength(0);
  });

  it("degrades without attempting a provider call once the monthly AI budget is exhausted", async () => {
    process.env.RESUMATCH_AI_MONTHLY_BUDGET_USD = "0";
    resetEnvCache();

    const result = await extractProfileWithFallback(workspaceId, SAMPLE_CV, { provider: "openai" });

    expect(result.degraded).toBe(true);
    const ledger = await db.aiUsageLedger.findMany({ where: { workspaceId, kind: "extract" } });
    expect(ledger).toHaveLength(0);
  });
});
