/**
 * Deterministic risk / workload signal detectors (docs: M08). Each signal
 * carries its evidence, freshness, confidence, limitations and alternative
 * actions — nothing is a black box, and none of it is a per-person score.
 * Pure: takes a plain snapshot, returns signals.
 */
export const SIGNAL_RULE_VERSION = "signals@1";

export type SignalType =
  | "due_date_risk"
  | "blocker_chain"
  | "stale_work"
  | "workload_imbalance"
  | "unestimated_soon";

export interface Signal {
  type: SignalType;
  severity: "info" | "watch" | "high";
  title: string;
  /** references the reader can open and verify */
  evidence: { kind: string; id: string; label: string }[];
  /** ISO timestamp of the newest fact this signal is derived from */
  freshness: string;
  confidence: number; // 0..1, deterministic rules are high but not 1
  limitations: string;
  alternatives: string[];
  ruleVersion: string;
}

export interface SnapshotTask {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  estimate: number | null;
  updatedAt: string;
  assigneeId: string | null;
  blocks: string[]; // task ids this blocks
  blockedBy: string[]; // task ids blocking this
}

export interface WorkspaceSnapshot {
  now: string;
  tasks: SnapshotTask[];
  /** assigneeId -> display label (never used to rank people) */
  memberLabels: Record<string, string>;
}

const DAY = 86_400_000;

export function detectSignals(s: WorkspaceSnapshot): Signal[] {
  const now = new Date(s.now).getTime();
  const open = s.tasks.filter((t) => !t.completedAt);
  const out: Signal[] = [];

  // 1. Due-date risk: open, due within 3 days OR overdue, and blocked or unestimated.
  for (const t of open) {
    if (!t.dueDate) continue;
    const d = (new Date(t.dueDate).getTime() - now) / DAY;
    if (d > 3) continue;
    const risky = t.blockedBy.length > 0 || t.estimate == null;
    if (!risky && d > 0) continue;
    out.push({
      type: "due_date_risk",
      severity: d < 0 ? "high" : "watch",
      title: `"${t.title}" is ${d < 0 ? "overdue" : `due in ${Math.max(0, Math.round(d))}d`}${t.blockedBy.length ? " and blocked" : t.estimate == null ? " and unestimated" : ""}`,
      evidence: [
        { kind: "task", id: t.id, label: t.title },
        ...t.blockedBy.map((b) => ({ kind: "task", id: b, label: "blocking task" })),
      ],
      freshness: t.updatedAt,
      confidence: t.blockedBy.length ? 0.85 : 0.7,
      limitations: "Based only on due date, dependency links and estimate presence — not on effort remaining.",
      alternatives: ["Re-negotiate the date", "Split the task", "Clear the blocker first"],
      ruleVersion: SIGNAL_RULE_VERSION,
    });
  }

  // 2. Blocker chains: an open task blocking >=2 others, at least one of which is due soon.
  for (const t of open) {
    if (t.blocks.length < 2) continue;
    const downstream = t.blocks
      .map((id) => s.tasks.find((x) => x.id === id))
      .filter((x): x is SnapshotTask => !!x && !x.completedAt);
    const dueSoon = downstream.some((x) => x.dueDate && (new Date(x.dueDate).getTime() - now) / DAY <= 5);
    out.push({
      type: "blocker_chain",
      severity: dueSoon ? "high" : "watch",
      title: `"${t.title}" is blocking ${downstream.length} task(s)${dueSoon ? ", one due within 5 days" : ""}`,
      evidence: [
        { kind: "task", id: t.id, label: t.title },
        ...downstream.slice(0, 5).map((x) => ({ kind: "task", id: x.id, label: x.title })),
      ],
      freshness: t.updatedAt,
      confidence: 0.8,
      limitations: "Counts dependency edges only; does not know which are truly on the critical path.",
      alternatives: ["Prioritize this task", "Remove a dependency that is not real", "Parallelize downstream work"],
      ruleVersion: SIGNAL_RULE_VERSION,
    });
  }

  // 3. Stale work: open, assigned, no update in 14+ days.
  for (const t of open) {
    if (!t.assigneeId) continue;
    const staleDays = (now - new Date(t.updatedAt).getTime()) / DAY;
    if (staleDays < 14) continue;
    out.push({
      type: "stale_work",
      severity: staleDays > 30 ? "watch" : "info",
      title: `"${t.title}" has had no activity for ${Math.round(staleDays)} days`,
      evidence: [{ kind: "task", id: t.id, label: t.title }],
      freshness: t.updatedAt,
      confidence: 0.6,
      limitations: "Silence is not the same as stuck — work may be happening off-tool.",
      alternatives: ["Ask for a status", "Close if no longer needed", "Re-scope"],
      ruleVersion: SIGNAL_RULE_VERSION,
    });
  }

  // 4. Workload imbalance: an assignee's open count is >2.5× the median.
  const counts = new Map<string, number>();
  for (const t of open) if (t.assigneeId) counts.set(t.assigneeId, (counts.get(t.assigneeId) ?? 0) + 1);
  const values = [...counts.values()].sort((a, b) => a - b);
  if (values.length >= 3) {
    const median = values[Math.floor(values.length / 2)];
    for (const [aid, n] of counts) {
      if (median > 0 && n >= median * 2.5 && n >= 5) {
        out.push({
          type: "workload_imbalance",
          severity: "watch",
          title: `One person is holding ${n} open tasks (team median ${median})`,
          // The evidence points at TASKS, not at the person — the label is
          // generic. This is a redistribution prompt, not a scorecard.
          evidence: open
            .filter((t) => t.assigneeId === aid)
            .slice(0, 8)
            .map((t) => ({ kind: "task", id: t.id, label: t.title })),
          freshness: s.now,
          confidence: 0.65,
          limitations: "Counts tasks, not size or difficulty. Says nothing about how hard anyone is working.",
          alternatives: ["Redistribute some tasks", "Defer lower-priority items", "Check the estimates are realistic"],
          ruleVersion: SIGNAL_RULE_VERSION,
        });
      }
    }
  }

  return out.sort((a, b) => sev(b.severity) - sev(a.severity));
}

function sev(s: Signal["severity"]): number {
  return s === "high" ? 2 : s === "watch" ? 1 : 0;
}
