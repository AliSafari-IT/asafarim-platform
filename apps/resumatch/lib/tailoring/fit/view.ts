import { CONSTRAINT_CATEGORIES, type FitAnalysis, type FitCategory, type FitFlag, type FitJudgment, type FitMethod, type FitPriority } from "./contract";
import { applyOverlay } from "./overlay";
import { PRIORITY_WEIGHTS, type FitScore } from "./rubric";
import type { FitContext } from "./service";

/**
 * What the page gets (#971): one row per requirement with its citations
 * resolved to labels from the candidate's own data, the score, and at most
 * three clarification questions. Built on the server; the client never
 * computes a number.
 */

export const MAX_FIT_QUESTIONS = 3;

export interface FitViewCitation {
  sourceId: string;
  kind: "profile" | "evidence" | "preference" | "answer";
  label: string;
  quote: string;
}

export interface FitViewRow {
  id: string;
  quote: string;
  priority: FitPriority;
  /** The priority the analysis read, when the candidate corrected it. */
  priorityCorrectedFrom: FitPriority | null;
  category: FitCategory;
  constraint: boolean;
  essential: boolean;
  groupId: string | null;
  protectedTrait: boolean;
  removed: boolean;
  judgment: FitJudgment;
  citations: FitViewCitation[];
  explanation: string;
  equivalence: { jobTerm: string; profileTerm: string } | null;
  flags: FitFlag[];
  answeredBy: "yes" | "no" | null;
}

export interface FitViewMeta {
  id: string;
  createdAt: string;
  stale: boolean;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
}

export interface FitViewQuestion {
  requirementId: string;
  quote: string;
  priority: FitPriority;
  category: FitCategory;
}

export interface FitView {
  method: FitMethod;
  /** Null for the keyword check, which is never stored. */
  meta: FitViewMeta | null;
  rows: FitViewRow[];
  score: FitScore;
  questions: FitViewQuestion[];
  completeness: FitAnalysis["completeness"];
  validation: FitAnalysis["validation"];
}

export function buildFitView(input: { analysis: FitAnalysis; context: FitContext; score: FitScore; meta: FitViewMeta | null }): FitView {
  const { analysis, context, score, meta } = input;
  const sources = new Map(context.inputs.sources.map((s) => [s.id, s]));
  const rows = applyOverlay(analysis, context.answers, context.corrections).map((row): FitViewRow => {
    const r = row.requirement;
    return {
      id: r.id,
      quote: r.quote,
      priority: r.priority,
      priorityCorrectedFrom: row.priorityCorrectedFrom,
      category: r.category,
      constraint: CONSTRAINT_CATEGORIES.has(r.category) && r.priority !== "preferred",
      essential: r.essential,
      groupId: r.groupId,
      protectedTrait: r.protectedTrait,
      removed: row.removed,
      judgment: row.assessment.judgment,
      citations: row.assessment.citations.map((c) => {
        if (c.sourceId.startsWith("answer:")) return { sourceId: c.sourceId, kind: "answer" as const, label: "", quote: "" };
        const source = sources.get(c.sourceId);
        return { sourceId: c.sourceId, kind: source?.kind ?? "evidence", label: source?.label ?? c.sourceId, quote: c.quote };
      }),
      explanation: row.assessment.explanation,
      equivalence: row.assessment.equivalence,
      flags: row.assessment.flags,
      answeredBy: row.answeredBy,
    };
  });

  // At most three optional questions: requirements nothing answers either
  // way, and essential conditions only partly supported (they still need
  // the candidate's confirmation); never answered, removed, a protected
  // trait, or an alternative of a group another member already meets.
  // Constraints first (they decide suitability), then by weight, then
  // posting order.
  const metGroups = new Set(rows.filter((r) => r.groupId && !r.removed && r.judgment === "direct").map((r) => r.groupId!));
  const questions = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        (row.judgment === "unknown" || (row.judgment === "partial" && row.constraint)) &&
        !row.removed &&
        !row.protectedTrait &&
        row.answeredBy === null &&
        !(row.groupId && metGroups.has(row.groupId)),
    )
    .sort(
      (a, b) =>
        Number(b.row.constraint) - Number(a.row.constraint) ||
        PRIORITY_WEIGHTS[b.row.priority] - PRIORITY_WEIGHTS[a.row.priority] ||
        a.index - b.index,
    )
    .slice(0, MAX_FIT_QUESTIONS)
    .map(({ row }) => ({ requirementId: row.id, quote: row.quote, priority: row.priority, category: row.category }));

  return { method: analysis.method, meta, rows, score, questions, completeness: analysis.completeness, validation: analysis.validation };
}
