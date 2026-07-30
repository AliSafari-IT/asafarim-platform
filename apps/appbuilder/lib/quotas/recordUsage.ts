import type { Db } from "../db/client";
import { usageEvents } from "../db/schema";
import { generateId } from "../db/ids";
import type { GeneratedEnvironment } from "../generated-data/environment";

/** The subset of usage_event_kind values a call site may record. Mirrors the DB enum in lib/db/schema.ts. */
export type UsageEventKind =
  | "ai_generation_request"
  | "ai_modification_request"
  | "ai_repair_request"
  | "preview_build"
  | "validation_run"
  | "deployment"
  | "workflow_execution"
  | "storage_write"
  | "public_reference_fetch";

export interface RecordUsageEventInput {
  appId?: string | null;
  ownerPrincipalId: string;
  environment?: GeneratedEnvironment | null;
  kind: UsageEventKind;
  quantity?: number;
  unit?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Appends one row to the durable, never-mutated usage ledger — the M12
 * "preserve enough usage data for future billing" requirement, satisfied
 * without implementing billing. Call this from WITHIN the same transaction
 * as the resource creation it measures wherever practical, so usage
 * recording can never observably succeed for a write that itself rolled
 * back.
 */
export async function recordUsageEvent(
  db: Db,
  input: RecordUsageEventInput
): Promise<void> {
  await db.insert(usageEvents).values({
    id: generateId(),
    appId: input.appId ?? null,
    ownerPrincipalId: input.ownerPrincipalId,
    environment: input.environment ?? null,
    kind: input.kind,
    quantity: input.quantity ?? 1,
    unit: input.unit ?? "count",
    metadata: input.metadata ?? {},
  });
}
