/**
 * Flow metrics (docs: M10). Pure functions over task snapshots so every
 * chart's number is reproducible and unit-tested. Each metric carries a
 * `defVersion` string — the documented semantics version
 * (docs/metric-semantics.md). A metric that talks about *people* is not
 * here; these are all about *work*.
 */
export const METRIC_DEF_VERSION = "flow@1";

export interface FlowTask {
  id: string;
  createdAt: string;
  /** first time it entered an in-progress status, if known */
  startedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
}

const DAY = 86_400_000;

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/** Cycle time (days) percentiles over tasks completed in the window. */
export function cycleTime(tasks: FlowTask[], windowStart: Date, windowEnd: Date) {
  const durations = tasks
    .filter((t) => t.completedAt && inWindow(t.completedAt, windowStart, windowEnd))
    .map((t) => {
      const start = t.startedAt ?? t.createdAt;
      return (new Date(t.completedAt!).getTime() - new Date(start).getTime()) / DAY;
    })
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  return {
    defVersion: METRIC_DEF_VERSION,
    count: durations.length,
    p50: round(pct(durations, 50)),
    p85: round(pct(durations, 85)),
    p95: round(pct(durations, 95)),
  };
}

/** Throughput: completed tasks per day over the window. */
export function throughput(tasks: FlowTask[], windowStart: Date, windowEnd: Date) {
  const completed = tasks.filter((t) => t.completedAt && inWindow(t.completedAt, windowStart, windowEnd)).length;
  const days = Math.max(1, (windowEnd.getTime() - windowStart.getTime()) / DAY);
  return { defVersion: METRIC_DEF_VERSION, completed, perDay: round(completed / days) };
}

/** Aging WIP: how long each still-open task has been open, bucketed. */
export function agingWip(tasks: FlowTask[], now: Date) {
  const open = tasks.filter((t) => !t.completedAt && !t.archivedAt);
  const buckets = { "0-3d": 0, "4-7d": 0, "8-14d": 0, "15-30d": 0, "30d+": 0 };
  for (const t of open) {
    const age = (now.getTime() - new Date(t.startedAt ?? t.createdAt).getTime()) / DAY;
    if (age <= 3) buckets["0-3d"]++;
    else if (age <= 7) buckets["4-7d"]++;
    else if (age <= 14) buckets["8-14d"]++;
    else if (age <= 30) buckets["15-30d"]++;
    else buckets["30d+"]++;
  }
  return { defVersion: METRIC_DEF_VERSION, open: open.length, buckets };
}

/** Predictability: coefficient of variation of weekly throughput (lower = steadier). */
export function predictability(tasks: FlowTask[], now: Date, weeks = 8) {
  const weekly: number[] = [];
  for (let w = 0; w < weeks; w++) {
    const end = new Date(now.getTime() - w * 7 * DAY);
    const start = new Date(end.getTime() - 7 * DAY);
    weekly.push(tasks.filter((t) => t.completedAt && inWindow(t.completedAt, start, end)).length);
  }
  const mean = weekly.reduce((a, b) => a + b, 0) / weekly.length;
  const variance = weekly.reduce((a, b) => a + (b - mean) ** 2, 0) / weekly.length;
  const cv = mean === 0 ? 0 : Math.sqrt(variance) / mean;
  return { defVersion: METRIC_DEF_VERSION, weeklyThroughput: weekly, mean: round(mean), coefficientOfVariation: round(cv) };
}

function inWindow(iso: string, a: Date, b: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= a.getTime() && t <= b.getTime();
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
