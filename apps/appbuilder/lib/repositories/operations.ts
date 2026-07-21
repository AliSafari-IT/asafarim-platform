import { eq, and, desc } from "drizzle-orm";
import {
  applySpecOperation,
  emptySpecification,
  SPEC_SCHEMA_VERSION,
  type ApplicationSpecificationType,
} from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { appliedOperations, specifications, specificationVersions } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import {
  ConflictError,
  DestructiveConfirmationRequiredError,
  NotFoundError,
  OperationValidationError,
  StaleVersionError,
} from "../errors";

export type AppliedOperationRow = typeof appliedOperations.$inferSelect;
export type SpecificationVersionRow = typeof specificationVersions.$inferSelect;

export interface ApplyOperationInput {
  /** A raw operation payload — validated by the pure engine itself, never trusted as pre-shaped. */
  operation: unknown;
  /** Optimistic-concurrency guard: the version this operation was authored against. */
  baseVersionNumber: number;
  idempotencyKey: string;
  /** Must be true to let a destructive change through (see @asafarim/appbuilder-schema's destructive classifier). */
  confirmDestructive?: boolean;
}

export interface ApplyOperationResult {
  operation: AppliedOperationRow;
  version: SpecificationVersionRow | null;
}

/**
 * Applies one controlled operation to an app's specification, via the pure
 * engine in @asafarim/appbuilder-schema, and persists the result
 * transactionally: a new immutable specification version, the append-only
 * operation record, and an audit event — or nothing at all if any step
 * fails.
 *
 * - Optimistic concurrency: `input.baseVersionNumber` must equal the
 *   draft's current version (checked under a row lock, so two concurrent
 *   requests can never both succeed against the same base) — otherwise
 *   `StaleVersionError`.
 * - Idempotency: a retry with the same `idempotencyKey` and an identical
 *   operation+base replays the original result; the same key with a
 *   different payload is `ConflictError`.
 * - Destructive changes: rejected with `DestructiveConfirmationRequiredError`
 *   unless `confirmDestructive: true`.
 * - Any validation failure leaves the database exactly as it was — no
 *   partial version, no partial operation row.
 */
export async function applyOperation(
  db: Db,
  actor: Actor,
  appId: string,
  input: ApplyOperationInput,
): Promise<ApplyOperationResult> {
  const { app } = await assertCapability(db, actor, appId, "app.applyOperation");
  const requestHash = checksumOf({ operation: input.operation, baseVersionNumber: input.baseVersionNumber });

  return db.transaction(async (tx) => {
    const [existingOp] = await tx
      .select()
      .from(appliedOperations)
      .where(eq(appliedOperations.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existingOp && existingOp.appId === appId) {
      if (existingOp.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different request payload");
      }
      const version = existingOp.resultingVersionId
        ? ((await tx
            .select()
            .from(specificationVersions)
            .where(eq(specificationVersions.id, existingOp.resultingVersionId))
            .limit(1))[0] ?? null)
        : null;
      return { operation: existingOp, version };
    }

    // Row-locked read: under concurrent transactions, the second one blocks
    // here until the first commits, then observes the *updated*
    // currentVersionNumber — this is what makes the staleness check below
    // correct against real concurrent writers, not just sequential callers.
    const [spec] = await tx
      .select()
      .from(specifications)
      .where(eq(specifications.appId, appId))
      .for("update")
      .limit(1);
    if (!spec) {
      throw new NotFoundError("Specification for app", appId);
    }

    if (spec.currentVersionNumber !== input.baseVersionNumber) {
      throw new StaleVersionError(spec.currentVersionNumber, input.baseVersionNumber);
    }

    let previousVersion: SpecificationVersionRow | null = null;
    let baseSpec: ApplicationSpecificationType;
    if (spec.currentVersionNumber === 0) {
      baseSpec = emptySpecification({ name: app.name, slug: app.slug });
    } else {
      const [version] = await tx
        .select()
        .from(specificationVersions)
        .where(
          and(
            eq(specificationVersions.specificationId, spec.id),
            eq(specificationVersions.versionNumber, spec.currentVersionNumber),
          ),
        )
        .limit(1);
      if (!version) {
        throw new NotFoundError("Specification version", String(spec.currentVersionNumber));
      }
      previousVersion = version;
      baseSpec = version.payload as unknown as ApplicationSpecificationType;
    }

    const outcome = applySpecOperation(baseSpec, input.operation, {
      confirmDestructive: input.confirmDestructive,
    });

    if (!outcome.ok) {
      if (outcome.destructive) {
        throw new DestructiveConfirmationRequiredError(outcome.destructive);
      }
      throw new OperationValidationError(outcome.errors);
    }

    const nextVersionNumber = spec.currentVersionNumber + 1;
    const versionId = generateId();

    const [version] = await tx
      .insert(specificationVersions)
      .values({
        id: versionId,
        specificationId: spec.id,
        appId,
        versionNumber: nextVersionNumber,
        parentVersionId: previousVersion?.id ?? null,
        schemaVersion: SPEC_SCHEMA_VERSION,
        engineVersion: outcome.engineVersion,
        summary: outcome.summary,
        payload: outcome.spec,
        checksum: outcome.checksum,
        createdByPrincipalId: actor.principalId,
      })
      .returning();

    await tx
      .update(specifications)
      .set({ currentVersionNumber: nextVersionNumber, updatedAt: new Date() })
      .where(eq(specifications.id, spec.id));

    const operationType =
      typeof input.operation === "object" && input.operation !== null && "type" in input.operation
        ? String((input.operation as { type: unknown }).type)
        : "UNKNOWN";

    const [operation] = await tx
      .insert(appliedOperations)
      .values({
        id: generateId(),
        appId,
        specificationId: spec.id,
        resultingVersionId: versionId,
        operationType,
        payload: input.operation as Record<string, unknown>,
        status: "applied",
        appliedByPrincipalId: actor.principalId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        baseVersionNumber: input.baseVersionNumber,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "operation.applied",
      targetType: "specification_version",
      targetId: versionId,
      metadata: {
        operationType,
        destructive: outcome.destructive?.classification ?? null,
      },
    });

    return { operation, version };
  });
}

export async function listOperationsForActor(
  db: Db,
  actor: Actor,
  appId: string,
): Promise<AppliedOperationRow[]> {
  await assertCapability(db, actor, appId, "app.view");
  return db
    .select()
    .from(appliedOperations)
    .where(eq(appliedOperations.appId, appId))
    .orderBy(desc(appliedOperations.createdAt));
}
