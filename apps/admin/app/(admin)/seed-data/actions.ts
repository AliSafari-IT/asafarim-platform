"use server";

// Read-only seed operations: validate, refresh status, and dry-run planning.
//
// Every mutating path (seed / reconcile / remove) is deliberately absent from
// this file. It arrives with the background worker; until then the UI has no
// way to reach one, and safety.ts would refuse it anyway.
//
// Input handling: the browser sends an allowlisted provider id, an
// environment name and an operation name. Nothing else is accepted, and none
// of them is ever interpolated into a query, a path or a command.

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@asafarim/db";
import {
  authorizeOperation,
  getProvider,
  isProviderId,
  isSeedEnvironment,
  redactValue,
  resolveContext,
  sanitizeError,
  type SeedEnvironment,
  type SeedOperationKind,
  type SeedPlan,
  type SeedProviderContext,
  type SeedStatus,
  type ValidationResult,
} from "@asafarim/seed-manager";

import { writeSeedAuditEvent } from "../../../lib/audit";
import { resolveSeedActor } from "../../../lib/seed-actor";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ─── Input validation ────────────────────────────────────────────────────
//
// Hand-rolled rather than Zod: the entire accepted surface is three enum-like
// strings, and an allowlist membership test is both the strictest and the
// clearest way to express that. Unknown fields are structurally impossible
// because each field is read individually.

interface TargetInput {
  providerId?: unknown;
  environment?: unknown;
}

type ParsedTarget =
  | { ok: true; providerId: string; environment: SeedEnvironment }
  | { ok: false; error: string };

function parseTarget(input: TargetInput): ParsedTarget {
  if (!isProviderId(input.providerId)) {
    return { ok: false, error: "Unknown provider." };
  }
  if (!isSeedEnvironment(input.environment)) {
    return { ok: false, error: "Unknown environment." };
  }
  return { ok: true, providerId: input.providerId, environment: input.environment };
}

const READ_ONLY_PLAN_OPERATIONS: SeedOperationKind[] = ["seed", "reconcile", "remove"];

// ─── Shared execution shell ──────────────────────────────────────────────

/**
 * Authorize, resolve a context, run a read-only provider call, and persist
 * the outcome as a SeedOperation row so the page can render a cached
 * "last checked" state instead of re-inspecting every database on render.
 */
async function runReadOnly<T>(
  input: TargetInput,
  operation: SeedOperationKind,
  /** The operation recorded in history — a dry run records its real kind. */
  recordedOperation: SeedOperationKind,
  run: (context: SeedProviderContext) => Promise<T>,
  summarize: (result: T) => {
    status: "succeeded" | "failed";
    summary: Prisma.InputJsonValue;
    definitionVersion?: string;
    definitionChecksum?: string;
    planChecksum?: string;
    errorCode?: string;
    errorMessage?: string;
  }
): Promise<ActionResult<T>> {
  const target = parseTarget(input);
  if (!target.ok) return { ok: false, error: target.error };

  const resolved = await resolveSeedActor();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const provider = getProvider(target.providerId);
  if (!provider) return { ok: false, error: "Unknown provider." };

  const decision = authorizeOperation({
    actor: resolved.actor,
    provider,
    environment: target.environment,
    operation,
  });
  if (!decision.allowed) return { ok: false, error: decision.reason };

  const context = resolveContext(provider, target.environment);
  if (!context.ok) return { ok: false, error: context.reason };

  const idempotencyKey = `${provider.id}:${target.environment}:${recordedOperation}:${Date.now()}:${resolved.actor.userId}`;
  const record = await prisma.seedOperation.create({
    data: {
      providerId: provider.id,
      appId: provider.appId,
      environment: target.environment,
      operation: recordedOperation,
      dryRun: recordedOperation !== operation || operation === "validate" || operation === "status",
      status: "executing",
      stage: operation,
      requestedByUserId: resolved.actor.userId,
      idempotencyKey,
      startedAt: new Date(),
      heartbeatAt: new Date(),
    },
    select: { id: true },
  });

  try {
    const result = await run(context.context);
    const summarized = summarize(result);

    await prisma.seedOperation.update({
      where: { id: record.id },
      data: {
        status: summarized.status,
        stage: summarized.status,
        progress: 100,
        completedAt: new Date(),
        heartbeatAt: new Date(),
        definitionVersion: summarized.definitionVersion,
        definitionChecksum: summarized.definitionChecksum,
        planChecksum: summarized.planChecksum,
        planSummary: recordedOperation !== operation ? summarized.summary : undefined,
        resultSummary: recordedOperation === operation ? summarized.summary : undefined,
        errorCode: summarized.errorCode,
        errorMessage: summarized.errorMessage,
      },
    });

    await writeSeedAuditEvent({
      userId: resolved.actor.userId,
      action:
        operation === "validate"
          ? "seed.validation.requested"
          : operation === "status"
            ? "seed.status.requested"
            : "seed.plan.created",
      entity: "SeedProvider",
      entityId: provider.id,
      changes: {
        providerId: provider.id,
        environment: target.environment,
        operation: recordedOperation,
        planChecksum: summarized.planChecksum,
        definitionChecksum: summarized.definitionChecksum,
        resultStatus: summarized.status,
      },
    });

    revalidatePath("/seed-data");
    return { ok: true, data: result };
  } catch (error) {
    const { code, message } = sanitizeError(error);
    await prisma.seedOperation
      .update({
        where: { id: record.id },
        data: {
          status: "failed",
          stage: "failed",
          completedAt: new Date(),
          errorCode: code,
          errorMessage: message,
        },
      })
      .catch(() => undefined);

    await writeSeedAuditEvent({
      userId: resolved.actor.userId,
      action: "seed.failed",
      entity: "SeedProvider",
      entityId: provider.id,
      changes: {
        providerId: provider.id,
        environment: target.environment,
        operation: recordedOperation,
        resultStatus: "failed",
        errorCode: code,
      },
    });

    revalidatePath("/seed-data");
    // `message` is already sanitized — no URL, credential or SQL survives.
    return { ok: false, error: message };
  }
}

// ─── Public actions ──────────────────────────────────────────────────────

export async function validateProvider(
  input: TargetInput
): Promise<ActionResult<ValidationResult>> {
  const providerId = isProviderId(input.providerId) ? input.providerId : null;
  if (!providerId) return { ok: false, error: "Unknown provider." };
  const provider = getProvider(providerId)!;

  return runReadOnly(
    input,
    "validate",
    "validate",
    (context) => provider.validate(context),
    (result) => ({
      status: result.ok ? ("succeeded" as const) : ("failed" as const),
      summary: redactValue({
        connection: result.connection,
        issues: result.issues,
        durationMs: result.durationMs,
      }) as Prisma.InputJsonValue,
      definitionVersion: result.definitionVersion,
      definitionChecksum: result.definitionChecksum,
    })
  );
}

export async function refreshProviderStatus(
  input: TargetInput
): Promise<ActionResult<SeedStatus>> {
  const providerId = isProviderId(input.providerId) ? input.providerId : null;
  if (!providerId) return { ok: false, error: "Unknown provider." };
  const provider = getProvider(providerId)!;

  return runReadOnly(
    input,
    "status",
    "status",
    (context) => provider.inspect(context),
    (result) => ({
      status: result.connection === "ok" ? ("succeeded" as const) : ("failed" as const),
      summary: redactValue({
        health: result.health,
        seedOwnedCount: result.seedOwnedCount,
        missingCount: result.missingCount,
        driftedCount: result.driftedCount,
        orphanedCount: result.orphanedCount,
        entities: result.entities,
        issues: result.issues,
      }) as Prisma.InputJsonValue,
      definitionVersion: result.definitionVersion,
      definitionChecksum: result.definitionChecksum,
    })
  );
}

/**
 * A dry run. Produces a plan and a checksum, records both, and writes
 * nothing to the target database — the provider's `plan()` is read-only by
 * contract, and no execute path exists in this release.
 */
export async function dryRunOperation(
  input: TargetInput & { operation?: unknown }
): Promise<ActionResult<SeedPlan>> {
  const operation = input.operation;
  if (
    typeof operation !== "string" ||
    !(READ_ONLY_PLAN_OPERATIONS as string[]).includes(operation)
  ) {
    return { ok: false, error: "Unknown operation." };
  }
  const kind = operation as SeedOperationKind;

  const providerId = isProviderId(input.providerId) ? input.providerId : null;
  if (!providerId) return { ok: false, error: "Unknown provider." };
  const provider = getProvider(providerId)!;

  return runReadOnly(
    input,
    kind,
    kind,
    (context) => provider.plan(context, kind),
    (plan) => ({
      status: "succeeded" as const,
      summary: redactValue({
        changes: plan.changes,
        inserts: plan.inserts,
        updates: plan.updates,
        deletes: plan.deletes,
        retained: plan.retained,
        blocked: plan.blocked,
        warnings: plan.warnings,
        expiresAt: plan.expiresAt,
      }) as Prisma.InputJsonValue,
      definitionVersion: plan.definitionVersion,
      definitionChecksum: plan.definitionChecksum,
      planChecksum: plan.checksum,
    })
  );
}
