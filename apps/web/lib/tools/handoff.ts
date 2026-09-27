import { buildHandoff, type HandoffEnvelope, type TasksaiTasksPayload, type TestoraScenariosPayload } from "@asafarim/tool-handoff";
import type { EditableDependency, EditableTask } from "./action-plan/plan-state";
import { exportSelection } from "./action-plan/export";
import { ACTION_PLAN_SCHEMA_VERSION, ACTION_PLAN_TOOL_VERSION, type ActionPlan } from "./action-plan/schema";
import type { EditableScenario } from "./test-plan/export";
import { TEST_PLAN_SCHEMA_VERSION, TEST_PLAN_TOOL_VERSION, type TestPlan } from "./test-plan/schema";
import { toTimelineAiImport, type TimelineReview } from "./timeline/review";
import { CITED_TIMELINE_SCHEMA_VERSION, CITED_TIMELINE_TOOL_VERSION, type CitedTimeline } from "./timeline/schema";

/**
 * Builds the handoff file (#678) from exactly what the visitor reviewed and
 * selected. Runs in the browser; the file is downloaded, never uploaded by
 * Web. See @asafarim/tool-handoff for the contract.
 */
const clip = (text: string, max: number) => text.trim().slice(0, max);

export function testPlanHandoff(plan: TestPlan, selected: readonly EditableScenario[], now?: Date): HandoffEnvelope<"testora"> | null {
  if (!selected.length) return null;
  const sources = new Map(plan.sources.map((s) => [s.id, s.text]));
  const payload: TestoraScenariosPayload = {
    title: clip(plan.title, 200),
    summary: clip(plan.summary, 1_000),
    scenarios: selected.slice(0, 100).map((s) => ({
      ref: s.id,
      title: clip(s.title, 200),
      category: s.category,
      priority: s.priority,
      basis: s.basis === "requirement" ? "extracted" : "inferred",
      preconditions: s.preconditions.slice(0, 20),
      steps: s.steps.slice(0, 20),
      expected: clip(s.expected, 1_000),
      evidence: s.sourceIds.map((id) => sources.get(id) ?? "").filter(Boolean).slice(0, 10),
      ...(s.basis === "inferred" && s.assumption ? { assumption: clip(s.assumption, 1_000) } : {}),
    })),
    questions: plan.questions.map((q) => clip(q.question, 1_000)).slice(0, 20),
  };
  return buildHandoff("testora", { app: "web", tool: "requirements-to-test-plan", toolVersion: TEST_PLAN_TOOL_VERSION, schemaVersion: TEST_PLAN_SCHEMA_VERSION }, payload, { now });
}

const BASIS = { fact: "extracted", constraint: "constraint", inference: "inferred", recommendation: "recommendation" } as const;

export function actionPlanHandoff(
  plan: ActionPlan,
  review: { tasks: EditableTask[]; dependencies: EditableDependency[]; selected: string[] },
  now?: Date
): HandoffEnvelope<"tasksai"> | null {
  const { tasks, dependencies } = exportSelection(plan, review);
  if (!tasks.length) return null;
  const sources = new Map(plan.sources.map((s) => [s.id, s.text]));
  const payload: TasksaiTasksPayload = {
    title: clip(plan.title, 200),
    objective: clip(plan.objective, 1_000),
    tasks: tasks.slice(0, 100).map((t) => ({
      ref: t.id,
      title: clip(t.title, 200),
      description: clip(t.description, 4_000),
      basis: BASIS[t.basis],
      evidence: t.sourceIds.map((id) => sources.get(id) ?? "").filter(Boolean).slice(0, 10),
      ...(t.rationale ? { rationale: clip(t.rationale, 1_000) } : {}),
      ...(t.effort ? { effort: t.effort } : {}),
      waitsFor: dependencies.filter((d) => d.to === t.id).map((d) => d.from).slice(0, 20),
    })),
    risks: plan.risks.map((r) => clip(r.mitigation ? `${r.risk} Mitigation: ${r.mitigation}` : r.risk, 1_000)).slice(0, 20),
    questions: plan.questions.map((q) => clip(q.question, 1_000)).slice(0, 20),
  };
  return buildHandoff("tasksai", { app: "web", tool: "notes-to-action-plan", toolVersion: ACTION_PLAN_TOOL_VERSION, schemaVersion: ACTION_PLAN_SCHEMA_VERSION }, payload, { now });
}

export function timelineHandoff(timeline: CitedTimeline, review: TimelineReview, now?: Date): HandoffEnvelope<"timelineai"> | null {
  const events = toTimelineAiImport(timeline, review);
  if (!events) return null;
  return buildHandoff(
    "timelineai",
    { app: "web", tool: "text-to-cited-timeline", toolVersion: CITED_TIMELINE_TOOL_VERSION, schemaVersion: CITED_TIMELINE_SCHEMA_VERSION },
    { title: clip(timeline.title, 200), summary: clip(timeline.summary, 1_000), ...events.payload },
    { now }
  );
}
