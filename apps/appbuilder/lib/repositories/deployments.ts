import { and, asc, desc, eq, isNull, lt, notInArray, or, type SQL } from "drizzle-orm";
import { REGISTRY_VERSION } from "@asafarim/appbuilder-runtime";
import type { Db } from "../db/client";
import { appDomains, deployments, deploymentSteps, releases } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError, NotFoundError } from "../errors";
import {
  assertStatusTransition,
  isTerminalStatus,
  TERMINAL_DEPLOYMENT_STATUSES,
  type DeploymentPhase,
  type DeploymentStatus,
} from "../deployment/stateMachine";
import { checkReleaseEligibility } from "../deployment/eligibility";
import { CrossAppReleaseError, DeploymentLeaseLostError, ReleaseNotEligibleError, RollbackTargetInvalidError, StaleDeploymentStateError } from "../deployment/errors";
import { redactDiagnostics } from "../validation/redaction";

export type DeploymentRow = typeof deployments.$inferSelect;
export type DeploymentStepRow = typeof deploymentSteps.$inferSelect;

const TERMINAL_STATUS_LIST = [...TERMINAL_DEPLOYMENT_STATUSES] as DeploymentStatus[];

async function currentActiveReleaseId(db: Db, appId: string): Promise<string | null> {
  const [domain] = await db
    .select({ activeReleaseId: appDomains.activeReleaseId })
    .from(appDomains)
    .where(and(eq(appDomains.appId, appId), eq(appDomains.status, "active")))
    .limit(1);
  return domain?.activeReleaseId ?? null;
}

// ─── Create (forward deploy) ────────────────────────────────────────────

export interface CreateDeploymentInput {
  releaseId: string;
  idempotencyKey: string;
}

/**
 * Enqueues a forward deployment of an already-APPROVED release. Idempotent
 * on `(appId, idempotencyKey)` (a redelivered "deploy this" request replays
 * the existing row rather than creating a second one — issue requirement).
 * Eligibility is re-derived FRESH, inside the same transaction that creates
 * the deployment row, immediately before the row is inserted — never reused
 * from preparation or approval time.
 */
export async function createDeployment(db: Db, actor: Actor, appId: string, input: CreateDeploymentInput): Promise<DeploymentRow> {
  await assertCapability(db, actor, appId, "app.deployRelease");
  const requestHash = checksumOf({ appId, releaseId: input.releaseId });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(deployments)
      .where(and(eq(deployments.appId, appId), eq(deployments.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different deployment request payload.");
      }
      return existing;
    }

    // Fetched by id alone FIRST so a release belonging to a DIFFERENT app is
    // rejected with a distinct, specific error rather than a generic 404 —
    // the actor already holds a real capability on `appId`, so confirming
    // "this release belongs to someone else's app" is not a meaningful leak.
    const [release] = await tx.select().from(releases).where(eq(releases.id, input.releaseId)).limit(1);
    if (!release) throw new NotFoundError("Release", input.releaseId);
    if (release.appId !== appId) throw new CrossAppReleaseError();
    if (release.status !== "approved") {
      throw new ConflictError(`Release is in status "${release.status}" — only an APPROVED release can be deployed.`);
    }

    const eligibility = await checkReleaseEligibility(tx, appId, release.specificationVersionId);
    if (!eligibility.eligible) {
      throw new ReleaseNotEligibleError(eligibility.reasons);
    }

    const supersededReleaseId = await currentActiveReleaseId(tx, appId);

    const [deployment] = await tx
      .insert(deployments)
      .values({
        id: generateId(),
        appId,
        releaseId: input.releaseId,
        environment: "production",
        status: "pending",
        phase: "queued",
        isRollback: false,
        supersededReleaseId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        deployedByPrincipalId: actor.principalId,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "deployment.created",
      targetType: "deployment",
      targetId: deployment.id,
      metadata: { releaseId: input.releaseId },
    });

    return deployment;
  });
}

// ─── Rollback ───────────────────────────────────────────────────────────

export interface RollbackInput {
  targetReleaseId: string;
  idempotencyKey: string;
}

/**
 * Enqueues a rollback deployment to an earlier, already-published release.
 * Never rewrites release history: this always creates a NEW `deployments`
 * row (with `isRollback: true`) that runs through the same activate/verify
 * pipeline as a forward deploy — it just points at an OLDER release instead
 * of a newly-prepared one, and skips the eligibility re-check (the target
 * already proved itself the first time it went live).
 */
export async function rollbackToRelease(db: Db, actor: Actor, appId: string, input: RollbackInput): Promise<DeploymentRow> {
  await assertCapability(db, actor, appId, "app.deployRelease");
  const requestHash = checksumOf({ appId, rollbackTo: input.targetReleaseId });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(deployments)
      .where(and(eq(deployments.appId, appId), eq(deployments.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different rollback request payload.");
      }
      return existing;
    }

    const [target] = await tx.select().from(releases).where(eq(releases.id, input.targetReleaseId)).limit(1);
    if (!target) throw new NotFoundError("Release", input.targetReleaseId);
    if (target.appId !== appId) throw new CrossAppReleaseError();
    if (!target.publishedAt) {
      throw new RollbackTargetInvalidError("This release was never published to production and cannot be rolled back to.");
    }
    if (target.registryVersion !== REGISTRY_VERSION) {
      throw new RollbackTargetInvalidError(
        `This release was built against registry version "${target.registryVersion}", which is no longer the running registry version ("${REGISTRY_VERSION}") — it is not safely re-activatable.`,
      );
    }

    const supersededReleaseId = await currentActiveReleaseId(tx, appId);
    if (supersededReleaseId === target.id) {
      throw new ConflictError("This release is already the active production release.");
    }

    const [deployment] = await tx
      .insert(deployments)
      .values({
        id: generateId(),
        appId,
        releaseId: target.id,
        environment: "production",
        status: "pending",
        phase: "queued",
        isRollback: true,
        supersededReleaseId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        deployedByPrincipalId: actor.principalId,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "deployment.rollback_requested",
      targetType: "deployment",
      targetId: deployment.id,
      metadata: { targetReleaseId: target.id, supersededReleaseId },
    });

    return deployment;
  });
}

// ─── Claiming (worker-side) ─────────────────────────────────────────────

export async function claimDeploymentById(db: Db, deploymentId: string, workerId: string, leaseDurationMs: number): Promise<DeploymentRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, eq(deployments.id, deploymentId));
}

export async function claimNextAvailableDeployment(db: Db, workerId: string, leaseDurationMs: number): Promise<DeploymentRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, undefined);
}

async function claimInternal(db: Db, workerId: string, leaseDurationMs: number, extraCondition: SQL | undefined): Promise<DeploymentRow | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const baseCondition = and(
      notInArray(deployments.status, TERMINAL_STATUS_LIST),
      or(isNull(deployments.leaseExpiresAt), lt(deployments.leaseExpiresAt, now)),
    );
    const candidates = await tx
      .select()
      .from(deployments)
      .where(extraCondition ? and(baseCondition, extraCondition) : baseCondition)
      .orderBy(asc(deployments.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    const candidate = candidates[0];
    if (!candidate) return null;

    const [claimed] = await tx
      .update(deployments)
      .set({
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        heartbeatAt: now,
        attemptCount: candidate.attemptCount + 1,
        updatedAt: now,
      })
      .where(eq(deployments.id, candidate.id))
      .returning();
    return claimed;
  });
}

export async function heartbeat(db: Db, deploymentId: string, workerId: string, leaseDurationMs: number): Promise<void> {
  const now = new Date();
  const [updated] = await db
    .update(deployments)
    .set({ heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseDurationMs), updatedAt: now })
    .where(and(eq(deployments.id, deploymentId), eq(deployments.leaseOwner, workerId), notInArray(deployments.status, TERMINAL_STATUS_LIST)))
    .returning({ id: deployments.id });
  if (!updated) throw new DeploymentLeaseLostError(deploymentId);
}

export async function releaseLease(db: Db, deploymentId: string, workerId: string): Promise<void> {
  await db
    .update(deployments)
    .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(deployments.id, deploymentId), eq(deployments.leaseOwner, workerId)));
}

// ─── Status / phase transitions ─────────────────────────────────────────

export interface DeploymentTransitionPatch {
  activatedAt?: Date;
  failureCode?: DeploymentRow["failureCode"];
  failureMessage?: string;
  errorMessage?: string;
  cancelRequestedAt?: Date | null;
  cancelledByPrincipalId?: string | null;
}

export async function transitionStatus(
  db: Db,
  deploymentId: string,
  from: DeploymentStatus,
  to: DeploymentStatus,
  patch: DeploymentTransitionPatch = {},
): Promise<DeploymentRow> {
  assertStatusTransition(from, to);
  const now = new Date();
  const values: Record<string, unknown> = { status: to, updatedAt: now, ...patch };
  if (from === "pending" && to === "running") values.startedAt = now;
  if (isTerminalStatus(to)) values.completedAt = now;

  const [updated] = await db
    .update(deployments)
    .set(values)
    .where(and(eq(deployments.id, deploymentId), eq(deployments.status, from)))
    .returning();
  if (!updated) throw new StaleDeploymentStateError(deploymentId, from);
  return updated;
}

/** Optimistic phase advance — guarded on the CURRENT phase so a crashed/redelivered worker can never double-apply a phase's side effects (e.g. double-activate). */
export async function transitionPhase(
  db: Db,
  deploymentId: string,
  fromPhase: DeploymentPhase,
  toPhase: DeploymentPhase,
  patch: Record<string, unknown> = {},
): Promise<DeploymentRow> {
  const [updated] = await db
    .update(deployments)
    .set({ phase: toPhase, updatedAt: new Date(), ...patch })
    .where(and(eq(deployments.id, deploymentId), eq(deployments.phase, fromPhase)))
    .returning();
  if (!updated) throw new StaleDeploymentStateError(deploymentId, fromPhase);
  return updated;
}

// ─── Cancellation ───────────────────────────────────────────────────────

/** Cancellation is only ever honored BEFORE the production pointer moves — issue requirement "cancellation before activation". Once `activatedAt` is set, the only way back is a rollback. */
export async function requestDeploymentCancellation(db: Db, actor: Actor, appId: string, deploymentId: string): Promise<DeploymentRow> {
  await assertCapability(db, actor, appId, "app.deployRelease");

  return db.transaction(async (tx) => {
    const [deployment] = await tx
      .select()
      .from(deployments)
      .where(and(eq(deployments.id, deploymentId), eq(deployments.appId, appId)))
      .for("update")
      .limit(1);
    if (!deployment) throw new NotFoundError("Deployment", deploymentId);

    if (deployment.status === "cancelled") return deployment;
    if (isTerminalStatus(deployment.status)) {
      throw new ConflictError(`Deployment already finished with status "${deployment.status}"; it cannot be cancelled.`);
    }
    if (deployment.activatedAt) {
      throw new ConflictError("This deployment already activated the production pointer — cancel is no longer possible; roll back instead.");
    }

    const now = new Date();
    if (deployment.status === "pending") {
      const [updated] = await tx
        .update(deployments)
        .set({ status: "cancelled", cancelRequestedAt: now, cancelledByPrincipalId: actor.principalId, completedAt: now, updatedAt: now })
        .where(eq(deployments.id, deploymentId))
        .returning();
      await recordAuditEvent(tx, { appId, actorPrincipalId: actor.principalId, action: "deployment.cancelled", targetType: "deployment", targetId: deploymentId, metadata: {} });
      return updated;
    }

    const [updated] = await tx
      .update(deployments)
      .set({ cancelRequestedAt: now, cancelledByPrincipalId: actor.principalId, updatedAt: now })
      .where(eq(deployments.id, deploymentId))
      .returning();
    await recordAuditEvent(tx, { appId, actorPrincipalId: actor.principalId, action: "deployment.cancellation_requested", targetType: "deployment", targetId: deploymentId, metadata: {} });
    return updated;
  });
}

export function isCancellationRequested(deployment: DeploymentRow): boolean {
  return deployment.cancelRequestedAt !== null || deployment.status === "cancelled";
}

// ─── Deployment steps ("safe logs") ─────────────────────────────────────

export interface RecordDeploymentStepInput {
  deploymentId: string;
  appId: string;
  phase: DeploymentPhase;
  ok: boolean;
  message: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
}

/** Upserts one phase's outcome — a retried phase replaces its own row rather than accumulating duplicates (unique on (deploymentId, phase)). `message`/`detail` are always redacted first: this is the ONLY thing the deployment UI's "logs" surface ever reads. */
export async function recordDeploymentStep(db: Db, input: RecordDeploymentStepInput): Promise<DeploymentStepRow> {
  const safeMessage = String((redactDiagnostics({ message: input.message }) as { message?: unknown }).message ?? "");
  const safeDetail = redactDiagnostics(input.detail ?? {});

  const [row] = await db
    .insert(deploymentSteps)
    .values({
      id: generateId(),
      deploymentId: input.deploymentId,
      appId: input.appId,
      phase: input.phase,
      ok: input.ok,
      message: safeMessage,
      detail: safeDetail,
      durationMs: input.durationMs ?? null,
    })
    .onConflictDoUpdate({
      target: [deploymentSteps.deploymentId, deploymentSteps.phase],
      set: { ok: input.ok, message: safeMessage, detail: safeDetail, durationMs: input.durationMs ?? null, createdAt: new Date() },
    })
    .returning();
  return row;
}

export async function listDeploymentSteps(db: Db, deploymentId: string): Promise<DeploymentStepRow[]> {
  return db.select().from(deploymentSteps).where(eq(deploymentSteps.deploymentId, deploymentId)).orderBy(asc(deploymentSteps.createdAt));
}

// ─── Reads ──────────────────────────────────────────────────────────────

export async function getDeploymentForActor(db: Db, actor: Actor, appId: string, deploymentId: string): Promise<DeploymentRow> {
  await assertCapability(db, actor, appId, "app.view");
  const [deployment] = await db.select().from(deployments).where(and(eq(deployments.id, deploymentId), eq(deployments.appId, appId))).limit(1);
  if (!deployment) throw new NotFoundError("Deployment", deploymentId);
  return deployment;
}

export async function listDeploymentsForActor(db: Db, actor: Actor, appId: string, limit = 20): Promise<DeploymentRow[]> {
  await assertCapability(db, actor, appId, "app.view");
  return db.select().from(deployments).where(eq(deployments.appId, appId)).orderBy(desc(deployments.createdAt)).limit(limit);
}

export async function getDeploymentStepsForActor(db: Db, actor: Actor, appId: string, deploymentId: string): Promise<DeploymentStepRow[]> {
  await getDeploymentForActor(db, actor, appId, deploymentId);
  return listDeploymentSteps(db, deploymentId);
}
