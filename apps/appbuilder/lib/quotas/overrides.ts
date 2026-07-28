import { and, desc, eq, isNull, or, gt } from "drizzle-orm";
import { ROLES } from "@asafarim/auth/roles";
import type { Db } from "../db/client";
import { quotaOverrides, operationalEvents } from "../db/schema";
import type { Actor } from "../auth/actor";
import { generateId } from "../db/ids";
import { ForbiddenError, NotFoundError } from "../errors";
import {
  resolveDefaultLimit,
  type QuotaMetric,
  type QuotaScopeType,
} from "./limits";

export type QuotaOverrideRow = typeof quotaOverrides.$inferSelect;

/**
 * Quota overrides are a platform-operator mechanism, not a per-app-owner
 * self-service setting — an app owner who is nearing a limit sees that
 * clearly in the readiness UI and is told to contact an operator; only a
 * platform superadmin can actually grant a temporary/permanent exception,
 * and every grant/revoke is durably recorded here AND mirrored to
 * `operational_events` (category "quota") so it shows up in the same
 * audit trail operators already use for everything else.
 */
function assertSuperadmin(actor: Actor): void {
  if (!actor.roles.includes(ROLES.SUPERADMIN)) {
    throw new ForbiddenError(
      "Only a platform superadmin may manage quota overrides"
    );
  }
}

export interface SetQuotaOverrideInput {
  scopeType: QuotaScopeType;
  scopeId: string;
  metric: QuotaMetric;
  limitValue: number;
  reason: string;
  expiresAt?: Date | null;
}

/**
 * Grants (or replaces) an active override for (scopeType, scopeId, metric).
 * Does not delete the prior row — it revokes it, preserving history, then
 * inserts a fresh one. `resolveQuotaLimit` only ever considers non-revoked,
 * non-expired rows, so there is always at most one *effective* override per
 * scope+metric even though history accumulates.
 */
export async function setQuotaOverride(
  db: Db,
  actor: Actor,
  input: SetQuotaOverrideInput
): Promise<QuotaOverrideRow> {
  assertSuperadmin(actor);
  if (!Number.isFinite(input.limitValue) || input.limitValue < 0) {
    throw new RangeError("limitValue must be a non-negative finite number");
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(quotaOverrides)
      .set({ revokedAt: now, revokedByPrincipalId: actor.principalId })
      .where(
        and(
          eq(quotaOverrides.scopeType, input.scopeType),
          eq(quotaOverrides.scopeId, input.scopeId),
          eq(quotaOverrides.metric, input.metric),
          isNull(quotaOverrides.revokedAt)
        )
      );

    const [row] = await tx
      .insert(quotaOverrides)
      .values({
        id: generateId(),
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        metric: input.metric,
        limitValue: input.limitValue,
        reason: input.reason,
        createdByPrincipalId: actor.principalId,
        expiresAt: input.expiresAt ?? null,
      })
      .returning();

    await tx.insert(operationalEvents).values({
      id: generateId(),
      appId: input.scopeType === "app" ? input.scopeId : null,
      category: "quota",
      kind: "quota.override.set",
      severity: "warning",
      actorPrincipalId: actor.principalId,
      detail: {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        metric: input.metric,
        limitValue: input.limitValue,
        reason: input.reason,
        expiresAt: input.expiresAt ?? null,
      },
    });

    return row;
  });
}

export async function revokeQuotaOverride(
  db: Db,
  actor: Actor,
  overrideId: string
): Promise<QuotaOverrideRow> {
  assertSuperadmin(actor);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(quotaOverrides)
      .where(eq(quotaOverrides.id, overrideId))
      .limit(1);
    if (!existing) throw new NotFoundError("QuotaOverride", overrideId);
    if (existing.revokedAt) return existing;

    const [row] = await tx
      .update(quotaOverrides)
      .set({ revokedAt: new Date(), revokedByPrincipalId: actor.principalId })
      .where(eq(quotaOverrides.id, overrideId))
      .returning();

    await tx.insert(operationalEvents).values({
      id: generateId(),
      appId: existing.scopeType === "app" ? existing.scopeId : null,
      category: "quota",
      kind: "quota.override.revoked",
      severity: "info",
      actorPrincipalId: actor.principalId,
      detail: {
        scopeType: existing.scopeType,
        scopeId: existing.scopeId,
        metric: existing.metric,
      },
    });

    return row;
  });
}

export async function listQuotaOverridesForScope(
  db: Db,
  scopeType: QuotaScopeType,
  scopeId: string
): Promise<QuotaOverrideRow[]> {
  return db
    .select()
    .from(quotaOverrides)
    .where(
      and(
        eq(quotaOverrides.scopeType, scopeType),
        eq(quotaOverrides.scopeId, scopeId)
      )
    )
    .orderBy(desc(quotaOverrides.createdAt));
}

/**
 * The effective limit for a (scopeType, scopeId, metric): the most recent
 * active (not revoked, not expired) override if one exists, else the
 * platform default. Must be called from WITHIN the same transaction that
 * subsequently checks usage and performs the guarded write — see
 * lib/quotas/enforce.ts#withQuota — so a concurrently-granted override
 * can't observably race the check it's meant to affect.
 */
export async function resolveQuotaLimit(
  db: Db,
  scopeType: QuotaScopeType,
  scopeId: string,
  metric: QuotaMetric
): Promise<number> {
  const now = new Date();
  const [override] = await db
    .select()
    .from(quotaOverrides)
    .where(
      and(
        eq(quotaOverrides.scopeType, scopeType),
        eq(quotaOverrides.scopeId, scopeId),
        eq(quotaOverrides.metric, metric),
        isNull(quotaOverrides.revokedAt),
        or(isNull(quotaOverrides.expiresAt), gt(quotaOverrides.expiresAt, now))
      )
    )
    .orderBy(desc(quotaOverrides.createdAt))
    .limit(1);

  return override ? override.limitValue : resolveDefaultLimit(metric);
}
