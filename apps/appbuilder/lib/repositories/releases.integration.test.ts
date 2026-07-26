import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { requestPreviewBuild } from "./previewService";
import { enqueueValidationRun, transitionStatus, upsertGateResult, finalizeRun } from "./validationRuns";
import { prepareRelease, approveRelease, getReleaseForActor, listReleasesForActor } from "./releases";
import { ReleaseNotEligibleError } from "../deployment/errors";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";

const db = getTestDb();

const owner = { principalId: "rel-owner", roles: [] };
const editor = { principalId: "rel-editor", roles: [] };
const unrelated = { principalId: "rel-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeApp(name: string, slugSuffix: string, idempotencyKey: string) {
  return createApp(
    db,
    owner,
    { name, slug: `${slugSuffix}-${Math.random().toString(36).slice(2, 8)}`, description: `${name} description`, prompt: `Build: ${name}`, starterFamily: "blank", visibility: "private" },
    idempotencyKey,
  );
}

/** Builds an app with a specification version that genuinely satisfies every M11 eligibility requirement — a succeeded, checksum-matched preview build and a PASSED, release-eligible validation run pinned to the exact same version. */
async function makeEligibleApp(name: string, slugSuffix: string, idempotencyKey: string) {
  const app = await makeApp(name, slugSuffix, idempotencyKey);
  const { build } = await requestPreviewBuild(db, owner, app.id);
  const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: `${idempotencyKey}-run`, requestSource: "manual" });
  await transitionStatus(db, run.id, "pending", "running");
  await upsertGateResult(db, {
    runId: run.id,
    appId: app.id,
    gateKey: "spec_schema_validity",
    gateVersion: "1.0.0",
    mandatory: true,
    result: { status: "passed" },
    startedAt: new Date(),
    completedAt: new Date(),
    artifactIds: [],
  });
  await finalizeRun(db, run.id, "passed");
  return { app, build, run, specificationVersionId: build.specificationVersionId };
}

describe("prepareRelease — eligibility bound to exact checksum", () => {
  it("prepares a release for an eligible version", async () => {
    const { app, specificationVersionId, run } = await makeEligibleApp("Eligible Prep App", "elig-prep", "prep-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    expect(release.status).toBe("draft");
    expect(release.specificationVersionId).toBe(specificationVersionId);
    expect(release.validationRunId).toBe(run.id);
    expect(release.manifestChecksum.length).toBeGreaterThan(0);
    expect(release.appSlug).toBe(app.slug);
    expect(release.productionHost).toBe(`${app.slug}.apps.asafarim.com`);
  });

  it("rejects a version with no passing validation run at all", async () => {
    const app = await makeApp("No Validation App", "no-val", "prep-2");
    const { build } = await requestPreviewBuild(db, owner, app.id);
    await expect(prepareRelease(db, owner, app.id, { specificationVersionId: build.specificationVersionId })).rejects.toBeInstanceOf(ReleaseNotEligibleError);
  });

  it("is bound to the EXACT version+checksum: a passing run for v1 never makes a later v2 (different checksum, no run of its own) eligible", async () => {
    const { app, specificationVersionId: v1Id } = await makeEligibleApp("Exact Checksum App", "exact-checksum", "prep-3");
    const { applyOperation } = await import("./operations");
    const applied = await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "extra", machineName: "extra", name: "Extra", fields: [], indexes: [], archived: false } },
      baseVersionNumber: 1,
      idempotencyKey: "prep-3-op",
    });
    const v2Id = applied.version!.id;
    expect(v2Id).not.toBe(v1Id);
    await expect(prepareRelease(db, owner, app.id, { specificationVersionId: v2Id })).rejects.toBeInstanceOf(ReleaseNotEligibleError);
  });

  it("is idempotent: preparing the same version twice returns the SAME draft release, not a duplicate", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Idempotent Prep App", "idem-prep", "prep-4");
    const first = await prepareRelease(db, owner, app.id, { specificationVersionId });
    const second = await prepareRelease(db, owner, app.id, { specificationVersionId });
    expect(second.id).toBe(first.id);
    expect(second.manifestChecksum).toBe(first.manifestChecksum);
  });

  it("immutable release creation: re-preparing a version that has already been approved is rejected, not re-frozen", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Immutable Release App", "immutable", "prep-5");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await approveRelease(db, owner, app.id, release.id);
    await expect(prepareRelease(db, owner, app.id, { specificationVersionId })).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires app.deployRelease (owner-rank) — an editor cannot prepare a release", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Editor Prep App", "editor-prep", "prep-6");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    await expect(prepareRelease(db, editor, app.id, { specificationVersionId })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor gets NotFoundError, not a distinguishing error", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Unrelated Prep App", "unrelated-prep", "prep-7");
    await expect(prepareRelease(db, unrelated, app.id, { specificationVersionId })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("approveRelease — stale approval rejection and unauthorized approval", () => {
  it("approves a still-eligible draft", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Approve App", "approve", "appr-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    const approved = await approveRelease(db, owner, app.id, release.id);
    expect(approved.status).toBe("approved");
    expect(approved.approvedByPrincipalId).toBe(owner.principalId);
    expect(approved.approvedAt).toBeTruthy();
  });

  it("rejects approval once the app has been archived since preparation — the release is no longer approvable even though it was eligible when prepared", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Archived Between App", "archived-between", "appr-2");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    const { archiveApp } = await import("./apps");
    await archiveApp(db, owner, app.id);
    // app.approve is not in authz.ts's ALLOWED_WHILE_ARCHIVED set, so this is
    // refused at the capability layer (ConflictError) before eligibility is
    // even re-checked — still the correct "this is now stale" outcome.
    await expect(approveRelease(db, owner, app.id, release.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("checkReleaseEligibility itself reports staleness once the app is archived, independent of the capability layer", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Direct Eligibility Recheck App", "direct-elig", "appr-2b");
    const { archiveApp } = await import("./apps");
    await archiveApp(db, owner, app.id);
    const { checkReleaseEligibility } = await import("../deployment/eligibility");
    const result = await checkReleaseEligibility(db, app.id, specificationVersionId);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes("archived"))).toBe(true);
  });

  it("requires app.approve (owner-rank) — an editor cannot approve", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Editor Approve App", "editor-approve", "appr-3");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await expect(approveRelease(db, editor, app.id, release.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor cannot approve (NotFoundError)", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Unrelated Approve App", "unrelated-approve", "appr-4");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await expect(approveRelease(db, unrelated, app.id, release.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("approving an already-approved release is idempotent (returns it unchanged)", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Reapprove App", "reapprove", "appr-5");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    const first = await approveRelease(db, owner, app.id, release.id);
    const second = await approveRelease(db, owner, app.id, release.id);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("approved");
  });
});

describe("reads and cross-app isolation", () => {
  it("listReleasesForActor and getReleaseForActor are scoped to the app", async () => {
    const { app, specificationVersionId } = await makeEligibleApp("Read App", "read-app", "read-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    const list = await listReleasesForActor(db, owner, app.id);
    expect(list.map((r) => r.id)).toContain(release.id);
    const fetched = await getReleaseForActor(db, owner, app.id, release.id);
    expect(fetched.id).toBe(release.id);
  });

  it("cross-app release rejection: a release id from a DIFFERENT app is not found under this app", async () => {
    const { app: appOne, specificationVersionId: v1 } = await makeEligibleApp("Cross App One", "cross-one", "cross-1");
    const { app: appTwo } = await makeEligibleApp("Cross App Two", "cross-two", "cross-2");
    const release = await prepareRelease(db, owner, appOne.id, { specificationVersionId: v1 });
    await expect(getReleaseForActor(db, owner, appTwo.id, release.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
