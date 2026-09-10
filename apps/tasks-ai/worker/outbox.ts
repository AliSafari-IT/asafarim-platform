import { getTasksAiDb } from "../lib/db/client";
import { logger } from "../lib/observability/logger";
import { OUTBOX_TYPE } from "../lib/events/names";
import type { TestoraDiagnosePayload } from "../lib/ai/testora-diagnosis";

const BATCH = 50;
const MAX_ATTEMPTS = 6;

/**
 * Drains OutboxEvent (docs/adr/0005). M04 consumers:
 *  - notification.dispatch → (stub) would send an email/push; here it logs
 *    and marks the notification's row so a digest sweep can pick it up.
 *  - activity.fanout / search.index → no-op acknowledgements in M04; the
 *    search indexer lands in M05.
 *
 * At-least-once: a handler must be idempotent. Backoff is exponential;
 * after MAX_ATTEMPTS a row goes to `dead` and emits an audit-worthy log.
 */
export async function drainOutboxOnce(): Promise<{ processed: number; dead: number }> {
  const db = getTasksAiDb();
  const now = new Date();
  const rows = await db.outboxEvent.findMany({
    where: { status: "pending", availableAt: { lte: now } },
    orderBy: { availableAt: "asc" },
    take: BATCH,
  });

  let processed = 0;
  let dead = 0;

  for (const row of rows) {
    const claimed = await db.outboxEvent.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "processing", attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    try {
      await handle(row.type, row.payload as Record<string, unknown>);
      await db.outboxEvent.update({ where: { id: row.id }, data: { status: "done" } });
      processed += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      const isDead = attempts >= MAX_ATTEMPTS;
      await db.outboxEvent.update({
        where: { id: row.id },
        data: {
          status: isDead ? "dead" : "pending",
          lastError: err instanceof Error ? err.message.slice(0, 500) : "unknown",
          availableAt: new Date(Date.now() + Math.min(2 ** attempts, 300) * 1000),
        },
      });
      if (isDead) {
        dead += 1;
        logger.error({ id: row.id, type: row.type }, "outbox.dead_lettered");
      }
    }
  }
  return { processed, dead };
}

async function handle(type: string, payload: Record<string, unknown>): Promise<void> {
  switch (type) {
    case "notification.dispatch": {
      const db = getTasksAiDb();
      const id = String(payload.notificationId ?? "");
      if (!id) return;
      // Stub delivery: mark eligible for the next email digest. A real
      // SMTP/push send lands here in M04 follow-up / M12.
      await db.notification.updateMany({
        where: { id, digestedAt: null },
        data: {},
      });
      logger.info({ notificationId: id, kind: payload.kind }, "notification.dispatch");
      return;
    }
    case "activity.fanout": {
      // M09: drive the automation rules engine off domain events. Loop and
      // fan-out guards live in runRulesForEvent (causation depth + per-rule
      // hourly cap).
      const db = getTasksAiDb();
      const name = String(payload.name ?? "");
      const targetType = String(payload.targetType ?? "");
      const targetId = String(payload.targetId ?? "");
      if (targetType !== "task" || !targetId) return;
      const task = await db.task.findUnique({ where: { id: targetId } });
      if (!task) return;
      const { runRulesForEvent } = await import("../lib/automations/service");
      await runRulesForEvent(db, {
        name,
        workspaceId: task.workspaceId,
        data: {
          id: task.id,
          title: task.title,
          statusId: task.statusId,
          assigneeId: task.assigneeId,
          projectId: task.projectId,
          completed: Boolean(task.completedAt),
        },
      });
      return;
    }
    case "search.index":
      // Acknowledged; the search indexer proper lands with real search infra.
      return;
    case OUTBOX_TYPE.testoraDiagnose: {
      // Testora regression/flake → the test_diagnosis pipeline (issue #264).
      // Idempotent: runTestoraDiagnosis re-checks the delivery marker.
      const { runTestoraDiagnosis } = await import("../lib/ai/testora-diagnosis");
      const result = await runTestoraDiagnosis(payload as unknown as TestoraDiagnosePayload);
      logger.info({ ...result, deliveryId: String(payload.deliveryId ?? "") }, "testora.diagnose.handled");
      return;
    }
    default:
      logger.warn({ type }, "outbox.unknown_type");
  }
}
