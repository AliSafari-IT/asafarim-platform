/**
 * Deterministic scorers. Each returns the shared dimensions (traceability,
 * unsupported claims, false precision, completeness) plus domain metrics.
 * Unsupported claims and false precision are counted separately and gated
 * on their own — never folded into one aggregate score.
 */
import { parseTemporalPhrase } from "@asafarim/timeline-contract";
import { claimsExecution } from "../../../apps/web/lib/tools/server/adapters/requirements-to-test-plan";
import { findAssignee, findDeadline, participantNames } from "../../../apps/web/lib/tools/action-plan/commitments";
import { dependencyIssues, type ActionPlan, type ActionPlanInput } from "../../../apps/web/lib/tools/action-plan/schema";
import type { TestPlan, TestPlanInput } from "../../../apps/web/lib/tools/test-plan/schema";
import { dateIsQuoted, type CitedTimeline } from "../../../apps/web/lib/tools/timeline/schema";

export interface Score {
  traceability: { items: number; traced: number };
  /** Claims the input doesn't support that reached the output. Gate: 0. */
  unsupportedClaims: number;
  /** Dates or quantities more precise than the input. Null where it doesn't apply. Gate: 0. */
  falsePrecision: number | null;
  /** Share of the output's expected sections that are populated (0–1). */
  completeness: number;
  /** Tool-specific metrics; null = not applicable to this case. */
  domain: Record<string, number | boolean | null>;
}

export type DomainScorer<TOutput> = (output: TOutput, input: unknown, expect: Record<string, unknown>) => Score;

const ratio = (parts: boolean[]) => (parts.length ? parts.filter(Boolean).length / parts.length : 1);

export const testPlanScorer: DomainScorer<TestPlan> = (plan, rawInput, expect) => {
  const input = rawInput as TestPlanInput;
  const sources = new Set(plan.sources.map((s) => s.id));
  const traced = plan.scenarios.filter((s) =>
    s.basis === "requirement" ? s.sourceIds.length > 0 && s.sourceIds.every((id) => sources.has(id)) : Boolean(s.assumption)
  ).length;
  const texts = [plan.title, plan.summary, ...plan.scenarios.flatMap((s) => [s.title, s.expected, s.assumption ?? "", ...s.steps])];
  const executionClaims = texts.filter(claimsExecution).length;
  const cited = new Set(plan.scenarios.flatMap((s) => s.sourceIds));
  const minQuestions = typeof expect.minQuestions === "number" ? expect.minQuestions : null;
  void input;
  return {
    traceability: { items: plan.scenarios.length, traced },
    unsupportedClaims: executionClaims,
    falsePrecision: null,
    completeness: ratio([plan.scenarios.length > 0, Boolean(plan.summary), plan.sources.length > 0]),
    domain: {
      requirementCoverage: plan.sources.length ? [...plan.sources].filter((s) => cited.has(s.id)).length / plan.sources.length : null,
      categoryDiversity: new Set(plan.scenarios.map((s) => s.category)).size,
      ambiguityRecognized: minQuestions === null ? null : plan.questions.length >= minQuestions,
      executionClaims,
    },
  };
};

export const actionPlanScorer: DomainScorer<ActionPlan> = (plan, rawInput, expect) => {
  const input = rawInput as ActionPlanInput;
  const names = participantNames(input.participants);
  const byId = new Map(plan.sources.map((s) => [s.id, s.text]));
  const items = [...plan.tasks, ...plan.dependencies, ...plan.risks, ...plan.milestones];
  const traced = items.filter((i) =>
    i.basis === "fact"
      ? i.sourceIds.some((id) => id.startsWith("N")) && i.sourceIds.every((id) => byId.has(id))
      : i.basis === "constraint"
        ? i.sourceIds.some((id) => id.startsWith("C"))
        : Boolean(i.rationale)
  ).length;
  let assignees = 0;
  let deadlines = 0;
  for (const t of [...plan.tasks.flatMap((t) => [{ text: t.title, ids: t.sourceIds }, { text: t.description, ids: t.sourceIds }]), ...plan.milestones.map((m) => ({ text: m.title, ids: m.sourceIds }))]) {
    if (findAssignee(t.text, names)) assignees += 1;
    const date = findDeadline(t.text);
    const evidence = t.ids.map((id) => byId.get(id) ?? "").join("\n").toLowerCase();
    if (date && !evidence.includes(date.toLowerCase())) deadlines += 1;
  }
  const minQuestions = typeof expect.minQuestions === "number" ? expect.minQuestions : null;
  return {
    traceability: { items: items.length, traced },
    unsupportedClaims: assignees + deadlines,
    falsePrecision: deadlines,
    completeness: ratio([plan.tasks.length > 0, Boolean(plan.objective), Boolean(plan.scope)]),
    domain: {
      tasks: plan.tasks.length,
      dependenciesValid: dependencyIssues(plan.dependencies, new Set(plan.tasks.map((t) => t.id))).length === 0,
      assigneeViolations: assignees,
      deadlineViolations: deadlines,
      openQuestionsRaised: minQuestions === null ? null : plan.questions.length >= minQuestions,
    },
  };
};

export const timelineScorer: DomainScorer<CitedTimeline> = (t, _input, expect) => {
  const sources = new Map(t.sources.map((s) => [s.id, s.text]));
  const traced = t.events.filter((e) => (e.basis === "cited" ? e.sourceIds.length > 0 && e.sourceIds.every((id) => sources.has(id)) : Boolean(e.uncertainty))).length;
  const dated = t.events.filter((e) => e.basis === "cited" && e.when.precision !== "unknown");
  // False precision: a date not worded that way in its source, or more precise than its own words.
  const falsePrecision = dated.filter(
    (e) => !dateIsQuoted(e.when.displayText, e.sourceIds.map((id) => sources.get(id) ?? "")) || parseTemporalPhrase(e.when.displayText).precision !== e.when.precision
  ).length;
  const gold = Array.isArray(expect.goldDates) ? (expect.goldDates as string[]).map(normalize) : null;
  const found = dated.map((e) => normalize(e.when.displayText));
  const conflictKind = typeof expect.conflictKind === "string" ? expect.conflictKind : null;
  return {
    traceability: { items: t.events.length, traced },
    unsupportedClaims: falsePrecision,
    falsePrecision,
    completeness: ratio([t.events.length > 0, Boolean(t.summary), t.sources.length > 0]),
    domain: {
      goldDateRecall: gold && gold.length ? gold.filter((g) => found.includes(g)).length / gold.length : null,
      goldDatePrecision: gold && found.length ? found.filter((f) => gold.includes(f)).length / found.length : null,
      precisionPreserved: dated.length ? (dated.length - falsePrecision) / dated.length : null,
      citationCoverage: t.events.length ? t.events.filter((e) => e.basis === "cited").length / t.events.length : null,
      // The fixture only detects impossible ranges and unreadable dates; other kinds are scored in live runs.
      conflictDetected: conflictKind ? t.conflicts.some((c) => c.kind === conflictKind) : null,
    },
  };
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}
