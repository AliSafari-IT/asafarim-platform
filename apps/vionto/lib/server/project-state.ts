/**
 * Vionto project lifecycle state machine.
 *
 * The canonical states the AI-director workflow moves through. The backend
 * persists `ViontoProject.status`; the frontend restores the workflow from it
 * (no reliance on browser-only state).
 *
 * Phase A introduces the machine as the source of truth for allowed
 * transitions. Existing routes keep writing their legacy status strings until
 * later phases adopt `assertTransition`; the legacy values are mapped below so
 * both vocabularies coexist during migration.
 */

export const PROJECT_STATES = [
  "DRAFT",
  "UPLOADING",
  "PROCESSING_IMAGES",
  "READY_FOR_ANALYSIS",
  "ANALYZING",
  "ANALYSIS_READY",
  "STORY_DRAFT",
  "SCENE_PLAN_READY",
  "GENERATING_NARRATION",
  "READY_FOR_PREVIEW",
  "RENDERING_PREVIEW",
  "PREVIEW_READY",
  "RENDERING_FINAL",
  "COMPLETED",
  "FAILED",
] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];

/** States from which no forward progress is expected without user action. */
export const TERMINAL_STATES: ProjectState[] = ["COMPLETED", "FAILED"];

/**
 * Allowed forward transitions. `FAILED` is reachable from any non-terminal
 * state (handled in `canTransition`), so it is not enumerated per-state.
 * A project may also loop back for edits (e.g. PREVIEW_READY → STORY_DRAFT).
 */
const TRANSITIONS: Record<ProjectState, ProjectState[]> = {
  DRAFT: ["UPLOADING"],
  UPLOADING: ["PROCESSING_IMAGES", "DRAFT"],
  PROCESSING_IMAGES: ["READY_FOR_ANALYSIS"],
  READY_FOR_ANALYSIS: ["ANALYZING", "UPLOADING"],
  ANALYZING: ["ANALYSIS_READY"],
  ANALYSIS_READY: ["STORY_DRAFT", "UPLOADING"],
  STORY_DRAFT: ["SCENE_PLAN_READY", "STORY_DRAFT"],
  SCENE_PLAN_READY: ["GENERATING_NARRATION", "STORY_DRAFT", "SCENE_PLAN_READY"],
  GENERATING_NARRATION: ["READY_FOR_PREVIEW", "SCENE_PLAN_READY"],
  READY_FOR_PREVIEW: ["RENDERING_PREVIEW", "SCENE_PLAN_READY", "STORY_DRAFT"],
  RENDERING_PREVIEW: ["PREVIEW_READY"],
  PREVIEW_READY: ["RENDERING_FINAL", "STORY_DRAFT", "SCENE_PLAN_READY", "READY_FOR_PREVIEW"],
  RENDERING_FINAL: ["COMPLETED"],
  COMPLETED: ["STORY_DRAFT", "READY_FOR_PREVIEW"], // re-edit a finished project
  FAILED: ["DRAFT", "STORY_DRAFT", "READY_FOR_PREVIEW", "READY_FOR_ANALYSIS"], // retry paths
};

export function isProjectState(value: unknown): value is ProjectState {
  return typeof value === "string" && (PROJECT_STATES as readonly string[]).includes(value);
}

export function isTerminal(state: ProjectState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Whether `from → to` is a permitted transition. Any live state may FAIL. */
export function canTransition(from: ProjectState, to: ProjectState): boolean {
  if (from === to) return true;
  if (to === "FAILED" && !isTerminal(from)) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throwing variant for use at write sites once routes adopt the machine. */
export function assertTransition(from: ProjectState, to: ProjectState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal project state transition: ${from} → ${to}`);
  }
}

/**
 * Map legacy `ViontoProject.status` strings to canonical states so old rows
 * and un-migrated routes interoperate with the machine.
 */
const LEGACY_MAP: Record<string, ProjectState> = {
  draft: "DRAFT",
  ready: "READY_FOR_PREVIEW",
  rendering: "RENDERING_FINAL",
  completed: "COMPLETED",
  archived: "COMPLETED",
};

export function normalizeStatus(raw: string | null | undefined): ProjectState {
  if (!raw) return "DRAFT";
  if (isProjectState(raw)) return raw;
  return LEGACY_MAP[raw] ?? "DRAFT";
}
