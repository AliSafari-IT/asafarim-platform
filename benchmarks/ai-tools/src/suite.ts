/**
 * The AI Workbench eval suite: which tools are evaluated, on which cases, with
 * which scorers. Datasets live next to each tool's schema in apps/web (so
 * TypeScript keeps them in step with the contract); this package owns the
 * scoring, thresholds, and reports. See README.md for the decision record.
 */
import { requirementsToTestPlanAdapter } from "../../../apps/web/lib/tools/server/adapters/requirements-to-test-plan";
import { notesToActionPlanAdapter } from "../../../apps/web/lib/tools/server/adapters/notes-to-action-plan";
import { textToCitedTimelineAdapter } from "../../../apps/web/lib/tools/server/adapters/text-to-cited-timeline";
import { testPlanEvalCases, testPlanModelResponses } from "../../../apps/web/lib/tools/test-plan/eval-cases";
import { actionPlanEvalCases, actionPlanModelResponses } from "../../../apps/web/lib/tools/action-plan/eval-cases";
import { timelineEvalCases, timelineModelResponses } from "../../../apps/web/lib/tools/timeline/eval-cases";
import { toMarkdown as testPlanMarkdown, toExportJson as testPlanJson } from "../../../apps/web/lib/tools/test-plan/export";
import { toMarkdown as actionPlanMarkdown, toExportJson as actionPlanJson } from "../../../apps/web/lib/tools/action-plan/export";
import { initialReview } from "../../../apps/web/lib/tools/action-plan/plan-state";
import { initialTimelineReview, toMarkdown as timelineMarkdown, toExportJson as timelineJson, toTimelineAiImport } from "../../../apps/web/lib/tools/timeline/review";
import type { ToolSlug } from "../../../apps/web/lib/tools/types";
import type { ToolAdapter } from "../../../apps/web/lib/tools/server/adapter";
import type { TestPlan } from "../../../apps/web/lib/tools/test-plan/schema";
import type { ActionPlan } from "../../../apps/web/lib/tools/action-plan/schema";
import type { CitedTimeline } from "../../../apps/web/lib/tools/timeline/schema";
import { actionPlanScorer, testPlanScorer, timelineScorer, type DomainScorer } from "./scorers";

/** The six case kinds every MVP tool must cover (#679). */
export const REQUIRED_KINDS = ["normal", "ambiguous", "sparse", "contradictory", "over-limit", "prompt-injection"] as const;

export interface EvalCase {
  id: string;
  /** Normalized to the shared vocabulary where a tool uses its own name. */
  kind: string;
  input: unknown;
  expect: { fixtureOutcome: "ok" | "invalid_input" | "input_too_large" } & Record<string, unknown>;
}

/**
 * A canned provider response that exercises the server's post-call checks.
 * `expect` says what must survive: "clean" (nothing to remove), "degraded"
 * (something removed, with UI-safe notes), or "rejected" (invalid_output).
 */
export interface AdversarialCase {
  id: string;
  /** The dataset case whose input this response answers. */
  caseId: string;
  response: unknown;
  expect: "clean" | "degraded" | "rejected";
  /** What kind of model failure it represents, for the report. */
  failure: "none" | "untraceable" | "unsupported-claim" | "false-precision" | "injection-followed" | "structure";
}

export interface ToolSuite<TOutput> {
  slug: ToolSlug;
  adapter: ToolAdapter<unknown, TOutput>;
  cases: EvalCase[];
  adversarial: AdversarialCase[];
  scorer: DomainScorer<TOutput>;
  /** Renders every export format for an output, so export compatibility is scored. */
  exports(output: TOutput): { format: string; text: string }[];
  /** Maps a tool-specific case kind to the shared vocabulary. */
  kindAlias?: Record<string, string>;
}

const FIXED_DATE = new Date("2026-01-01T00:00:00Z");

const testPlan: ToolSuite<TestPlan> = {
  slug: "requirements-to-test-plan",
  adapter: requirementsToTestPlanAdapter as ToolAdapter<unknown, TestPlan>,
  cases: testPlanEvalCases,
  adversarial: [
    { id: "good", caseId: "normal-checkout-discount", response: testPlanModelResponses.good, expect: "clean", failure: "none" },
    { id: "partly-untraceable", caseId: "normal-checkout-discount", response: testPlanModelResponses.partlyUntraceable, expect: "degraded", failure: "untraceable" },
    { id: "untraceable", caseId: "normal-checkout-discount", response: testPlanModelResponses.untraceable, expect: "rejected", failure: "untraceable" },
    { id: "claims-results", caseId: "normal-checkout-discount", response: testPlanModelResponses.claimsResults, expect: "degraded", failure: "injection-followed" },
  ],
  scorer: testPlanScorer,
  exports: (plan) => {
    const scenarios = plan.scenarios.map((s) => ({ ...s, origin: "fixture" as const }));
    return [
      { format: "json", text: JSON.stringify(testPlanJson(plan, scenarios, FIXED_DATE)) },
      { format: "markdown", text: testPlanMarkdown(plan, scenarios) },
    ];
  },
};

const actionPlan: ToolSuite<ActionPlan> = {
  slug: "notes-to-action-plan",
  adapter: notesToActionPlanAdapter as ToolAdapter<unknown, ActionPlan>,
  cases: actionPlanEvalCases,
  adversarial: [
    { id: "good", caseId: "normal-newsletter-launch", response: actionPlanModelResponses.good, expect: "clean", failure: "none" },
    { id: "dangling-and-duplicate", caseId: "normal-newsletter-launch", response: actionPlanModelResponses.danglingAndDuplicate, expect: "degraded", failure: "structure" },
    { id: "cycle", caseId: "normal-newsletter-launch", response: actionPlanModelResponses.cycle, expect: "degraded", failure: "structure" },
    { id: "invented-deadline", caseId: "normal-newsletter-launch", response: actionPlanModelResponses.inventedDeadline, expect: "degraded", failure: "unsupported-claim" },
    { id: "inferred-assignee", caseId: "normal-newsletter-launch", response: actionPlanModelResponses.inferredAssignee, expect: "degraded", failure: "unsupported-claim" },
    { id: "untraceable", caseId: "normal-newsletter-launch", response: actionPlanModelResponses.untraceable, expect: "rejected", failure: "untraceable" },
    { id: "injected-fields", caseId: "normal-newsletter-launch", response: actionPlanModelResponses.injectedFields, expect: "clean", failure: "injection-followed" },
  ],
  scorer: actionPlanScorer,
  exports: (plan) => {
    const review = initialReview(plan, "fixture");
    return [
      { format: "json", text: JSON.stringify(actionPlanJson(plan, review, FIXED_DATE)) },
      { format: "markdown", text: actionPlanMarkdown(plan, review) },
    ];
  },
};

const timeline: ToolSuite<CitedTimeline> = {
  slug: "text-to-cited-timeline",
  adapter: textToCitedTimelineAdapter as ToolAdapter<unknown, CitedTimeline>,
  cases: timelineEvalCases,
  kindAlias: { exact: "normal", conflict: "contradictory" },
  adversarial: [
    { id: "good", caseId: "partial-dates", response: timelineModelResponses.good, expect: "clean", failure: "none" },
    { id: "false-precision", caseId: "partial-dates", response: timelineModelResponses.falsePrecision, expect: "degraded", failure: "false-precision" },
    { id: "untraceable", caseId: "partial-dates", response: timelineModelResponses.untraceable, expect: "degraded", failure: "untraceable" },
    { id: "nothing-usable", caseId: "partial-dates", response: timelineModelResponses.empty, expect: "rejected", failure: "untraceable" },
    { id: "injected-fields", caseId: "partial-dates", response: timelineModelResponses.injectedFields, expect: "clean", failure: "injection-followed" },
  ],
  scorer: timelineScorer,
  exports: (t) => {
    const review = initialTimelineReview(t, "fixture");
    const accepted = { ...review, events: review.events.map((e) => ({ ...e, status: "accepted" as const })) };
    const handoff = toTimelineAiImport(t, accepted);
    return [
      { format: "json", text: JSON.stringify(timelineJson(t, accepted, FIXED_DATE)) },
      { format: "markdown", text: timelineMarkdown(t, accepted) },
      ...(handoff ? [{ format: "timelineai-events", text: JSON.stringify(handoff) }] : []),
    ];
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous suites share one runner
export const SUITES: ToolSuite<any>[] = [testPlan, actionPlan, timeline];

export function sharedKind(suite: ToolSuite<unknown>, kind: string): string {
  return suite.kindAlias?.[kind] ?? kind;
}
