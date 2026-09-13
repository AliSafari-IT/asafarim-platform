/**
 * Workspace-home activation model (issue #365).
 *
 * Pure derivation: given counts taken from the workspace, decide which
 * first-run stage the workspace is in, which checklist steps are already
 * done, and whether the home page should lead with onboarding or with a
 * compact orientation summary. Framework-free so it is unit-testable and
 * usable from both a server component and a client component.
 *
 * Product language rule: nothing here leaks internal concepts (saved-view
 * model, ranking engine, membership ids, proposal operations). The strings
 * are the ones a first-time user reads.
 */

export type ActivationStage =
  /** Nothing exists yet — the workspace is brand new. */
  | "no_projects"
  /** A project exists, but no work has been captured into it. */
  | "no_tasks"
  /** Work exists, but nothing is assigned to the current person. */
  | "no_assigned_work"
  /** The workspace is in normal use for this person. */
  | "active";

/** How the home page should present itself. */
export type HomeMode = "first_run" | "oriented";

export interface WorkspaceHomeCounts {
  /** Active (non-archived) projects the viewer can see. */
  projectCount: number;
  /** Open, non-archived tasks in the workspace. */
  openTaskCount: number;
  /** Open tasks in the workspace that have somebody assigned. */
  assignedAnyCount: number;
  /** Open tasks assigned to the viewer. */
  assignedOpenCount: number;
  /** Viewer's open tasks whose due date has passed. */
  overdueCount: number;
  /** Viewer's open tasks due today. */
  dueTodayCount: number;
  /** Open tasks nobody owns yet — the triage pile. */
  unassignedCount: number;
  /** Tasks ever completed in this workspace. */
  completedCount: number;
  /** AI drafts waiting for a human decision. */
  pendingProposalCount: number;
  /** Whether the AI layer is switched on for this workspace. */
  aiEnabled: boolean;
}

export interface HomeProject {
  id: string;
  key: string;
  name: string;
  openCount: number;
}

export interface HomeTask {
  id: string;
  title: string;
  projectKey: string;
  dueDate: string | null;
}

/**
 * Everything the home page renders. Declared in this pure module (not in
 * the server-only service) so the client component can import the type
 * without reaching into a server module.
 */
export interface WorkspaceHomeData {
  counts: WorkspaceHomeCounts;
  /** A handful of projects for orientation — never the whole Projects page. */
  projects: HomeProject[];
  /** A short peek at the viewer's next work; My Work owns the full list. */
  myNext: HomeTask[];
  /** The first project the viewer can capture into, if any. */
  defaultProjectId: string | null;
  latestProposal: { state: string; summary: string | null; at: string } | null;
}

export type StepState = "done" | "current" | "todo";

export interface ActivationStep {
  id: "project" | "capture" | "plan" | "execute";
  /** Short imperative title, e.g. "Create a project". */
  title: string;
  /** One plain sentence explaining why the step matters. */
  description: string;
  state: StepState;
}

/** Which stage of first-run the workspace is in, for this viewer. */
export function activationStage(counts: WorkspaceHomeCounts): ActivationStage {
  if (counts.projectCount === 0) return "no_projects";
  if (counts.openTaskCount === 0 && counts.completedCount === 0) return "no_tasks";
  if (counts.assignedOpenCount === 0) return "no_assigned_work";
  return "active";
}

/**
 * Onboarding leads only while the workspace genuinely has nothing to show.
 * Once work exists the page becomes an orientation surface — a person with
 * no assigned work still gets the dashboard, plus a targeted explanation.
 */
export function homeMode(stage: ActivationStage): HomeMode {
  return stage === "no_projects" || stage === "no_tasks" ? "first_run" : "oriented";
}

const STEP_COPY: { id: ActivationStep["id"]; title: string; description: string }[] = [
  {
    id: "project",
    title: "Create a project",
    description: "A project is the place tasks, plans, and AI drafts land.",
  },
  {
    id: "capture",
    title: "Add work",
    description: "Type a task, paste meeting notes into Copilot, or import a list you already keep.",
  },
  {
    id: "plan",
    title: "Plan and assign",
    description: "Give the work an owner and a date so it can be trusted.",
  },
  {
    id: "execute",
    title: "Execute from My Work",
    description: "My Work is your own list; Focus suggests what deserves attention next.",
  },
];

/** The four-step recommended first workflow, marked against real data. */
export function activationChecklist(counts: WorkspaceHomeCounts): ActivationStep[] {
  const done: Record<ActivationStep["id"], boolean> = {
    project: counts.projectCount > 0,
    capture: counts.openTaskCount > 0 || counts.completedCount > 0,
    // Completing the last assigned task drops `assignedAnyCount` back to 0.
    // A finished task is still evidence that planning happened, so the step
    // stays done rather than regressing to "do this next".
    plan: counts.assignedAnyCount > 0 || counts.completedCount > 0,
    execute: counts.completedCount > 0,
  };

  let currentTaken = false;
  return STEP_COPY.map((step) => {
    if (done[step.id]) return { ...step, state: "done" as StepState };
    if (!currentTaken) {
      currentTaken = true;
      return { ...step, state: "current" as StepState };
    }
    return { ...step, state: "todo" as StepState };
  });
}

/** How far through the recommended workflow the workspace is. */
export function activationProgress(counts: WorkspaceHomeCounts): { done: number; total: number } {
  const steps = activationChecklist(counts);
  return { done: steps.filter((s) => s.state === "done").length, total: steps.length };
}

export interface HeadlineCopy {
  title: string;
  lead: string;
  /** The single most useful next action, in plain words. */
  primary: string;
  /** Why that action is the right one right now. */
  hint: string;
}

/** Stage-specific headline + primary call to action. */
export function headlineFor(stage: ActivationStage, workspaceName: string): HeadlineCopy {
  switch (stage) {
    case "no_projects":
      return {
        title: "Welcome to TasksAI",
        lead: "Turn scattered intent into work your team can trust. Notes, requests, and half-formed plans become tasks with an owner, a date, and a clear next step.",
        primary: "Create your first project",
        hint: "Projects are where tasks, plans, and AI drafts land.",
      };
    case "no_tasks":
      return {
        title: "Add the first piece of work",
        lead: "You have a project. Now get the work into it — type it yourself, paste notes and let Copilot draft the tasks for you, or import a list you already keep.",
        primary: "Add a task",
        hint: "Anything you add stays yours to edit; nothing is created without you approving it.",
      };
    case "no_assigned_work":
      return {
        title: `${workspaceName} is up and running`,
        lead: "You have no assigned work yet. Pick something up from a project, or capture what you are working on so it shows in My Work.",
        primary: "Browse projects",
        hint: "My Work only shows what is assigned to you — that is why it looks empty.",
      };
    case "active":
    default:
      return {
        title: `Good to see you in ${workspaceName}`,
        lead: "Here is where things stand. Open My Work to execute, or Focus to decide what deserves attention next.",
        primary: "Open My Work",
        hint: "Focus explains its reasoning, so you can disagree with it.",
      };
  }
}
