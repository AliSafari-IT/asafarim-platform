/**
 * The Inbox rule (issue #366).
 *
 * TasksAI's charter is "capture the resulting work in seconds so nothing
 * depends on memory". That only works if captured work has somewhere to
 * wait. This module is that somewhere, expressed as one small, pure,
 * testable rule so every capture channel — the global Capture action, the
 * command palette, capture-by-email, imports, AI proposals, future
 * integrations — decides identically.
 *
 * THE RULE
 * ────────
 * A task is **in the Inbox** when, and only when:
 *
 *     triagedAt === null && completedAt === null && archivedAt === null
 *
 * `triagedAt` is persisted on the task (see prisma/schema.prisma). It is not
 * a filter over "open tasks": Inbox is *captured work that still needs
 * organizing*, My Work is *planned open work assigned to me*, and the two
 * are different questions. Triaging a task stamps `triagedAt` and the item
 * leaves the Inbox for good — it does not linger there merely because it is
 * still incomplete.
 *
 * WHO LANDS IN THE INBOX
 * ──────────────────────
 * `needsTriage()` below is the single decision point. In prose:
 *
 *   * No destination project chosen  → Inbox. (Capture never silently picks
 *     a project for you; it captures into the workspace Inbox container.)
 *   * Captured into the Inbox container → Inbox, obviously.
 *   * Unattended channels (email, integrations) → Inbox. Nobody was there
 *     to decide anything, so a human still must.
 *   * Imports → triaged, unless the import was explicitly configured to land
 *     in the Inbox for review.
 *   * Manual / quick capture into a real project → triaged. The person
 *     picking the project *is* the triage decision.
 *   * Applied AI proposals → triaged only when the applied task arrives with
 *     real planning context (an assignee or a due date). A proposal that
 *     names neither still needs a human to resolve those, so it lands in the
 *     Inbox rather than pretending to be planned work. Nothing enters the
 *     work graph until the proposal is applied — this rule only decides
 *     where applied work lands.
 *
 * Framework-free on purpose: imported by server services, by the client
 * views model, and by unit tests alike.
 */

/** Provenance of a task. Kept as a widening of the original `source` idea. */
export type CaptureSource =
  | "manual"
  | "quick_capture"
  | "import"
  | "proposal"
  | "email"
  | "integration";

export const CAPTURE_SOURCES: CaptureSource[] = [
  "manual",
  "quick_capture",
  "import",
  "proposal",
  "email",
  "integration",
];

/** Short human label for a source badge in the triage list. */
export const SOURCE_LABEL: Record<CaptureSource, string> = {
  manual: "Added by hand",
  quick_capture: "Quick capture",
  import: "Imported",
  proposal: "From an AI proposal",
  email: "Emailed in",
  integration: "From an integration",
};

export interface TriageDecisionInput {
  source: CaptureSource;
  /** Whether a destination project was actually chosen by a person. */
  hasProject: boolean;
  /** Whether that project is the workspace Inbox container. */
  intoInboxProject?: boolean;
  /** Planning context that arrived with the task. */
  hasAssignee?: boolean;
  hasDueDate?: boolean;
  /** Caller forces the item into the Inbox (e.g. "import for review"). */
  forceInbox?: boolean;
}

/**
 * Should this newly created task wait in the Inbox? `true` means
 * `triagedAt` stays NULL.
 */
export function needsTriage(input: TriageDecisionInput): boolean {
  if (input.forceInbox) return true;
  if (!input.hasProject || input.intoInboxProject) return true;

  switch (input.source) {
    case "email":
    case "integration":
      return true;
    case "proposal":
      // Explicit planning context ⇒ already organized; otherwise a human
      // still has to resolve owner/date, so it waits in the Inbox.
      return !(input.hasAssignee || input.hasDueDate);
    case "import":
    case "manual":
    case "quick_capture":
    default:
      return false;
  }
}

/** `triagedAt` value for a task being created. NULL = waiting in the Inbox. */
export function initialTriagedAt(
  input: TriageDecisionInput,
  now: Date = new Date(),
): Date | null {
  return needsTriage(input) ? null : now;
}

export interface InboxCandidate {
  triagedAt: string | Date | null;
  completedAt: string | Date | null;
  archivedAt?: string | Date | null;
}

/** The rule itself, as a predicate, for UI and tests. */
export function isInInbox(task: InboxCandidate): boolean {
  return task.triagedAt === null && task.completedAt === null && !task.archivedAt;
}

/**
 * What still has to happen before an Inbox item counts as organized. Shown
 * in the triage list so a user can tell what "organized" means rather than
 * guessing.
 */
export function whatIsMissing(task: {
  projectIsInbox: boolean;
  assigneeId: string | null;
  dueDate: string | Date | null;
}): string[] {
  const missing: string[] = [];
  if (task.projectIsInbox) missing.push("project");
  if (!task.assigneeId) missing.push("owner");
  if (!task.dueDate) missing.push("due date");
  return missing;
}

/** Key/name of the workspace Inbox container project. */
export const INBOX_PROJECT_KEY = "INBOX";
export const INBOX_PROJECT_NAME = "Inbox";
export const INBOX_PROJECT_DESCRIPTION =
  "Work captured before anyone decided where it belongs. Triage from the Inbox to move it into a real project.";

/**
 * Plain-language confirmation of where a captured task went. The user must
 * always know — "it worked" is not enough (issue #366, requirement 3).
 */
export function captureDestinationMessage(destination: {
  projectName: string;
  isInbox: boolean;
  triaged: boolean;
}): string {
  if (destination.isInbox) {
    return "Captured to your Inbox. Triage it when you are ready to say where it belongs.";
  }
  return destination.triaged
    ? `Captured to ${destination.projectName}.`
    : `Captured to ${destination.projectName} — it is waiting in the Inbox for review.`;
}
