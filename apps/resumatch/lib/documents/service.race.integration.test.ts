import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Regression coverage for the atomic-claim race extractDocument shares with
 * rescanDocument (issue #527): two concurrent extractDocument calls for the
 * same document must not both win the CLEAN -> EXTRACTING claim. Guarded
 * behind RESUMATCH_TEST_DATABASE_URL, mirroring the other integration
 * suites in this app.
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/documents/service.race.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("extractDocument — concurrent claim", () => {
  let db: import("../db/generated").PrismaClient;
  let extractDocument: typeof import("./service").extractDocument;

  let workspaceId: string;
  let documentId: string;

  beforeAll(async () => {
    ({ extractDocument } = await import("./service"));
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.candidateDocument.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("only one of two concurrent calls claims a CLEAN document", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `extract-race-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    const doc = await db.candidateDocument.create({
      data: {
        workspaceId,
        storageKey: `extract-race-test/${Date.now()}`,
        originalFilename: "cv.pdf",
        contentType: "application/pdf",
        byteSize: 10,
        contentHash: "deadbeef",
        status: "CLEAN",
      },
      select: { id: true },
    });
    documentId = doc.id;

    // No bytes are actually stored for this key, so both calls fail past the
    // claim (readDocumentBytes returns null) — what this test asserts is
    // that both calls agree on who won the claim, not that extraction
    // succeeds. A losing call must observe extractionAttempts unchanged by
    // its own call and a status the claim itself produced, never claim a
    // second time.
    const [first, second] = await Promise.all([
      extractDocument(workspaceId, documentId),
      extractDocument(workspaceId, documentId),
    ]);

    const results = [first, second];
    const errored = results.filter((r) => !r.ok);
    expect(errored).toHaveLength(2);

    const stored = await db.candidateDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: { extractionAttempts: true },
    });
    // Exactly one claim incremented the attempt counter; a second, racing
    // claim against the same CLEAN status must not also increment it.
    expect(stored.extractionAttempts).toBe(1);
  });
});
