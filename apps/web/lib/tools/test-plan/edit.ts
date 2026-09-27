import type { EditableScenario } from "./export";
import type { Priority, TestCategory } from "./schema";

export interface ScenarioDraft {
  title: string;
  category: TestCategory;
  priority: Priority;
  /** One item per line. */
  preconditions: string;
  /** One step per line. */
  steps: string;
  expected: string;
  assumption: string;
}

export function draftFrom(s: EditableScenario): ScenarioDraft {
  return {
    title: s.title,
    category: s.category,
    priority: s.priority,
    preconditions: s.preconditions.join("\n"),
    steps: s.steps.join("\n"),
    expected: s.expected,
    assumption: s.assumption ?? "",
  };
}

/**
 * Applies a user's edit. Keeps the scenario's id, basis, and source
 * references (a user can't silently turn an inferred risk into a traced
 * requirement), marks it as edited, and enforces the same limits as the
 * output schema.
 */
export function applyScenarioEdit(
  scenario: EditableScenario,
  draft: ScenarioDraft,
): { ok: true; scenario: EditableScenario } | { ok: false; errors: string[] } {
  const lines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  const steps = lines(draft.steps);
  const errors = [
    !draft.title.trim() && "Add a title.",
    !steps.length && "Add at least one step.",
    !draft.expected.trim() && "Add an expected result.",
    scenario.basis === "inferred" && !draft.assumption.trim() && "Inferred scenarios need their assumption.",
  ].filter((e): e is string => Boolean(e));
  if (errors.length) return { ok: false, errors };

  const { assumption: _previous, ...rest } = scenario;
  return {
    ok: true,
    scenario: {
      ...rest,
      title: draft.title.trim().slice(0, 300),
      category: draft.category,
      priority: draft.priority,
      preconditions: lines(draft.preconditions).slice(0, 8).map((l) => l.slice(0, 300)),
      steps: steps.slice(0, 15).map((l) => l.slice(0, 300)),
      expected: draft.expected.trim().slice(0, 1000),
      ...(scenario.basis === "inferred" ? { assumption: draft.assumption.trim().slice(0, 300) } : {}),
      origin: "edited",
    },
  };
}
