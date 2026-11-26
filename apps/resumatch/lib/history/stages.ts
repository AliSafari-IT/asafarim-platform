import type { ApplicationStatusName } from "../applications/constants";

/** Client-safe: the History list imports this, so no server-only imports here. */

/** "Not tracked" is a stage of its own: tailored, never saved as an application. */
export type OutcomeStage = "UNTRACKED" | ApplicationStatusName;

/** Display order: furthest along first, then the ones still open. */
export const OUTCOME_STAGES: readonly OutcomeStage[] = [
  "OFFER",
  "INTERVIEWING",
  "APPLIED",
  "REJECTED",
  "SAVED",
  "UNTRACKED",
];
