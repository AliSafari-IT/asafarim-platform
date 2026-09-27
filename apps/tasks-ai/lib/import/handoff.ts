import type { HandoffEnvelope } from "@asafarim/tool-handoff";
import type { StagedRow } from "./parse";

/**
 * Stages the tasks of an AI Workbench handoff (#678) as import rows. Pure.
 *
 * The handoff contract has no assignee or due date, and nothing here adds
 * one. Evidence, the item's provenance label, the effort estimate, and the
 * tasks it waits for are written into the description so they stay visible
 * after import. Row keys are `<handoffId>:<ref>`, stable across re-imports.
 */
const BASIS_LABEL = {
  extracted: "From the notes",
  constraint: "From your constraints",
  inferred: "Inferred",
  recommendation: "Suggestion",
} as const;

export function stageHandoffRows(envelope: HandoffEnvelope<"tasksai">): StagedRow[] {
  const titles = new Map(envelope.payload.tasks.map((t) => [t.ref, t.title]));
  return envelope.payload.tasks.map((t) => {
    const parts = [t.description.trim()];
    const provenance = t.basis === "inferred" || t.basis === "recommendation" ? `${BASIS_LABEL[t.basis]}: ${t.rationale ?? ""}`.trim() : BASIS_LABEL[t.basis];
    parts.push(`Source: AI Workbench ${envelope.source.tool} (${provenance}).`);
    for (const quote of t.evidence) parts.push(`> ${quote}`);
    if (t.effort) parts.push(`Effort estimate: ${t.effort.low}–${t.effort.high} ${t.effort.unit}.`);
    if (t.waitsFor.length) parts.push(`Waits for: ${t.waitsFor.map((ref) => titles.get(ref) ?? ref).join("; ")}.`);
    return {
      rowKey: `${envelope.handoffId}:${t.ref}`,
      data: { title: t.title.slice(0, 500), description: parts.filter(Boolean).join("\n\n").slice(0, 20_000) },
      status: "ok" as const,
      errors: [],
    };
  });
}

/** What the import job records about its source: ids and versions, never task text. */
export function handoffAudit(envelope: HandoffEnvelope<"tasksai">) {
  return {
    handoffId: envelope.handoffId,
    handoffVersion: envelope.handoffVersion,
    payloadVersion: envelope.payloadVersion,
    sourceApp: envelope.source.app,
    sourceTool: envelope.source.tool,
    toolVersion: envelope.source.toolVersion,
    schemaVersion: envelope.source.schemaVersion,
  };
}
