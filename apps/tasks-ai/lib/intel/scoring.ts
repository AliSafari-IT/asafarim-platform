/**
 * Explainable focus ranking (docs: M08). The score is a weighted sum of
 * **deterministic** factors — every factor, its raw input, and its
 * contribution is returned so the UI can show exactly why a task ranks
 * where it does, and the user can override or re-weight it.
 *
 * Pure and framework-free. No model judgment enters here — model-generated
 * suggestions are a separate, clearly-labelled surface (lib/intel/brief.ts).
 */
export const RULE_VERSION = "focus-rank@1";

export interface FocusInput {
  taskId: string;
  title: string;
  dueDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  estimate: number | null;
  /** how many not-done tasks this one blocks */
  blocks: number;
  /** how many not-done tasks block this one */
  blockedBy: number;
  updatedAt: string;
  isAssignedToViewer: boolean;
  /** viewer's current count of open assigned tasks (workload) */
  viewerOpenCount: number;
}

export interface FactorContribution {
  factor: "urgency" | "impact" | "readiness" | "commitment" | "workload" | "freshness";
  raw: number; // 0..1 normalized input
  weight: number; // effective weight (default × user preference)
  points: number; // raw × weight × 100, rounded
  because: string;
}

export interface FocusScore {
  taskId: string;
  score: number;
  factors: FactorContribution[];
  ruleVersion: string;
}

const DEFAULT_WEIGHTS: Record<FactorContribution["factor"], number> = {
  urgency: 0.35,
  impact: 0.25,
  readiness: 0.15,
  commitment: 0.1,
  workload: 0.1,
  freshness: 0.05,
};

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return (new Date(iso).getTime() - now.getTime()) / 86_400_000;
}

export function scoreTask(
  input: FocusInput,
  now: Date = new Date(),
  userWeights: Partial<Record<FactorContribution["factor"], number>> = {},
): FocusScore {
  const w = (f: FactorContribution["factor"]) =>
    DEFAULT_WEIGHTS[f] * (userWeights[f] ?? 1);

  const d = daysUntil(input.dueDate, now);
  const urgencyRaw =
    d === null ? 0.2 : d < 0 ? 1 : d <= 1 ? 0.9 : d <= 3 ? 0.7 : d <= 7 ? 0.45 : 0.2;
  const urgencyWhy =
    d === null ? "no due date" : d < 0 ? `${Math.abs(Math.round(d))}d overdue` : `due in ${Math.max(0, Math.round(d))}d`;

  const impactRaw = Math.min(1, input.blocks / 4);
  const readinessRaw = input.blockedBy === 0 ? 1 : Math.max(0, 1 - input.blockedBy / 3);
  const commitmentRaw = input.isAssignedToViewer ? 1 : 0.3;
  // Workload is a *dampener*: the more the viewer already has open, the
  // lower the boost — never a per-person score, never surfaced as one.
  const workloadRaw = Math.max(0, 1 - input.viewerOpenCount / 25);
  const staleDays = (now.getTime() - new Date(input.updatedAt).getTime()) / 86_400_000;
  const freshnessRaw = staleDays > 14 ? 0.9 : staleDays > 7 ? 0.6 : 0.2;

  const spec: Omit<FactorContribution, "points">[] = [
    { factor: "urgency", raw: urgencyRaw, weight: w("urgency"), because: urgencyWhy },
    { factor: "impact", raw: impactRaw, weight: w("impact"), because: `blocks ${input.blocks} task(s)` },
    { factor: "readiness", raw: readinessRaw, weight: w("readiness"), because: input.blockedBy ? `blocked by ${input.blockedBy}` : "unblocked" },
    { factor: "commitment", raw: commitmentRaw, weight: w("commitment"), because: input.isAssignedToViewer ? "assigned to you" : "not yours" },
    { factor: "workload", raw: workloadRaw, weight: w("workload"), because: `you have ${input.viewerOpenCount} open` },
    { factor: "freshness", raw: freshnessRaw, weight: w("freshness"), because: `${Math.round(staleDays)}d since update` },
  ];
  const parts: FactorContribution[] = spec.map((p) => ({
    ...p,
    points: Math.round(p.raw * p.weight * 100),
  }));

  return {
    taskId: input.taskId,
    score: parts.reduce((s, p) => s + p.points, 0),
    factors: parts,
    ruleVersion: RULE_VERSION,
  };
}

export function rankTasks(
  inputs: FocusInput[],
  now?: Date,
  userWeights?: Partial<Record<FactorContribution["factor"], number>>,
): FocusScore[] {
  return inputs
    .map((i) => scoreTask(i, now, userWeights))
    // stable tie-break by taskId so the ranking does not jitter between
    // requests with equal scores (ranking-stability requirement).
    .sort((a, b) => b.score - a.score || (a.taskId < b.taskId ? -1 : 1));
}
