import { toUnits } from "../test-plan/sources";
import type { ActionPlanInput, SourceUnit } from "./schema";

/**
 * Numbers the visitor's text into source units: N1… for lines of the notes,
 * C1… for the optional constraints (outcome, horizon, participants). The
 * server builds the prompt from these units and checks every item's
 * references against them, and the UI quotes them next to each item, so
 * evidence never depends on the model copying ids correctly.
 *
 * Deterministic and shared by client and server.
 */
export const MAX_NOTE_UNITS = 76;
const MAX_UNIT_CHARS = 400;

export function splitPlanSources(input: Pick<ActionPlanInput, "notes" | "outcome" | "horizon" | "participants">): SourceUnit[] {
  const units: SourceUnit[] = toUnits(input.notes)
    .slice(0, MAX_NOTE_UNITS)
    .map((text, i) => ({ id: `N${i + 1}`, text: text.slice(0, MAX_UNIT_CHARS), field: "notes" }));
  const constraints: [SourceUnit["field"], string | undefined][] = [
    ["outcome", input.outcome],
    ["horizon", input.horizon],
    ["participants", input.participants],
  ];
  let c = 0;
  for (const [field, text] of constraints) {
    if (text?.trim()) units.push({ id: `C${++c}`, text: text.trim().slice(0, MAX_UNIT_CHARS), field });
  }
  return units;
}

export const FIELD_LABELS: Record<SourceUnit["field"], string> = {
  notes: "notes",
  outcome: "desired outcome",
  horizon: "horizon",
  participants: "participants",
};
