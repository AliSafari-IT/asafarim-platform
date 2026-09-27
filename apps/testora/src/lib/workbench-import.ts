import { handoffKey, MAX_HANDOFF_BYTES, parseHandoff, type HandoffEnvelope } from "@asafarim/tool-handoff";
import { scaffoldScript } from "./provision";

/**
 * Pure planning for AI Workbench imports (#678): validates a handoff file
 * and turns its reviewed scenarios into Testora rows. No DB — unit-tested.
 *
 * Scenarios land as *pending* scaffolded cases (like TasksAI provisioning,
 * #262): they execute and fail as stubs until someone automates them, so an
 * imported plan can never look like passing tests. Record ids derive from
 * the handoff id, which makes a second import of the same file resolve to
 * the same records instead of creating copies.
 */
export type WorkbenchEnvelope = HandoffEnvelope<"testora">;
export type WorkbenchFailure = { ok: false; code: string; message: string; details?: string[] };

export function validateWorkbenchFile(text: string, now = new Date()): { ok: true; envelope: WorkbenchEnvelope } | WorkbenchFailure {
  if (new TextEncoder().encode(text).length > MAX_HANDOFF_BYTES) {
    return { ok: false, code: "too_large", message: "This file is too large to import. Export a smaller selection from the tool and try again." };
  }
  const parsed = parseHandoff(text, "testora", now);
  return parsed.ok ? { ok: true, envelope: parsed.envelope } : parsed;
}

export function workbenchIds(handoffId: string) {
  const key = handoffKey(handoffId);
  return {
    frId: `fr-wb-${key}`,
    suiteId: `suite-wb-${key}`,
    fixtureId: `fx-wb-${key}`,
    caseId: (ref: string) => `scn-wb-${key.slice(0, 10)}-${ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  };
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 300);

export function planWorkbenchImport(envelope: WorkbenchEnvelope, projectId: string, importedBy: string, now = new Date()) {
  const ids = workbenchIds(envelope.handoffId);
  const { payload, source } = envelope;
  const description = [
    payload.summary,
    `Imported from the AI Workbench (${source.tool} ${source.toolVersion}). Scenarios are pending scaffolds: none has been automated or run.`,
    ...(payload.questions.length ? ["Open questions from the plan:", ...payload.questions.map((q) => `- ${q}`)] : []),
  ]
    .filter(Boolean)
    .join("\n\n");
  const audit = {
    source: "ai-workbench",
    handoffId: envelope.handoffId,
    handoffVersion: envelope.handoffVersion,
    payloadVersion: envelope.payloadVersion,
    sourceTool: source.tool,
    toolVersion: source.toolVersion,
    schemaVersion: source.schemaVersion,
    importedBy,
    importedAt: now.toISOString(),
    scenarios: payload.scenarios.length,
  };
  return {
    ids,
    requirement: { id: ids.frId, projectId, title: payload.title, description, metadata: audit },
    suite: { suiteId: ids.suiteId, frId: ids.frId, title: payload.title },
    fixture: { fixtureId: ids.fixtureId, suiteId: ids.suiteId, title: payload.title },
    cases: payload.scenarios.map((s) => ({
      caseId: ids.caseId(s.ref),
      fixtureId: ids.fixtureId,
      title: `${s.ref} ${s.title}`.slice(0, 500),
      scriptType: "scripted" as const,
      script: [
        "// Imported from the AI Workbench as a pending scenario: it fails until automated.",
        ...s.preconditions.map((p) => `// Given: ${oneLine(p)}`),
        ...s.steps.map((step, i) => `// ${i + 1}. ${oneLine(step)}`),
        `// Expected: ${oneLine(s.expected)}`,
        scaffoldScript(`${s.title} — expected: ${s.expected}`),
      ].join("\n"),
      scenarioState: "pending" as const,
      criterionRef: s.ref,
      metadata: {
        source: "ai-workbench",
        handoffId: envelope.handoffId,
        category: s.category,
        priority: s.priority,
        basis: s.basis,
        evidence: s.evidence,
        ...(s.assumption ? { assumption: s.assumption } : {}),
        preconditions: s.preconditions,
        steps: s.steps,
        expected: s.expected,
      },
    })),
  };
}

/** What the confirmation screen shows: exactly the records confirm would create. */
export function previewWorkbenchImport(envelope: WorkbenchEnvelope) {
  const plan = planWorkbenchImport(envelope, "(chosen app)", "(you)");
  return {
    handoffId: envelope.handoffId,
    source: envelope.source,
    expiresAt: envelope.expiresAt,
    requirement: { id: plan.requirement.id, title: plan.requirement.title },
    suite: plan.suite.suiteId,
    fixture: plan.fixture.fixtureId,
    cases: envelope.payload.scenarios.map((s) => ({
      caseId: plan.ids.caseId(s.ref),
      title: `${s.ref} ${s.title}`.slice(0, 500),
      priority: s.priority,
      basis: s.basis,
      steps: s.steps.length,
    })),
    questions: envelope.payload.questions.length,
  };
}
