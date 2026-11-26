import { CONSTRAINT_CATEGORIES, type FitAssessmentItem, type FitJudgment, type FitPriority, type FitRequirement } from "./contract";

/**
 * The fit rubric (#971): every number the candidate sees, computed in code
 * from the judgments. The model never writes a score. Documented, with a
 * worked example, in docs `ventures/resumatch/engineering/job-fit-assessment.md`;
 * any change to a weight, credit, threshold or rounding bumps the version.
 *
 * Background match = Σ weight × credit / Σ weight, over the job's
 * requirements (never the candidate's skills), rounded half up to a whole
 * percent. Unknown requirements stay in the denominator at zero credit, so
 * missing information can only lower the number, never inflate it; how much
 * is unknown is shown separately as "information completeness".
 */

export const FIT_RUBRIC_VERSION = "fit_rubric@1";

/** Required items weigh three times a preferred one; an unclear one sits
 *  between, so a misread priority moves the score less. */
export const PRIORITY_WEIGHTS: Record<FitPriority, number> = { required: 3, unclear: 2, preferred: 1 };

/** Credit per judgment. Partial (transferable) is half; unknown, unmet and
 *  conflicting earn nothing. */
export const JUDGMENT_CREDIT: Record<FitJudgment, number> = { direct: 1, partial: 0.5, unknown: 0, unmet: 0, conflict: 0 };

/** The percentage is not shown below this many scored requirements. */
export const MIN_SCORED_UNITS = 3;
/** Nor when less than this share (by weight) of the job is known either way:
 *  a number made mostly of unknowns would read as "0% fit". */
export const MIN_COMPLETENESS = 30;
/** Display bands. Not a probability, a percentile or an ATS score. */
export const STRONG_MATCH = 70;
export const PARTIAL_MATCH = 40;
/** Evidence sufficiency, from completeness alone (no model certainty). */
export const GOOD_SUFFICIENCY = 75;
export const FAIR_SUFFICIENCY = 50;
/** The low-fit warning before tailoring (a question, never a block): any
 *  unmet essential condition; a match below LOW_FIT_MATCH with at least
 *  LOW_FIT_MIN_COMPLETENESS known; or, with at least
 *  NOTHING_SUPPORTED_MIN_REQUIRED required items, none of them supported
 *  even partly (an off-scope job, where everything is merely unknown). */
export const LOW_FIT_MATCH = 40;
export const LOW_FIT_MIN_COMPLETENESS = 50;
export const NOTHING_SUPPORTED_MIN_REQUIRED = 3;

export type LowFitReason = "essential_unmet" | "low_match" | "nothing_supported";

export interface FitRow {
  requirement: FitRequirement;
  assessment: FitAssessmentItem;
  /** The candidate removed it ("not a requirement"): shown, not scored. */
  removed: boolean;
  /** The priority before the candidate's correction, or null. */
  priorityCorrectedFrom: FitPriority | null;
  /** The candidate's own answer decided the judgment. */
  answeredBy: "yes" | "no" | null;
}

export interface FitUnit {
  /** The requirement ids in this unit: one, or an OR group's members. */
  requirementIds: string[];
  priority: FitPriority;
  weight: number;
  judgment: FitJudgment;
  credit: number;
  /** A constraint category: partial never counts as met. */
  constraint: boolean;
}

export type SuitabilityStatus = "supported" | "unmet" | "needs_confirmation";
export type SuitabilityOverall = "unmet_essential" | "needs_confirmation" | "no_blockers" | "none_stated";

export interface SuitabilityItem {
  requirementId: string;
  status: SuitabilityStatus;
}

export type MatchBand = "strong" | "partial" | "limited";
export type Sufficiency = "good" | "fair" | "limited";
export type SuppressedReason = "too_few_requirements" | "too_little_known" | "profile_too_thin";

export interface FitScore {
  rubricVersion: string;
  /** Null when suppressed. Whole percent. */
  percent: number | null;
  suppressed: SuppressedReason | null;
  band: MatchBand | null;
  earned: number;
  possible: number;
  /** Share of the job's weight judged either way (not unknown), whole percent. */
  completeness: number;
  sufficiency: Sufficiency;
  counts: Record<FitJudgment, number>;
  units: FitUnit[];
  suitability: { overall: SuitabilityOverall; items: SuitabilityItem[] };
  /** Requirement ids, most important first. */
  strengths: string[];
  transferable: string[];
  gaps: string[];
  /** The low-fit warning applies before tailoring. */
  lowFit: boolean;
  lowFitReason: LowFitReason | null;
}

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** Partial support for a constraint (a licence, a language level, on-site
 *  work) is not support: it needs the candidate's confirmation. */
function creditOf(judgment: FitJudgment, constraint: boolean): number {
  if (constraint && judgment === "partial") return 0;
  return JUDGMENT_CREDIT[judgment];
}

const JUDGMENT_RANK: Record<FitJudgment, number> = { direct: 4, partial: 3, conflict: 2, unmet: 1, unknown: 0 };

function isConstraint(requirement: FitRequirement): boolean {
  return CONSTRAINT_CATEGORIES.has(requirement.category) && requirement.priority !== "preferred";
}

/** One unit per requirement, or per OR group (its best member counts). */
export function scoringUnits(rows: FitRow[]): FitUnit[] {
  const scored = rows.filter((r) => !r.removed && !r.requirement.protectedTrait);
  const groups = new Map<string, FitRow[]>();
  const order: string[] = [];
  for (const row of scored) {
    const key = row.requirement.groupId ? `g:${row.requirement.groupId}` : `r:${row.requirement.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(row);
  }
  return order.map((key) => {
    const members = groups.get(key)!;
    const priority = members.reduce<FitPriority>(
      (best, m) => (PRIORITY_WEIGHTS[m.requirement.priority] > PRIORITY_WEIGHTS[best] ? m.requirement.priority : best),
      members[0]!.requirement.priority,
    );
    const constraint = members.every((m) => isConstraint(m.requirement));
    let best = members[0]!;
    for (const m of members) {
      const a = creditOf(m.assessment.judgment, constraint);
      const b = creditOf(best.assessment.judgment, constraint);
      if (a > b || (a === b && JUDGMENT_RANK[m.assessment.judgment] > JUDGMENT_RANK[best.assessment.judgment])) best = m;
    }
    return {
      requirementIds: members.map((m) => m.requirement.id),
      priority,
      weight: PRIORITY_WEIGHTS[priority],
      judgment: best.assessment.judgment,
      credit: creditOf(best.assessment.judgment, constraint),
      constraint,
    };
  });
}

export interface ScoreOptions {
  /** The candidate's profile has almost nothing to compare (no roles,
   *  fewer than three skills, no confirmed evidence). */
  profileTooThin: boolean;
}

export function scoreFit(rows: FitRow[], options: ScoreOptions): FitScore {
  const units = scoringUnits(rows);
  const possible = units.reduce((n, u) => n + u.weight, 0);
  const earned = units.reduce((n, u) => n + u.weight * u.credit, 0);
  const knownWeight = units.filter((u) => u.judgment !== "unknown").reduce((n, u) => n + u.weight, 0);
  const completeness = possible > 0 ? roundHalfUp((knownWeight / possible) * 100) : 0;
  const counts: Record<FitJudgment, number> = { direct: 0, partial: 0, unknown: 0, unmet: 0, conflict: 0 };
  for (const u of units) counts[u.judgment] += 1;

  const suppressed: SuppressedReason | null = options.profileTooThin
    ? "profile_too_thin"
    : units.length < MIN_SCORED_UNITS
      ? "too_few_requirements"
      : completeness < MIN_COMPLETENESS
        ? "too_little_known"
        : null;
  const percent = suppressed || possible === 0 ? null : roundHalfUp((earned / possible) * 100);
  const band: MatchBand | null = percent === null ? null : percent >= STRONG_MATCH ? "strong" : percent >= PARTIAL_MATCH ? "partial" : "limited";
  const sufficiency: Sufficiency = completeness >= GOOD_SUFFICIENCY ? "good" : completeness >= FAIR_SUFFICIENCY ? "fair" : "limited";

  // Suitability: constraint requirements (required or unclear), each
  // supported, unmet, or needing the candidate's confirmation. Unknown is
  // never "unmet".
  const live = rows.filter((r) => !r.removed && !r.requirement.protectedTrait);
  const constraintRows = live.filter((r) => isConstraint(r.requirement));
  // OR groups are judged across all their live members, constraint or not:
  // any supported alternative meets the group, and the group is unmet only
  // when every alternative is.
  const members = new Map<string, FitRow[]>();
  for (const r of live) {
    if (!r.requirement.groupId) continue;
    members.set(r.requirement.groupId, [...(members.get(r.requirement.groupId) ?? []), r]);
  }
  const groupMet = (groupId: string) => (members.get(groupId) ?? []).some((m) => m.assessment.judgment === "direct");
  const groupAllUnmet = (groupId: string) => (members.get(groupId) ?? []).every((m) => m.assessment.judgment === "unmet");
  const items: SuitabilityItem[] = [];
  for (const r of constraintRows) {
    const groupId = r.requirement.groupId;
    if (groupId && groupMet(groupId) && r.assessment.judgment !== "direct") continue;
    const unmet = r.assessment.judgment === "unmet" && (!groupId || groupAllUnmet(groupId));
    items.push({
      requirementId: r.requirement.id,
      status: r.assessment.judgment === "direct" ? "supported" : unmet ? "unmet" : "needs_confirmation",
    });
  }
  const effective = items;
  const essentialUnmet = effective.some((i) => {
    const row = constraintRows.find((r) => r.requirement.id === i.requirementId)!;
    return i.status === "unmet" && (row.requirement.essential || row.requirement.priority === "required");
  });
  const overall: SuitabilityOverall = essentialUnmet
    ? "unmet_essential"
    : effective.some((i) => i.status !== "supported")
      ? "needs_confirmation"
      : effective.length > 0
        ? "no_blockers"
        : "none_stated";

  const weightOf = (r: FitRow) => PRIORITY_WEIGHTS[r.requirement.priority];
  const byWeight = (a: FitRow, b: FitRow) => weightOf(b) - weightOf(a);
  const strengths = live.filter((r) => r.assessment.judgment === "direct").sort(byWeight).map((r) => r.requirement.id);
  const transferable = live.filter((r) => r.assessment.judgment === "partial").sort(byWeight).map((r) => r.requirement.id);
  const gaps = live
    .filter((r) => r.requirement.priority !== "preferred" && ["unmet", "conflict", "unknown"].includes(r.assessment.judgment))
    .sort((a, b) => byWeight(a, b) || gapRank(a) - gapRank(b))
    .map((r) => r.requirement.id);

  const required = units.filter((u) => u.priority === "required");
  const lowFitReason: LowFitReason | null =
    overall === "unmet_essential"
      ? "essential_unmet"
      : percent !== null && percent < LOW_FIT_MATCH && completeness >= LOW_FIT_MIN_COMPLETENESS
        ? "low_match"
        : required.length >= NOTHING_SUPPORTED_MIN_REQUIRED && required.every((u) => u.judgment !== "direct" && u.judgment !== "partial")
          ? "nothing_supported"
          : null;
  const lowFit = lowFitReason !== null;

  return {
    rubricVersion: FIT_RUBRIC_VERSION,
    percent,
    suppressed,
    band,
    earned,
    possible,
    completeness,
    sufficiency,
    counts,
    units,
    suitability: { overall, items },
    strengths,
    transferable,
    gaps,
    lowFit,
    lowFitReason,
  };
}

/** Explicit gaps before unknown ones. */
function gapRank(row: FitRow): number {
  return row.assessment.judgment === "unmet" ? 0 : row.assessment.judgment === "conflict" ? 1 : 2;
}
