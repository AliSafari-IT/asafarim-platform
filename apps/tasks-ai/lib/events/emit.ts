import "server-only";
import type { Prisma, PrismaClient } from "../db/generated";
import type { EventName, OutboxType } from "./names";
import { OUTBOX_TYPE } from "./names";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface ActivitySpec {
  name: EventName;
  targetType: string;
  targetId: string;
  data?: Record<string, unknown>;
  actorType?: "user" | "system" | "automation" | "ai";
  actorId?: string | null;
}

export interface OutboxSpec {
  type: OutboxType;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  availableAt?: Date;
}

/**
 * Write an ActivityEvent plus the default fan-out OutboxEvent inside the
 * caller's transaction. Callers pass the same `tx` they used for the domain
 * write, so either everything commits or nothing does
 * (docs/adr/0005-event-outbox-strategy.md).
 */
export async function emitActivity(
  tx: Tx,
  workspaceId: string,
  correlationId: string,
  spec: ActivitySpec,
  extraOutbox: OutboxSpec[] = [],
): Promise<void> {
  await tx.activityEvent.create({
    data: {
      workspaceId,
      name: spec.name,
      actorType: spec.actorType ?? "user",
      actorId: spec.actorId ?? null,
      targetType: spec.targetType,
      targetId: spec.targetId,
      data: (spec.data ?? {}) as Prisma.InputJsonValue,
      correlationId,
    },
  });

  const outbox: OutboxSpec[] = [
    {
      type: OUTBOX_TYPE.activityFanout,
      payload: { name: spec.name, targetType: spec.targetType, targetId: spec.targetId },
      dedupeKey: `${OUTBOX_TYPE.activityFanout}:${correlationId}:${spec.name}:${spec.targetId}`,
    },
    ...extraOutbox,
  ];

  for (const o of outbox) {
    await tx.outboxEvent.create({
      data: {
        workspaceId,
        type: o.type,
        payload: o.payload as Prisma.InputJsonValue,
        dedupeKey: o.dedupeKey ?? null,
        availableAt: o.availableAt ?? new Date(),
      },
    });
  }
}

/** Append-only audit write. Best-effort: never fails the caller's action. */
export async function recordAudit(
  db: PrismaClient,
  workspaceId: string | null,
  name: string,
  actorId: string | null,
  data: Record<string, unknown> = {},
  correlationId?: string,
): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        workspaceId,
        name,
        actorType: "user",
        actorId,
        data: data as Prisma.InputJsonValue,
        correlationId: correlationId ?? null,
      },
    });
  } catch {
    // Audit misses are logged by the caller path in M02; hard-failing on
    // audit becomes its own decision with the data-rights work in M12.
  }
}
