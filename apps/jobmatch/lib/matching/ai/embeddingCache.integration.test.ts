import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EmbeddingProvider } from "./embeddings";

/**
 * JM-041 cache-reuse and GDPR-erasure behaviour against a real database.
 *
 * Guarded behind `JOBMATCH_TEST_DATABASE_URL` and named
 * `*.integration.test.ts`, mirroring
 * lib/ingestion/showcaseSource.integration.test.ts — `pnpm test` never
 * touches a database, and the dev database must never be a test target
 * (docs/threat-model.md). Run explicitly against a throwaway database:
 *
 *   JOBMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/jobmatch exec vitest run lib/matching/ai/embeddingCache.integration.test.ts
 *
 * Requires the `vector` extension and the match_embeddings table (this
 * issue's migration) to already be applied to that database.
 */

const TEST_DB = process.env.JOBMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.JOBMATCH_DATABASE_URL = TEST_DB;

/** Records every batch it was asked to embed, so a test can assert both the
 *  call count (cache reuse) and the exact text passed (never anything but
 *  buildEmbeddingInput's output). */
function spyProvider(): EmbeddingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    name: "fixture",
    modelVersion: "fixture-1",
    calls,
    async embed(texts: string[]) {
      calls.push(texts);
      return texts.map((text) => Array.from({ length: 4 }, (_, i) => text.length + i));
    },
  };
}

describe.skipIf(!TEST_DB)("embedding cache + erasure — database flow", () => {
  let db: import("../../db/generated").PrismaClient;
  let ensureProfileEmbedding: typeof import("./embeddingCache").ensureProfileEmbedding;
  let createVersion: typeof import("../../profile/versions").createVersion;
  let confirmVersion: typeof import("../../profile/versions").confirmVersion;
  let eraseWorkspaceData: typeof import("../../profile/dataRights").eraseWorkspaceData;

  let workspaceAId: string;
  let workspaceBId: string;
  let profileAId: string;
  let profileBId: string;

  beforeAll(async () => {
    ({ ensureProfileEmbedding } = await import("./embeddingCache"));
    ({ createVersion, confirmVersion } = await import("../../profile/versions"));
    ({ eraseWorkspaceData } = await import("../../profile/dataRights"));
    db = (await import("../../db/client")).getJobmatchDb();

    const [wsA, wsB] = await Promise.all([
      db.workspace.create({ data: { platformUserId: `embed-test-a-${Date.now()}` }, select: { id: true } }),
      db.workspace.create({ data: { platformUserId: `embed-test-b-${Date.now()}` }, select: { id: true } }),
    ]);
    workspaceAId = wsA.id;
    workspaceBId = wsB.id;

    const versionA = await createVersion({
      workspaceId: workspaceAId,
      content: { headline: "Backend Engineer", skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 3 }] },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceAId, versionA.id);
    const profileA = await db.candidateProfile.findUniqueOrThrow({ where: { workspaceId: workspaceAId } });
    profileAId = profileA.id;

    const versionB = await createVersion({
      workspaceId: workspaceBId,
      content: { headline: "Frontend Engineer", skills: [{ name: "React", rawLabel: null, yearsExperience: 2 }] },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceBId, versionB.id);
    const profileB = await db.candidateProfile.findUniqueOrThrow({ where: { workspaceId: workspaceBId } });
    profileBId = profileB.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "match_embeddings" WHERE "workspaceId" = ${workspaceAId} OR "workspaceId" = ${workspaceBId}`;
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
  });

  it("computes an embedding on first confirm", async () => {
    const provider = spyProvider();
    const result = await ensureProfileEmbedding(workspaceAId, profileAId, provider);
    expect(result?.reused).toBe(false);
    expect(provider.calls).toHaveLength(1);
  });

  it("reuses the cached vector when re-confirming with no professional-fact change", async () => {
    const provider = spyProvider();
    const result = await ensureProfileEmbedding(workspaceAId, profileAId, provider);
    expect(result?.reused).toBe(true);
    expect(provider.calls).toHaveLength(0);
  });

  it("invalidates only the changed profile's row when a skill changes", async () => {
    // Prime workspace B's row too, so we can prove it stays untouched.
    const providerB = spyProvider();
    const beforeB = await ensureProfileEmbedding(workspaceBId, profileBId, providerB);
    expect(beforeB).not.toBeNull();

    // Change workspace A's skills and confirm a new version.
    const corrected = await createVersion({
      workspaceId: workspaceAId,
      content: {
        headline: "Backend Engineer",
        skills: [
          { name: "TypeScript", rawLabel: null, yearsExperience: 3 },
          { name: "Kubernetes", rawLabel: null, yearsExperience: 1 },
        ],
      },
      origin: "CORRECTED",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceAId, corrected.id);

    const providerA = spyProvider();
    const afterA = await ensureProfileEmbedding(workspaceAId, profileAId, providerA);
    expect(afterA?.reused).toBe(false);
    expect(providerA.calls).toHaveLength(1);
    expect(providerA.calls[0][0]).toContain("Kubernetes");

    // Workspace B's row is untouched: reusing it makes no embed() call.
    const providerBAgain = spyProvider();
    const stillB = await ensureProfileEmbedding(workspaceBId, profileBId, providerBAgain);
    expect(stillB?.reused).toBe(true);
    expect(providerBAgain.calls).toHaveLength(0);
  });

  it("erasing a candidate removes their MatchEmbedding rows", async () => {
    const provider = spyProvider();
    await ensureProfileEmbedding(workspaceBId, profileBId, provider);

    const before = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "match_embeddings" WHERE "workspaceId" = ${workspaceBId}
    `;
    expect(Number(before[0].count)).toBeGreaterThan(0);

    const result = await eraseWorkspaceData(workspaceBId);
    expect(result.embeddingsDeleted).toBeGreaterThan(0);

    const after = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "match_embeddings" WHERE "workspaceId" = ${workspaceBId}
    `;
    expect(Number(after[0].count)).toBe(0);

    // Recreate the workspace/profile so afterAll's cleanup has a consistent
    // shape regardless of test order (erase deleted the CandidateProfile row).
    const versionB = await createVersion({
      workspaceId: workspaceBId,
      content: { headline: "Frontend Engineer" },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceBId, versionB.id);
  });
});
