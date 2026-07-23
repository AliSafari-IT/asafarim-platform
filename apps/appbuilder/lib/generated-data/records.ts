import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { generatedDataIdempotency, generatedRecordRelations, generatedRecordRevisions, generatedRecords, generatedUniquenessClaims } from "../db/schema";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError, NotFoundError } from "../errors";
import type { RuntimeContext } from "./runtimeAuth";
import { assertRuntimePermission, recordSatisfiesScope, resolveRowAccessScope } from "./runtimeAuth";
import {
  findEntity,
  normalizeForUniqueness,
  relationFieldIds,
  uniqueFieldIds,
  validateRecordData,
  type ValidationIssue,
} from "./validation";
import { upsertRelationEdge, validateRelationTarget } from "./relations";
import { applyDeleteBehaviorOnArchive } from "./relations";
import { recordActivity } from "./activity";
import { triggerWorkflows } from "./workflows";

/**
 * The generated-record CRUD boundary — every function here is app+entity
 * scoped by construction (there is deliberately no `getRecord(recordId)`
 * or unscoped list helper anywhere in this module: every query's WHERE
 * clause always includes both `appId` and `entityId`). Every mutation goes
 * through `validation.ts` first, enforces row-level access via
 * `runtimeAuth.ts`, and triggers allowlisted workflows (`workflows.ts`) in
 * the SAME transaction as the record change itself.
 */

export type GeneratedRecordRow = typeof generatedRecords.$inferSelect;

export class RecordValidationError extends ConflictError {
  constructor(public readonly errors: ValidationIssue[]) {
    super(`Record failed validation: ${errors.map((e) => e.message).join("; ")}`);
    this.name = "RecordValidationError";
  }
}

export class StaleRecordRevisionError extends ConflictError {
  constructor(
    public readonly currentRevision: number,
    public readonly baseRevision: number,
  ) {
    super(`Record has moved on: base revision ${baseRevision} is stale, current revision is ${currentRevision}`);
    this.name = "StaleRecordRevisionError";
  }
}

export class UniqueConstraintError extends ConflictError {
  constructor(fieldId: string) {
    super(`Value for "${fieldId}" is already in use on another record of this entity.`);
    this.name = "UniqueConstraintError";
  }
}

const POSTGRES_UNIQUE_VIOLATION = "23505";
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
}

async function claimUniqueValues(
  tx: Db,
  appId: string,
  entityId: string,
  entity: ReturnType<typeof findEntity>,
  recordId: string,
  data: Record<string, unknown>,
  fieldIds: string[],
): Promise<void> {
  for (const fieldId of fieldIds) {
    const value = data[fieldId];
    if (value === undefined || value === null) continue;
    const field = entity.fields.find((f) => f.id === fieldId)!;
    const valueHash = normalizeForUniqueness(field, value);
    try {
      await tx.insert(generatedUniquenessClaims).values({ id: generateId(), appId, entityId, fieldId, valueHash, recordId });
    } catch (err) {
      if (isUniqueViolation(err)) throw new UniqueConstraintError(fieldId);
      throw err;
    }
  }
}

async function releaseUniqueValue(tx: Db, appId: string, entityId: string, fieldId: string, valueHash: string): Promise<void> {
  await tx
    .delete(generatedUniquenessClaims)
    .where(
      and(
        eq(generatedUniquenessClaims.appId, appId),
        eq(generatedUniquenessClaims.entityId, entityId),
        eq(generatedUniquenessClaims.fieldId, fieldId),
        eq(generatedUniquenessClaims.valueHash, valueHash),
      ),
    );
}

async function syncRelationFieldsOnCreate(
  tx: Db,
  ctx: RuntimeContext,
  entityId: string,
  entity: ReturnType<typeof findEntity>,
  recordId: string,
  data: Record<string, unknown>,
): Promise<void> {
  for (const { fieldId, relationId } of relationFieldIds(entity)) {
    const value = data[fieldId];
    if (typeof value === "string" && value.length > 0) {
      await validateRelationTarget(tx, ctx.appId, ctx.spec, relationId, entityId, value);
      await upsertRelationEdge(tx, ctx.appId, relationId, recordId, value);
    }
  }
}

async function findIdempotentRecord(
  tx: Db,
  appId: string,
  entityId: string,
  scope: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<GeneratedRecordRow | undefined> {
  const [existing] = await tx
    .select()
    .from(generatedDataIdempotency)
    .where(
      and(
        eq(generatedDataIdempotency.appId, appId),
        eq(generatedDataIdempotency.entityId, entityId),
        eq(generatedDataIdempotency.scope, scope),
        eq(generatedDataIdempotency.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) return undefined;
  if (existing.requestHash !== requestHash) {
    throw new ConflictError("Idempotency key reused with a different request payload.");
  }
  const recordId = (existing.responseSnapshot as { recordId?: string } | null)?.recordId;
  if (!recordId) return undefined;
  const [record] = await tx.select().from(generatedRecords).where(eq(generatedRecords.id, recordId)).limit(1);
  return record;
}

export async function createRecord(
  db: Db,
  ctx: RuntimeContext,
  entityId: string,
  input: Record<string, unknown>,
  idempotencyKey: string,
): Promise<GeneratedRecordRow> {
  assertRuntimePermission(ctx, entityId, "create");
  const entity = findEntity(ctx.spec, entityId);
  const validation = validateRecordData(ctx.spec, entityId, input, { partial: false });
  if (!validation.ok) throw new RecordValidationError(validation.errors);

  const requestHash = checksumOf({ entityId, data: validation.data });

  return db.transaction(async (tx) => {
    const existing = await findIdempotentRecord(tx, ctx.appId, entityId, "create", idempotencyKey, requestHash);
    if (existing) return existing;

    const recordId = generateId();

    // The `generatedRecords` row must exist BEFORE either of the two calls
    // below: `generatedRecordRelations.fromRecordId` and
    // `generatedUniquenessClaims.recordId` both carry an immediate (never
    // deferred) foreign key to `generatedRecords.id` — inserting into
    // either first, referencing a record id that doesn't exist yet, always
    // fails with a foreign key violation (Postgres checks a non-deferred FK
    // at the end of its own statement, not at the end of the transaction).
    const [record] = await tx
      .insert(generatedRecords)
      .values({
        id: recordId,
        appId: ctx.appId,
        entityId,
        specVersionNumber: ctx.specVersionNumber,
        revision: 1,
        data: validation.data,
        status: "active",
        createdByPrincipalId: ctx.actor.principalId,
        updatedByPrincipalId: ctx.actor.principalId,
      })
      .returning();

    await syncRelationFieldsOnCreate(tx, ctx, entityId, entity, recordId, validation.data);
    await claimUniqueValues(tx, ctx.appId, entityId, entity, recordId, validation.data, uniqueFieldIds(entity));

    await recordActivity(tx, {
      appId: ctx.appId,
      entityId,
      recordId,
      action: "record.created",
      actorPrincipalId: ctx.actor.principalId,
      actorKind: "member",
    });

    await tx.insert(generatedDataIdempotency).values({
      id: generateId(),
      appId: ctx.appId,
      entityId,
      scope: "create",
      idempotencyKey,
      requestHash,
      responseSnapshot: { recordId },
    });

    await triggerWorkflows(
      tx,
      ctx.actor,
      ctx.appId,
      ctx.spec,
      entityId,
      { id: recordId, revision: 1, createdByPrincipalId: ctx.actor.principalId, data: validation.data },
      "onCreate",
    );

    return record;
  });
}

/** App+entity scoped single-record read — the only way to fetch a record by id. Row-access-scoped: a record outside the caller's permitted rows is reported as not found, never a distinguishing forbidden. */
export async function getRecord(db: Db, ctx: RuntimeContext, entityId: string, recordId: string): Promise<GeneratedRecordRow> {
  assertRuntimePermission(ctx, entityId, "read");
  const [record] = await db
    .select()
    .from(generatedRecords)
    .where(and(eq(generatedRecords.id, recordId), eq(generatedRecords.appId, ctx.appId), eq(generatedRecords.entityId, entityId)))
    .limit(1);
  if (!record) throw new NotFoundError("Record", recordId);

  const scope = await resolveRowAccessScope(db, ctx, entityId, "read");
  if (!recordSatisfiesScope(scope, ctx.actor, record)) throw new NotFoundError("Record", recordId);

  return record;
}

export interface UpdateRecordInput {
  data: Record<string, unknown>;
  baseRevision: number;
  idempotencyKey: string;
}

export async function updateRecord(
  db: Db,
  ctx: RuntimeContext,
  entityId: string,
  recordId: string,
  input: UpdateRecordInput,
): Promise<GeneratedRecordRow> {
  assertRuntimePermission(ctx, entityId, "update");
  const entity = findEntity(ctx.spec, entityId);
  const validation = validateRecordData(ctx.spec, entityId, input.data, { partial: true });
  if (!validation.ok) throw new RecordValidationError(validation.errors);

  const requestHash = checksumOf({ recordId, baseRevision: input.baseRevision, data: validation.data });

  return db.transaction(async (tx) => {
    const existing = await findIdempotentRecord(tx, ctx.appId, entityId, "update", input.idempotencyKey, requestHash);
    if (existing) return existing;

    const [record] = await tx
      .select()
      .from(generatedRecords)
      .where(and(eq(generatedRecords.id, recordId), eq(generatedRecords.appId, ctx.appId), eq(generatedRecords.entityId, entityId)))
      .for("update")
      .limit(1);
    if (!record || record.status === "archived") throw new NotFoundError("Record", recordId);

    const scope = await resolveRowAccessScope(tx, ctx, entityId, "update");
    if (!recordSatisfiesScope(scope, ctx.actor, record)) throw new NotFoundError("Record", recordId);

    if (record.revision !== input.baseRevision) {
      throw new StaleRecordRevisionError(record.revision, input.baseRevision);
    }

    for (const { fieldId, relationId } of relationFieldIds(entity)) {
      if (!(fieldId in validation.data)) continue;
      const value = validation.data[fieldId];
      if (typeof value === "string" && value.length > 0) {
        await validateRelationTarget(tx, ctx.appId, ctx.spec, relationId, entityId, value);
      }
    }

    for (const fieldId of uniqueFieldIds(entity)) {
      if (!(fieldId in validation.data)) continue;
      const field = entity.fields.find((f) => f.id === fieldId)!;
      const oldValue = record.data[fieldId];
      const newValue = validation.data[fieldId];
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
      if (oldValue !== undefined && oldValue !== null) {
        await releaseUniqueValue(tx, ctx.appId, entityId, fieldId, normalizeForUniqueness(field, oldValue));
      }
      if (newValue !== undefined && newValue !== null) {
        try {
          await tx.insert(generatedUniquenessClaims).values({
            id: generateId(),
            appId: ctx.appId,
            entityId,
            fieldId,
            valueHash: normalizeForUniqueness(field, newValue),
            recordId,
          });
        } catch (err) {
          if (isUniqueViolation(err)) throw new UniqueConstraintError(fieldId);
          throw err;
        }
      }
    }

    await tx.insert(generatedRecordRevisions).values({
      id: generateId(),
      recordId,
      appId: ctx.appId,
      entityId,
      revision: record.revision,
      data: record.data,
      changedByPrincipalId: ctx.actor.principalId,
    });

    const nextData = { ...record.data, ...validation.data };
    const nextRevision = record.revision + 1;
    const [updated] = await tx
      .update(generatedRecords)
      .set({ data: nextData, revision: nextRevision, updatedByPrincipalId: ctx.actor.principalId, updatedAt: new Date() })
      .where(eq(generatedRecords.id, recordId))
      .returning();

    for (const { fieldId, relationId } of relationFieldIds(entity)) {
      if (!(fieldId in validation.data)) continue;
      await tx
        .delete(generatedRecordRelations)
        .where(and(eq(generatedRecordRelations.relationId, relationId), eq(generatedRecordRelations.fromRecordId, recordId)));
      const value = validation.data[fieldId];
      if (typeof value === "string" && value.length > 0) {
        await upsertRelationEdge(tx, ctx.appId, relationId, recordId, value);
      }
    }

    await recordActivity(tx, {
      appId: ctx.appId,
      entityId,
      recordId,
      action: "record.updated",
      actorPrincipalId: ctx.actor.principalId,
      actorKind: "member",
      metadata: { changedFields: Object.keys(validation.data) },
    });

    await tx.insert(generatedDataIdempotency).values({
      id: generateId(),
      appId: ctx.appId,
      entityId,
      scope: "update",
      idempotencyKey: input.idempotencyKey,
      requestHash,
      responseSnapshot: { recordId },
    });

    await triggerWorkflows(
      tx,
      ctx.actor,
      ctx.appId,
      ctx.spec,
      entityId,
      { id: recordId, revision: nextRevision, createdByPrincipalId: updated.createdByPrincipalId, data: nextData },
      "onUpdate",
    );

    return updated;
  });
}

/** Archives a record — never a hard delete. Applies the specification's onDelete behavior for every relation that targets this entity. Idempotent: archiving an already-archived record is a no-op. */
export async function archiveRecord(db: Db, ctx: RuntimeContext, entityId: string, recordId: string): Promise<GeneratedRecordRow> {
  // No dedicated "archive" verb exists in @asafarim/appbuilder-schema's
  // PERMISSION_VERBS (create/read/update/delete) — "delete" is the closest
  // existing verb and is what archive/restore are gated by in M09; there is
  // no hard-delete path anywhere in this module for it to be confused with.
  assertRuntimePermission(ctx, entityId, "delete");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(generatedRecords)
      .where(and(eq(generatedRecords.id, recordId), eq(generatedRecords.appId, ctx.appId), eq(generatedRecords.entityId, entityId)))
      .for("update")
      .limit(1);
    if (!record) throw new NotFoundError("Record", recordId);
    if (record.status === "archived") return record;

    await applyDeleteBehaviorOnArchive(tx, ctx.appId, ctx.spec, entityId, recordId);

    const [archived] = await tx
      .update(generatedRecords)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(generatedRecords.id, recordId))
      .returning();

    await recordActivity(tx, {
      appId: ctx.appId,
      entityId,
      recordId,
      action: "record.archived",
      actorPrincipalId: ctx.actor.principalId,
      actorKind: "member",
    });

    await triggerWorkflows(
      tx,
      ctx.actor,
      ctx.appId,
      ctx.spec,
      entityId,
      { id: recordId, revision: archived.revision, createdByPrincipalId: archived.createdByPrincipalId, data: archived.data },
      "onArchive",
    );

    return archived;
  });
}

export async function restoreRecord(db: Db, ctx: RuntimeContext, entityId: string, recordId: string): Promise<GeneratedRecordRow> {
  assertRuntimePermission(ctx, entityId, "update");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(generatedRecords)
      .where(and(eq(generatedRecords.id, recordId), eq(generatedRecords.appId, ctx.appId), eq(generatedRecords.entityId, entityId)))
      .for("update")
      .limit(1);
    if (!record) throw new NotFoundError("Record", recordId);
    if (record.status === "active") return record;

    const [restored] = await tx
      .update(generatedRecords)
      .set({ status: "active", archivedAt: null, updatedAt: new Date() })
      .where(eq(generatedRecords.id, recordId))
      .returning();

    await recordActivity(tx, {
      appId: ctx.appId,
      entityId,
      recordId,
      action: "record.restored",
      actorPrincipalId: ctx.actor.principalId,
      actorKind: "member",
    });

    return restored;
  });
}
