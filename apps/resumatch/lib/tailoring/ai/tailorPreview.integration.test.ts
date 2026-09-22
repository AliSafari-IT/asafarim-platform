import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Regression coverage for issue #525: generate-confirm must not persist
 * promptVersion/modelVersion/degraded from the request body. Exercises the
 * TailorPreview claim directly — the same updateMany-with-count-check shape
 * app/api/tailor/generate-confirm/route.ts uses — since the route itself
 * needs an authenticated session (Auth.js) this suite has no fixture for,
 * the same reason the other *.integration.test.ts files here call service
 * functions rather than route handlers wherever auth sits in front of them.
 *
 * Guarded behind RESUMATCH_TEST_DATABASE_URL:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/tailoring/ai/tailorPreview.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("TailorPreview — generate-confirm's provenance claim", () => {
  let db: import("../../db/generated").PrismaClient;
  let workspaceId: string;

  beforeAll(async () => {
    db = (await import("../../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.tailorPreview.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("a confirm call with a fabricated previewId (no prior preview) claims nothing", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `tailor-preview-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    const claim = await db.tailorPreview.updateMany({
      where: {
        id: "does-not-exist",
        workspaceId,
        profileVersionId: "profile-1",
        targetJobId: "job-1",
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    expect(claim.count).toBe(0);
  });

  it("a genuine preview's provenance is readable exactly once — a second confirm attempt is rejected", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `tailor-preview-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    const preview = await db.tailorPreview.create({
      data: {
        workspaceId,
        profileVersionId: "profile-1",
        targetJobId: "job-1",
        promptVersion: "tailor_resume@3",
        modelVersion: "fixture-tailor-1",
        degraded: false,
      },
      select: { id: true },
    });

    const first = await db.tailorPreview.updateMany({
      where: { id: preview.id, workspaceId, profileVersionId: "profile-1", targetJobId: "job-1", consumedAt: null },
      data: { consumedAt: new Date() },
    });
    expect(first.count).toBe(1);

    // Same previewId, second confirm attempt — must not re-claim.
    const second = await db.tailorPreview.updateMany({
      where: { id: preview.id, workspaceId, profileVersionId: "profile-1", targetJobId: "job-1", consumedAt: null },
      data: { consumedAt: new Date() },
    });
    expect(second.count).toBe(0);
  });

  it("a real preview generated for a different target job cannot be claimed for this one", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `tailor-preview-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    const preview = await db.tailorPreview.create({
      data: {
        workspaceId,
        profileVersionId: "profile-1",
        targetJobId: "job-A",
        promptVersion: "tailor_resume@3",
        modelVersion: "fixture-tailor-1",
        degraded: false,
      },
      select: { id: true },
    });

    const claim = await db.tailorPreview.updateMany({
      where: { id: preview.id, workspaceId, profileVersionId: "profile-1", targetJobId: "job-B", consumedAt: null },
      data: { consumedAt: new Date() },
    });
    expect(claim.count).toBe(0);
  });
});
