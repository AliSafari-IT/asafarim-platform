import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { checksumOf } from "@asafarim/appbuilder-schema";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { requestPreviewBuild } from "./previewService";
import { applyOperation } from "./operations";
import { createRelease, publishRelease } from "./releases";
import { enqueueValidationRun, transitionStatus, finalizeRun } from "./validationRuns";
import {
  enqueueRepairAttempt,
  claimAttemptById,
  transitionStatus as transitionRepairStatus,
  requestCancellation,
  confirmRepair,
  getRepairAttemptForActor,
  listRepairAttemptsForRun,
} from "./repairAttempts";
import { specifications, specificationVersions } from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError, StaleVersionError } from "../errors";

const db = getTestDb();

const owner = { principalId: "repair-owner", roles: [] };
const viewer = { principalId: "repair-viewer", roles: [] };
const unrelated = { principalId: "repair-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeFailedRun(name: string, slugSuffix: string, idempotencyKey: string) {
  const app = await createApp(
    db,
    owner,
    { name, slug: `${slugSuffix}-${Math.random().toString(36).slice(2, 8)}`, description: `${name} description`, prompt: `Build: ${name}`, starterFamily: "blank", visibility: "private" },
    idempotencyKey,
  );
  await requestPreviewBuild(db, owner, app.id);
  const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: `${idempotencyKey}-run`, requestSource: "manual" });
  await transitionStatus(db, run.id, "pending", "running");
  const failed = await finalizeRun(db, run.id, "failed");
  return { app, run: failed };
}

describe("enqueueRepairAttempt", () => {
  it("creates a queued attempt bound to the failed originating run", async () => {
    const { app, run } = await makeFailedRun("Repair App", "repair-app", "rep-1");
    const attempt = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-1" });
    expect(attempt.status).toBe("queued");
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.originatingRunId).toBe(run.id);
  });

  it("refuses a repair against a run that is not failed", async () => {
    const app = await createApp(db, owner, { name: "Not Failed App", slug: `not-failed-${Math.random().toString(36).slice(2, 8)}`, description: "d", prompt: "p", starterFamily: "blank", visibility: "private" }, "rep-2a");
    await requestPreviewBuild(db, owner, app.id);
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "rep-2a-run", requestSource: "manual" });
    await expect(enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-2" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("is idempotent: same key + payload replays the same attempt", async () => {
    const { app, run } = await makeFailedRun("Idempotent Repair App", "idem-repair", "rep-3");
    const first = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-3" });
    const second = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-3" });
    expect(second.id).toBe(first.id);
  });

  it("enforces MAX_REPAIR_ATTEMPTS_PER_RUN (bounded repair attempts per run)", async () => {
    const { app, run } = await makeFailedRun("Bounded Repair App", "bounded-repair", "rep-4");
    await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-4a" });
    await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-4b" });
    await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-4c" });
    await expect(enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-4d" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires app.requestRepair (editor+) — a viewer cannot request a repair", async () => {
    const { app, run } = await makeFailedRun("Viewer Repair Denied App", "viewer-repair-denied", "rep-5");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await expect(enqueueRepairAttempt(db, viewer, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-5" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor gets NotFoundError (leak prevention)", async () => {
    const { app, run } = await makeFailedRun("Unrelated Repair Denied App", "unrelated-repair-denied", "rep-6");
    await expect(enqueueRepairAttempt(db, unrelated, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-6" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("claiming, cancellation, and reads", () => {
  it("claimAttemptById claims a queued attempt and stamps a lease", async () => {
    const { app, run } = await makeFailedRun("Claim Repair App", "claim-repair", "rep-7");
    const attempt = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-7" });
    const claimed = await claimAttemptById(db, attempt.id, "worker-1", 60_000);
    expect(claimed?.leaseOwner).toBe("worker-1");
  });

  it("cancels a QUEUED attempt immediately", async () => {
    const { app, run } = await makeFailedRun("Cancel Queued Repair App", "cancel-queued-repair", "rep-8");
    const attempt = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-8" });
    const cancelled = await requestCancellation(db, owner, app.id, attempt.id);
    expect(cancelled.status).toBe("cancelled");
  });

  it("an APPLYING attempt is only cooperatively cancelled — no repair proceeds past a cancellation request", async () => {
    const { app, run } = await makeFailedRun("Cancel Applying Repair App", "cancel-applying-repair", "rep-9");
    const attempt = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-9" });
    await transitionRepairStatus(db, attempt.id, "queued", "classifying");
    await transitionRepairStatus(db, attempt.id, "classifying", "proposing");
    await transitionRepairStatus(db, attempt.id, "proposing", "applying");
    const cancelled = await requestCancellation(db, owner, app.id, attempt.id);
    expect(cancelled.status).toBe("applying");
    expect(cancelled.cancelRequestedAt).toBeTruthy();
  });

  it("cross-app isolation: a repair attempt from one app is not fetchable through a different app's scope", async () => {
    const { app: appA, run: runA } = await makeFailedRun("Repair Cross A", "repair-cross-a", "rep-10a");
    const { app: appB } = await makeFailedRun("Repair Cross B", "repair-cross-b", "rep-10b");
    const attempt = await enqueueRepairAttempt(db, owner, appA.id, { originatingRunId: runA.id, idempotencyKey: "attempt-10" });
    await expect(getRepairAttemptForActor(db, owner, appB.id, attempt.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listRepairAttemptsForRun returns attempts ordered by attempt number", async () => {
    const { app, run } = await makeFailedRun("List Repair App", "list-repair", "rep-11");
    await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-11a" });
    await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-11b" });
    const attempts = await listRepairAttemptsForRun(db, owner, app.id, run.id);
    expect(attempts.map((a) => a.attemptNumber)).toEqual([1, 2]);
  });
});

describe("confirmRepair", () => {
  it("binds to actor, app, base version, and exact checksum — succeeds when all match", async () => {
    const { app, run } = await makeFailedRun("Confirm Repair App", "confirm-repair", "rep-12");
    const attempt = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-12" });
    const checksum = checksumOf({ operations: [{ type: "SET_PERMISSION" }] });
    await transitionRepairStatus(db, attempt.id, "queued", "classifying");
    await transitionRepairStatus(db, attempt.id, "classifying", "proposing");
    await transitionRepairStatus(db, attempt.id, "proposing", "awaiting_confirmation", {
      confirmationRequired: true,
      confirmationChecksum: checksum,
      confirmationBaseVersionNumber: 1,
      confirmationExpiresAt: new Date(Date.now() + 60_000),
    });

    const confirmed = await confirmRepair(db, owner, app.id, attempt.id, { checksum });
    expect(confirmed.status).toBe("applying");
    expect(confirmed.confirmationConfirmedByPrincipalId).toBe(owner.principalId);
  });

  it("rejects a confirmation with the wrong checksum", async () => {
    const { app, run } = await makeFailedRun("Wrong Checksum Repair App", "wrong-checksum-repair", "rep-13");
    const attempt = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-13" });
    await transitionRepairStatus(db, attempt.id, "queued", "classifying");
    await transitionRepairStatus(db, attempt.id, "classifying", "proposing");
    await transitionRepairStatus(db, attempt.id, "proposing", "awaiting_confirmation", {
      confirmationRequired: true,
      confirmationChecksum: "expected-checksum",
      confirmationBaseVersionNumber: 1,
      confirmationExpiresAt: new Date(Date.now() + 60_000),
    });
    await expect(confirmRepair(db, owner, app.id, attempt.id, { checksum: "wrong-checksum" })).rejects.toThrow();
  });

  it("rejects a confirmation after the base version changed underneath it", async () => {
    const { app, run } = await makeFailedRun("Stale Version Repair App", "stale-version-repair", "rep-14");
    const attempt = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-14" });
    const checksum = "abc";
    await transitionRepairStatus(db, attempt.id, "queued", "classifying");
    await transitionRepairStatus(db, attempt.id, "classifying", "proposing");
    await transitionRepairStatus(db, attempt.id, "proposing", "awaiting_confirmation", {
      confirmationRequired: true,
      confirmationChecksum: checksum,
      confirmationBaseVersionNumber: 1,
      confirmationExpiresAt: new Date(Date.now() + 60_000),
    });

    // Someone edits the spec concurrently.
    await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "concurrent", machineName: "concurrent", name: "Concurrent", fields: [], indexes: [], archived: false } },
      baseVersionNumber: 1,
      idempotencyKey: "concurrent-edit",
    });

    await expect(confirmRepair(db, owner, app.id, attempt.id, { checksum })).rejects.toBeInstanceOf(StaleVersionError);
  });

  it("only the initiator may confirm — a different actor is forbidden", async () => {
    const { app, run } = await makeFailedRun("Wrong Actor Repair App", "wrong-actor-repair", "rep-15");
    const attempt = await enqueueRepairAttempt(db, owner, app.id, { originatingRunId: run.id, idempotencyKey: "attempt-15" });
    await addCollaborator(db, owner, app.id, viewer.principalId, "editor");
    await transitionRepairStatus(db, attempt.id, "queued", "classifying");
    await transitionRepairStatus(db, attempt.id, "classifying", "proposing");
    await transitionRepairStatus(db, attempt.id, "proposing", "awaiting_confirmation", {
      confirmationRequired: true,
      confirmationChecksum: "abc",
      confirmationBaseVersionNumber: 1,
      confirmationExpiresAt: new Date(Date.now() + 60_000),
    });
    await expect(confirmRepair(db, viewer, app.id, attempt.id, { checksum: "abc" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("released-version immutability", () => {
  it("a specification version bound to a release is never mutated by later operations — later edits only ever append a new version", async () => {
    const { app } = await makeFailedRun("Released Version App", "released-version", "rep-16");
    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    const [v1Before] = await db.select().from(specificationVersions).where(eq(specificationVersions.specificationId, spec.id));

    const release = await createRelease(db, owner, app.id, { specificationVersionId: v1Before.id, versionLabel: "v1.0" });
    await publishRelease(db, owner, app.id, release.id);

    await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "post_release", machineName: "post_release", name: "Post Release", fields: [], indexes: [], archived: false } },
      baseVersionNumber: 1,
      idempotencyKey: "post-release-edit",
    });

    const [v1After] = await db.select().from(specificationVersions).where(eq(specificationVersions.id, v1Before.id));
    expect(v1After.payload).toEqual(v1Before.payload);
    expect(v1After.checksum).toBe(v1Before.checksum);

    const versions = await db.select().from(specificationVersions).where(eq(specificationVersions.specificationId, spec.id));
    expect(versions).toHaveLength(2); // v1 (released, untouched) + v2 (the new edit) — never rewritten in place
  });
});
