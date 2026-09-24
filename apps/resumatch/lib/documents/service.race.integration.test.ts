import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the atomic-claim race extractDocument shares with
 * rescanDocument (issue #527): two concurrent extractDocument calls for the
 * same document must not both win the claim. Guarded behind
 * RESUMATCH_TEST_DATABASE_URL, mirroring the other integration suites in
 * this app.
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/documents/service.race.integration.test.ts
 *
 * No bytes are stored for these documents, so every attempt that gets past
 * the claim fails at readDocumentBytes and goes through failExtraction's
 * retry path. That is the point: it exercises the claim and the lease
 * without needing a parser or an AI provider.
 *
 * readDocumentBytes is replaced by a gate so a test can hold a claimed
 * attempt open — "in progress" — while it makes a second call. Without the
 * gate, whether the second call lands during the first attempt or after it
 * has already failed (and legitimately released the document for a retry)
 * is down to connection-pool timing, which is what made the original
 * version of this test fail most runs.
 */

const gate = vi.hoisted(() => {
  const holds: Array<{ entered: () => void; released: Promise<void> }> = [];
  return {
    reads: 0,
    holds,
    /** Park the next readDocumentBytes call until `release` is called. */
    holdNextRead() {
      let entered!: () => void;
      let release!: () => void;
      const hasEntered = new Promise<void>((resolve) => (entered = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      holds.push({ entered, released });
      return { hasEntered, release };
    },
  };
});

vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  readDocumentBytes: async () => {
    gate.reads += 1;
    const hold = gate.holds.shift();
    if (hold) {
      hold.entered();
      await hold.released;
    }
    return null;
  },
}));

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("extractDocument — concurrent claim", () => {
  let db: import("../db/generated").PrismaClient;
  let service: typeof import("./service");
  let EXTRACTION_LEASE_MS: number;

  let workspaceId: string;

  beforeAll(async () => {
    service = await import("./service");
    ({ EXTRACTION_LEASE_MS } = await import("./pipeline"));
    db = (await import("../db/client")).getJobmatchDb();
    const ws = await db.workspace.create({
      data: { platformUserId: `extract-race-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.candidateDocument.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  async function createDocument(
    data: { status?: "CLEAN" | "EXTRACTING"; extractionAttempts?: number; extractionStartedAt?: Date | null } = {},
  ): Promise<string> {
    const doc = await db.candidateDocument.create({
      data: {
        workspaceId,
        storageKey: `extract-race-test/${Date.now()}-${Math.random()}`,
        originalFilename: "cv.pdf",
        contentType: "application/pdf",
        byteSize: 10,
        contentHash: "deadbeef",
        status: "CLEAN",
        ...data,
      },
      select: { id: true },
    });
    return doc.id;
  }

  function readRow(documentId: string) {
    return db.candidateDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: { status: true, reasonCode: true, extractionAttempts: true, extractionStartedAt: true },
    });
  }

  it("only one of two concurrent calls claims a CLEAN document", async () => {
    const documentId = await createDocument();
    const readsBefore = gate.reads;
    const held = gate.holdNextRead();

    const calls = [
      service.extractDocument(workspaceId, documentId),
      service.extractDocument(workspaceId, documentId),
    ];

    // Whichever call won is now parked inside its attempt. The other must
    // come back on its own — by losing the compare-and-swap if both read
    // CLEAN, or by finding the winner's lease if it read afterwards —
    // without ever reaching readDocumentBytes.
    await held.hasEntered;
    const loser = await Promise.race(calls);
    expect(loser.ok).toBe(false);
    expect(gate.reads - readsBefore).toBe(1);
    expect((await readRow(documentId)).extractionAttempts).toBe(1);

    held.release();
    const results = await Promise.all(calls);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(gate.reads - readsBefore).toBe(1);
    expect((await readRow(documentId)).extractionAttempts).toBe(1);
  });

  it("refuses a call that reads the row after another call's claim committed", async () => {
    // The interleaving that made the original test flaky, forced: the
    // second call's first read happens strictly after the first call has
    // claimed. The row then says EXTRACTING with attempts already bumped,
    // which the compare-and-swap alone cannot tell apart from "awaiting
    // retry".
    const documentId = await createDocument();
    const held = gate.holdNextRead();

    const first = service.extractDocument(workspaceId, documentId);
    await held.hasEntered;

    const second = await service.extractDocument(workspaceId, documentId);
    expect(second).toEqual({ ok: false, reasonCode: "EXTRACTION_IN_PROGRESS", status: "EXTRACTING" });
    expect(service.shouldCallExtractionAgain(second)).toBe(false);
    expect((await readRow(documentId)).extractionAttempts).toBe(1);

    held.release();
    await first;
    expect((await readRow(documentId)).extractionAttempts).toBe(1);
  });

  it("releases the lease on a retryable failure, so retries keep their budget semantics", async () => {
    const documentId = await createDocument();

    const first = await service.extractDocument(workspaceId, documentId);
    expect(first).toMatchObject({ ok: false, status: "EXTRACTING", reasonCode: "EXTRACTION_ERROR" });
    expect(service.shouldCallExtractionAgain(first)).toBe(true);
    expect(await readRow(documentId)).toMatchObject({ extractionAttempts: 1, extractionStartedAt: null });

    const second = await service.extractDocument(workspaceId, documentId);
    expect(second).toMatchObject({ ok: false, status: "EXTRACTING" });
    expect(await readRow(documentId)).toMatchObject({ extractionAttempts: 2, extractionStartedAt: null });

    // The third attempt exhausts MAX_EXTRACTION_ATTEMPTS and is terminal.
    const third = await service.extractDocument(workspaceId, documentId);
    expect(third).toMatchObject({ ok: false, status: "FAILED", reasonCode: "EXTRACTION_ERROR" });
    expect(service.shouldCallExtractionAgain(third)).toBe(false);
    expect(await readRow(documentId)).toMatchObject({ status: "FAILED", extractionAttempts: 3 });
  });

  it("refuses a live lease but takes over an expired one", async () => {
    const live = await createDocument({
      status: "EXTRACTING",
      extractionAttempts: 1,
      extractionStartedAt: new Date(Date.now() - 1000),
    });
    const refused = await service.extractDocument(workspaceId, live);
    expect(refused).toMatchObject({ ok: false, reasonCode: "EXTRACTION_IN_PROGRESS" });
    expect((await readRow(live)).extractionAttempts).toBe(1);

    // An attempt whose process died mid-extraction never cleared its lease.
    const abandoned = await createDocument({
      status: "EXTRACTING",
      extractionAttempts: 1,
      extractionStartedAt: new Date(Date.now() - EXTRACTION_LEASE_MS - 1000),
    });
    await service.extractDocument(workspaceId, abandoned);
    expect(await readRow(abandoned)).toMatchObject({ extractionAttempts: 2, extractionStartedAt: null });
  });

  it("does not let an attempt that lost its lease overwrite the attempt that took over", async () => {
    const documentId = await createDocument();

    const staleHold = gate.holdNextRead();
    const stale = service.extractDocument(workspaceId, documentId);
    await staleHold.hasEntered;

    // Simulate the stale attempt running past its lease.
    await db.candidateDocument.update({
      where: { id: documentId },
      data: { extractionStartedAt: new Date(Date.now() - EXTRACTION_LEASE_MS - 1000) },
    });

    const takeoverHold = gate.holdNextRead();
    const takeover = service.extractDocument(workspaceId, documentId);
    await takeoverHold.hasEntered;
    const takeoverLease = (await readRow(documentId)).extractionStartedAt;
    expect(takeoverLease).not.toBeNull();

    // The stale attempt now fails. Unfenced, its failExtraction would clear
    // the takeover's lease and open the document to a third claim while the
    // takeover is still running.
    staleHold.release();
    await stale;
    expect(await readRow(documentId)).toMatchObject({
      status: "EXTRACTING",
      extractionAttempts: 2,
      extractionStartedAt: takeoverLease,
    });

    takeoverHold.release();
    await takeover;
    expect(await readRow(documentId)).toMatchObject({ extractionAttempts: 2, extractionStartedAt: null });
  });
});
