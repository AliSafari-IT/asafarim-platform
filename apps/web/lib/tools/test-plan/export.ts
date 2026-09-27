import { CATEGORY_LABELS, TEST_CATEGORIES, TEST_PLAN_SCHEMA_VERSION, type Scenario, type TestCategory, type TestPlan } from "./schema";

/** Where a scenario in the editor came from, kept for export. */
export type ScenarioOrigin = "ai" | "example" | "fixture" | "edited";

export interface EditableScenario extends Scenario {
  origin: ScenarioOrigin;
}

/**
 * Planned-scenario counts per category. Explicitly *planned*, never
 * "covered" or "tested": nothing here was executed.
 */
export function plannedCounts(scenarios: readonly Pick<Scenario, "category">[]): Record<TestCategory, number> {
  const counts = Object.fromEntries(TEST_CATEGORIES.map((c) => [c, 0])) as Record<TestCategory, number>;
  for (const s of scenarios) counts[s.category] += 1;
  return counts;
}

export interface TestPlanExport {
  schemaVersion: typeof TEST_PLAN_SCHEMA_VERSION;
  exportedAt: string;
  notice: string;
  plan: Omit<TestPlan, "scenarios"> & { scenarios: (Scenario & { origin: ScenarioOrigin })[] };
}

export const EXPORT_NOTICE =
  "Planning assistance only: these scenarios have not been executed and are not evidence that anything was tested.";

export function toExportJson(plan: TestPlan, selected: readonly EditableScenario[], now = new Date()): TestPlanExport {
  return {
    schemaVersion: TEST_PLAN_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    notice: EXPORT_NOTICE,
    plan: { ...plan, scenarios: selected.map((s) => ({ ...s })) },
  };
}

const ORIGIN_LABEL: Record<ScenarioOrigin, string> = {
  ai: "AI draft",
  example: "example",
  fixture: "sample",
  edited: "edited by you",
};

export function toMarkdown(plan: TestPlan, selected: readonly EditableScenario[]): string {
  const sources = new Map(plan.sources.map((s) => [s.id, s.text]));
  const out: string[] = [`# Test plan: ${escapeMd(plan.title)}`, "", `> ${EXPORT_NOTICE}`, "", "## Summary", "", escapeMd(plan.summary), ""];

  if (plan.actors.length) out.push(`**Actors:** ${plan.actors.map(escapeMd).join(", ")}`, "");
  if (plan.goals.length) out.push("**Goals:**", ...plan.goals.map((g) => `- ${escapeMd(g)}`), "");

  if (plan.questions.length) {
    out.push("## Open questions", "");
    for (const q of plan.questions) {
      out.push(`- **${q.id}** (${q.kind}) ${escapeMd(q.question)}${refs(q.sourceIds)}`);
    }
    out.push("");
  }

  const counts = plannedCounts(selected);
  out.push("## Planned scenarios by category", "", "| Category | Planned |", "| --- | --- |");
  for (const c of TEST_CATEGORIES) if (counts[c]) out.push(`| ${CATEGORY_LABELS[c]} | ${counts[c]} |`);
  out.push("", "## Scenarios", "");

  for (const s of selected) {
    out.push(`### ${s.id} — ${escapeMd(s.title)}`, "");
    out.push(`- **Category:** ${CATEGORY_LABELS[s.category]}`, `- **Priority:** ${s.priority}`);
    out.push(
      s.basis === "requirement"
        ? `- **Traces to:** ${s.sourceIds.map((id) => `${id} "${escapeMd(sources.get(id) ?? "")}"`).join("; ")}`
        : `- **Inferred risk — assumption:** ${escapeMd(s.assumption ?? "")}`
    );
    out.push(`- **Origin:** ${ORIGIN_LABEL[s.origin]}`, "");
    if (s.preconditions.length) out.push("**Preconditions**", "", ...s.preconditions.map((p) => `- ${escapeMd(p)}`), "");
    out.push("**Steps**", "", ...s.steps.map((step, i) => `${i + 1}. ${escapeMd(step)}`), "");
    out.push("**Expected result**", "", escapeMd(s.expected), "");
  }

  out.push("## Source text", "", ...plan.sources.map((s) => `- **${s.id}** ${escapeMd(s.text)}`), "");
  return out.join("\n");
}

function refs(ids: string[]): string {
  return ids.length ? ` _(${ids.join(", ")})_` : "";
}

/** Neutralize Markdown/HTML so pasted text can't inject links, images, or markup. */
export function escapeMd(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+!|<>]/g, (c) => `\\${c}`).replace(/\r?\n/g, " ");
}
