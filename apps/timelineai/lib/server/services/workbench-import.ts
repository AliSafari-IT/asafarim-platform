import "server-only";
import { MAX_HANDOFF_BYTES, parseHandoff, type HandoffEnvelope } from "@asafarim/tool-handoff";
import type { ViewerContext } from "../authz";
import { EventsExtractionPayloadSchema } from "../../ai/schemas";
import { TemporalValueSchema, type TemporalValue } from "../../ai/temporal";
import { TimelineInputSchema, type TimelineInput } from "../../schemas";

/**
 * Imports a reviewed timeline from the public AI Workbench (#678).
 *
 * The file is validated twice: the shared handoff contract, then
 * TimelineAI's own `events_extraction` schema. Preview never writes.
 * Confirm re-validates the same file (never trusting the preview), requires
 * a signed-in user, and is idempotent per user and handoff id: a second
 * confirm returns the timeline the first one created. The audit record
 * holds ids, versions, and counts, never event text.
 */
export const IMPORT_AUDIT_ACTION = "workbench_import";

export type ImportFailure = { ok: false; code: string; message: string; details?: string[] };

export interface ImportPreview {
  ok: true;
  handoffId: string;
  source: HandoffEnvelope["source"];
  title: string;
  summary: string;
  expiresAt: string;
  events: { title: string; date: string; precision: string; confidence: string; citations: number; uncited: boolean }[];
}

export function previewWorkbenchImport(text: string, now = new Date()): ImportPreview | ImportFailure {
  const checked = validate(text, now);
  if (!checked.ok) return checked;
  const { envelope, events } = checked;
  return {
    ok: true,
    handoffId: envelope.handoffId,
    source: envelope.source,
    title: envelope.payload.title,
    summary: envelope.payload.summary,
    expiresAt: envelope.expiresAt,
    events: events.map((e) => ({
      title: e.title,
      date: e.temporalValue?.displayText ?? e.displayDate ?? "Undated",
      precision: e.temporalValue?.precision ?? "unknown",
      confidence: e.confidence,
      citations: e.citations.length,
      uncited: e.uncitedInference,
    })),
  };
}

type Validated = { ok: true; envelope: HandoffEnvelope<"timelineai">; events: HandoffEnvelope<"timelineai">["payload"]["events"] };

function validate(text: string, now: Date): Validated | ImportFailure {
  if (new TextEncoder().encode(text).length > MAX_HANDOFF_BYTES) {
    return { ok: false, code: "too_large", message: "This file is too large to import. Export a smaller selection from the tool and try again." };
  }
  const parsed = parseHandoff(text, "timelineai", now);
  if (!parsed.ok) return parsed;
  // TimelineAI's own schema is the final word on what an extracted event is.
  const own = EventsExtractionPayloadSchema.safeParse({ kind: "events_extraction", events: parsed.envelope.payload.events });
  if (!own.success) {
    return { ok: false, code: "invalid_payload", message: "This file doesn't match what TimelineAI can import. Export it again from the tool; nothing was imported.", details: own.error.issues.slice(0, 5).map((i) => i.path.join(".")) };
  }
  return { ok: true, envelope: parsed.envelope, events: parsed.envelope.payload.events };
}

/** Maps the reviewed events to TimelineAI's editor input. Exact dates only become startAt/endAt. */
export function toTimelineInput(envelope: HandoffEnvelope<"timelineai">, title: string): { input: TimelineInput; temporalValues: (TemporalValue | null)[] } {
  const events = envelope.payload.events;
  const input = TimelineInputSchema.parse({
    title: title.trim().slice(0, 200) || envelope.payload.title,
    description: envelope.payload.summary || null,
    timelineType: "historical",
    layout: "vertical",
    events: events.map((e, index) => ({
      startAt: e.startAt ?? null,
      endAt: e.endAt ?? null,
      displayDate: (e.temporalValue?.displayText ?? e.displayDate ?? null)?.slice(0, 120) ?? null,
      title: e.title,
      description: describe(e),
      sortOrder: index,
    })),
  });
  const temporalValues = events.map((e) => {
    const value = e.temporalValue ? TemporalValueSchema.safeParse(e.temporalValue) : null;
    return value?.success ? value.data : null;
  });
  return { input, temporalValues };
}

/** Keeps the evidence visible in the editor: description, citations, and an explicit uncited flag. */
function describe(e: HandoffEnvelope<"timelineai">["payload"]["events"][number]): string | null {
  const parts = [e.description?.trim()];
  if (e.uncitedInference) parts.push("Uncited inference: not stated in the source text.");
  for (const c of e.citations) parts.push(`Source ${c.label}${c.excerpt ? `: "${c.excerpt}"` : ""}`);
  const text = parts.filter(Boolean).join("\n\n");
  return text ? text.slice(0, 5_000) : null;
}

export interface ImportDeps {
  findPriorImport(userId: string, handoffId: string): Promise<{ timelineId: string } | null>;
  createWithAudit(args: {
    userId: string;
    input: TimelineInput;
    temporalValues: (TemporalValue | null)[];
    audit: Record<string, string | number>;
  }): Promise<{ timelineId: string }>;
}

export type ConfirmResult = { ok: true; status: "created" | "already_imported"; timelineId: string; events: number } | ImportFailure;

export async function confirmWorkbenchImport(text: string, viewer: ViewerContext, title: string, deps: ImportDeps = prismaDeps, now = new Date()): Promise<ConfirmResult> {
  if (!viewer.userId) return { ok: false, code: "sign_in", message: "Sign in to import into TimelineAI." };
  const checked = validate(text, now);
  if (!checked.ok) return checked;
  const { envelope } = checked;

  const prior = await deps.findPriorImport(viewer.userId, envelope.handoffId);
  if (prior) return { ok: true, status: "already_imported", timelineId: prior.timelineId, events: envelope.payload.events.length };

  const { input, temporalValues } = toTimelineInput(envelope, title);
  const created = await deps.createWithAudit({
    userId: viewer.userId,
    input,
    temporalValues,
    audit: {
      handoffId: envelope.handoffId,
      handoffVersion: envelope.handoffVersion,
      payloadVersion: envelope.payloadVersion,
      sourceApp: envelope.source.app,
      sourceTool: envelope.source.tool,
      toolVersion: envelope.source.toolVersion,
      schemaVersion: envelope.source.schemaVersion,
      events: input.events.length,
      outcome: "created",
    },
  });
  return { ok: true, status: "created", timelineId: created.timelineId, events: input.events.length };
}

// Loaded lazily so the pure validation and mapping above stay importable without a database or auth runtime.
const prismaDeps: ImportDeps = {
  async findPriorImport(userId, handoffId) {
    const { prisma } = await import("../db");
    const row = await prisma.auditLog.findFirst({
      where: { userId, action: IMPORT_AUDIT_ACTION, entity: "timeline", changes: { path: ["handoffId"], equals: handoffId } },
      select: { entityId: true },
    });
    if (!row?.entityId) return null;
    const exists = await prisma.timeline.findUnique({ where: { id: row.entityId }, select: { id: true } });
    return exists ? { timelineId: exists.id } : null;
  },
  async createWithAudit({ userId, input, temporalValues, audit }) {
    const [{ prisma }, { createTimeline }] = await Promise.all([import("../db"), import("./timelines")]);
    return prisma.$transaction(async (tx) => {
      const timeline = await createTimeline(input, { ownerUserId: userId, guestIdHash: null }, { tx, eventTemporalValues: temporalValues });
      await tx.auditLog.create({ data: { userId, action: IMPORT_AUDIT_ACTION, entity: "timeline", entityId: timeline.id, changes: audit } });
      return { timelineId: timeline.id };
    });
  },
};
