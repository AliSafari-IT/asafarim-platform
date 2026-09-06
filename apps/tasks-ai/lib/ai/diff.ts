import type { Operation } from "./types";

/**
 * Turn a proposal's operations into a review model grouped by
 * create / update / link (docs: M07 "proposal diffs grouped by
 * create/update/link operations"). Pure so the grouping + edit-distance
 * are unit-tested without React or a database.
 */
export interface DiffGroup {
  kind: "create" | "update" | "link";
  items: { index: number; op: Operation; grounded: boolean; confidence: number }[];
}

export function groupOperations(ops: Operation[]): DiffGroup[] {
  const groups: Record<DiffGroup["kind"], DiffGroup["items"]> = { create: [], update: [], link: [] };
  ops.forEach((op, index) => {
    const grounded = op.citations.some((c) => c.span !== null && !c.assumption);
    const bucket = op.op === "create_task" ? "create" : op.op === "update_task" ? "update" : "link";
    groups[bucket].push({ index, op, grounded, confidence: op.confidence });
  });
  return (["create", "update", "link"] as const)
    .filter((k) => groups[k].length > 0)
    .map((k) => ({ kind: k, items: groups[k] }));
}

/**
 * Normalized edit distance in [0,1] between the generated ops and the ops
 * the user actually applied. 0 = applied verbatim. Feeds the acceptance /
 * edit-distance KPI.
 */
export function editDistance(generated: Operation[], applied: Operation[]): number {
  if (generated.length === 0 && applied.length === 0) return 0;
  const g = generated.map(canonical);
  const a = applied.map(canonical);
  const kept = a.filter((x) => g.includes(x)).length;
  const added = a.length - kept;
  const removed = g.filter((x) => !a.includes(x)).length;
  const denom = Math.max(g.length, a.length, 1);
  return Math.min(1, (added + removed) / denom);
}

function canonical(op: Operation): string {
  if (op.op === "create_task") {
    return `c:${op.fields.title.trim().toLowerCase()}:${op.fields.parentRef ?? ""}`;
  }
  if (op.op === "update_task") {
    return `u:${op.taskId}:${JSON.stringify(op.fields)}`;
  }
  return `l:${op.fromRef}:${op.toRef}:${op.kind}`;
}

/** Cheap intra-proposal duplicate hint: near-identical create titles. */
export function duplicateHints(ops: Operation[]): { a: number; b: number; title: string }[] {
  const creates = ops
    .map((op, i) => ({ i, op }))
    .filter((x): x is { i: number; op: Extract<Operation, { op: "create_task" }> } => x.op.op === "create_task");
  const hints: { a: number; b: number; title: string }[] = [];
  for (let i = 0; i < creates.length; i++) {
    for (let j = i + 1; j < creates.length; j++) {
      if (similar(creates[i].op.fields.title, creates[j].op.fields.title)) {
        hints.push({ a: creates[i].i, b: creates[j].i, title: creates[i].op.fields.title });
      }
    }
  }
  return hints;
}

function similar(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  const sa = new Set(na.split(" "));
  const sb = new Set(nb.split(" "));
  const inter = [...sa].filter((w) => sb.has(w)).length;
  return inter / Math.max(sa.size, sb.size) >= 0.7;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
