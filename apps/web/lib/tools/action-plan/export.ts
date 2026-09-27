import { escapeMd } from "../test-plan/export";
import type { EditableDependency, EditableTask, ItemOrigin, PlanReviewState } from "./plan-state";
import { ACTION_PLAN_SCHEMA_VERSION, BASIS_LABELS, type ActionPlan, type Basis, type Milestone } from "./schema";

export const EXPORT_NOTICE =
  "Draft plan for review: nobody has been assigned, no deadlines were added, and nothing has been scheduled or sent anywhere.";

export const ORIGIN_LABEL: Record<ItemOrigin, string> = {
  ai: "AI draft",
  example: "example",
  fixture: "sample",
  edited: "edited by you",
  added: "added by you",
};

/**
 * What goes out: the selected tasks in the user's order, the dependencies
 * between them, and the milestones that still have tasks. Anything left out
 * because one end was removed or unselected is listed, never silently lost.
 */
export function exportSelection(plan: ActionPlan, review: Pick<PlanReviewState, "tasks" | "dependencies" | "selected">) {
  const chosen = new Set(review.selected);
  const tasks = review.tasks.filter((t) => chosen.has(t.id));
  const ids = new Set(tasks.map((t) => t.id));
  const dependencies = review.dependencies.filter((d) => ids.has(d.from) && ids.has(d.to));
  const omitted: string[] = review.dependencies
    .filter((d) => !ids.has(d.from) || !ids.has(d.to))
    .map((d) => `${d.id} (${d.from} → ${d.to}) left out: ${[d.from, d.to].filter((id) => !ids.has(id)).join(" and ")} ${[d.from, d.to].filter((id) => !ids.has(id)).length === 1 ? "isn't" : "aren't"} in this export.`);
  const milestones: Milestone[] = [];
  for (const m of plan.milestones) {
    const kept = m.taskIds.filter((id) => ids.has(id));
    const missing = m.taskIds.filter((id) => !ids.has(id));
    if (!kept.length) omitted.push(`${m.id} (${m.title}) left out: none of its tasks are in this export.`);
    else {
      if (missing.length) omitted.push(`${m.id} (${m.title}) exported without ${missing.join(", ")}.`);
      milestones.push({ ...m, taskIds: kept });
    }
  }
  return { tasks, dependencies, milestones, omitted };
}

export interface ActionPlanExport {
  schemaVersion: typeof ACTION_PLAN_SCHEMA_VERSION;
  exportedAt: string;
  notice: string;
  plan: Omit<ActionPlan, "tasks" | "dependencies"> & { tasks: EditableTask[]; dependencies: EditableDependency[] };
  omitted: string[];
}

export function toExportJson(plan: ActionPlan, review: Pick<PlanReviewState, "tasks" | "dependencies" | "selected">, now = new Date()): ActionPlanExport {
  const { tasks, dependencies, milestones, omitted } = exportSelection(plan, review);
  return {
    schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    notice: EXPORT_NOTICE,
    plan: { ...plan, tasks: tasks.map((t) => ({ ...t })), dependencies: dependencies.map((d) => ({ ...d })), milestones },
    omitted,
  };
}

function basisLine(item: { basis: Basis; sourceIds: string[]; rationale?: string }, sources: Map<string, string>): string {
  const label = BASIS_LABELS[item.basis].label;
  const quotes = item.sourceIds.map((id) => `${id} "${escapeMd(sources.get(id) ?? "")}"`).join("; ");
  if (item.basis === "inference" || item.basis === "recommendation") {
    return `_${label}:_ ${escapeMd(item.rationale ?? "")}${quotes ? ` (related: ${quotes})` : ""}`;
  }
  return `_${label}:_ ${quotes}`;
}

export function toMarkdown(plan: ActionPlan, review: Pick<PlanReviewState, "tasks" | "dependencies" | "selected">): string {
  const { tasks, dependencies, milestones, omitted } = exportSelection(plan, review);
  const sources = new Map(plan.sources.map((s) => [s.id, s.text]));
  const out: string[] = [
    `# Action plan: ${escapeMd(plan.title)}`,
    "",
    `> ${EXPORT_NOTICE}`,
    "",
    "## Objective",
    "",
    escapeMd(plan.objective),
    "",
    "## Scope",
    "",
    escapeMd(plan.scope),
    "",
  ];

  if (plan.decisions.length) {
    out.push("## Decisions already made", "");
    for (const d of plan.decisions) out.push(`- **${d.id}** ${escapeMd(d.decision)} — ${basisLine(d, sources)}`);
    out.push("");
  }

  out.push("## Tasks (in suggested order)", "");
  tasks.forEach((t, i) => {
    out.push(`### ${i + 1}. ${t.id} — ${escapeMd(t.title)}`, "");
    if (t.description) out.push(escapeMd(t.description), "");
    out.push(`- ${basisLine(t, sources)}`);
    if (t.effort) out.push(`- **Effort (estimate):** ${t.effort.low}–${t.effort.high} ${t.effort.unit}`);
    const waits = dependencies.filter((d) => d.to === t.id).map((d) => d.from);
    if (waits.length) out.push(`- **Waits for:** ${waits.join(", ")}`);
    out.push(`- **Origin:** ${ORIGIN_LABEL[t.origin]}`, "");
  });

  if (dependencies.length) {
    out.push("## Dependencies", "", "| Id | First | Then | Why | Basis |", "| --- | --- | --- | --- | --- |");
    for (const d of dependencies) out.push(`| ${d.id} | ${d.from} | ${d.to} | ${escapeMd(d.reason)} | ${basisLine(d, sources)} |`);
    out.push("");
  }

  if (milestones.length) {
    out.push("## Milestones (checkpoints, not dates)", "");
    for (const m of milestones) out.push(`- **${m.id}** ${escapeMd(m.title)}: ${m.taskIds.join(", ")} — ${basisLine(m, sources)}`);
    out.push("");
  }

  if (plan.risks.length) {
    out.push("## Risks", "");
    for (const r of plan.risks) {
      out.push(`- **${r.id}** ${escapeMd(r.risk)}${r.mitigation ? ` _Mitigation:_ ${escapeMd(r.mitigation)}` : ""} — ${basisLine(r, sources)}`);
    }
    out.push("");
  }

  if (plan.questions.length) {
    out.push("## Open questions", "");
    for (const q of plan.questions) out.push(`- **${q.id}** ${escapeMd(q.question)}${q.sourceIds.length ? ` _(${q.sourceIds.join(", ")})_` : ""}`);
    out.push("");
  }

  if (omitted.length) out.push("## Left out of this export", "", ...omitted.map((o) => `- ${escapeMd(o)}`), "");

  out.push("## Source text", "", ...plan.sources.map((s) => `- **${s.id}** ${escapeMd(s.text)}`), "");
  return out.join("\n");
}
