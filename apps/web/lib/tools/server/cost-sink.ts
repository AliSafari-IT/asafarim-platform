import "server-only";
import { quantityOf, type CostEventWrite } from "@asafarim/ai-cost-ledger";
import { prisma } from "@asafarim/db";
import type { CostEventSink } from "./cost";

/**
 * Persists web cost events in the platform database (`WebToolCostEvent`).
 * Idempotent on `idempotencyKey`: a retried write returns the existing row's
 * id instead of inserting a second charge.
 */
export const prismaCostEventSink: CostEventSink = {
  async record(event: CostEventWrite) {
    const data = {
      idempotencyKey: event.idempotencyKey,
      schemaVersion: event.schemaVersion,
      entryType: event.entryType,
      ownerType: event.ownerType,
      ownerId: event.ownerId,
      actorId: event.actorId,
      operation: event.operation,
      outcome: event.outcome,
      finality: event.finality,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      parentSubjectType: event.parentSubjectType,
      parentSubjectId: event.parentSubjectId,
      workflowId: event.workflowId,
      traceId: event.traceId,
      provider: event.provider,
      requestModel: event.requestModel,
      responseModel: event.responseModel,
      providerRequestId: event.providerRequestId,
      promptVersion: event.promptVersion,
      pricingTier: event.pricingTier,
      usage: event.usage,
      inputTokens: quantityOf(event.usage, "input") + quantityOf(event.usage, "cached_input") + quantityOf(event.usage, "cache_write_input"),
      outputTokens: quantityOf(event.usage, "output"),
      currency: event.currency,
      estimatedCostMicros: event.estimatedCostMicros,
      actualCostMicros: event.actualCostMicros,
      adjustmentDeltaMicros: event.adjustmentDeltaMicros,
      costSource: event.costSource,
      credentialSource: event.credentialSource,
      pricingSnapshot: event.pricingSnapshot ?? undefined,
      fixture: event.fixture,
      supersedesEventId: event.supersedesEventId,
      latencyMs: event.latencyMs,
      metadata: event.metadata,
      occurredAt: event.occurredAt,
      finalizedAt: event.finalizedAt,
    };
    try {
      const row = await prisma.webToolCostEvent.create({ data, select: { id: true } });
      return row.id;
    } catch (error) {
      // Unique violation on idempotencyKey: the event already exists. Never
      // upsert — the table's trigger rejects any UPDATE.
      if ((error as { code?: string }).code !== "P2002") throw error;
      const existing = await prisma.webToolCostEvent.findUniqueOrThrow({
        where: { idempotencyKey: event.idempotencyKey },
        select: { id: true },
      });
      return existing.id;
    }
  },
};
