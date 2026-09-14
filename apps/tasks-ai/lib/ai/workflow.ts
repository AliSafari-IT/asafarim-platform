/**
 * The Copilot intent-to-plan workflow (issue #368).
 *
 * TasksAI's promise is not "there is an AI page". It is: scattered intent →
 * a reviewable proposal → human approval → work you can trust. The pipeline
 * that enforces that already exists (lib/ai/job.ts generates, lib/ai/
 * proposals.ts applies, and nothing mutates the workspace before an explicit
 * apply). What was missing is the *understandable* part: plain-language
 * intents, a destination a person can choose, an honest account of what is
 * grounded in the pasted source versus assumed, an impact sentence before
 * commit, and somewhere to go afterwards.
 *
 * All of that is decided here — pure, framework-free, and unit-testable —
 * so the copilot page, the contextual entry points elsewhere in the product
 * and the tests all agree on one model. Same convention as lib/home/state.ts
 * and lib/work/my-work.ts.
 *
 * Nothing in this module mutates anything or talks to a provider. It decides
 * what the human is shown and what the human is allowed to do next.
 */

/* ───────────────────────── operations (structural) ───────────────────── */

/**
 * The minimum shape of a proposed operation this module reasons about.
 * Deliberately structural rather than an import of the zod union or the
 * client's `AiOperation`: both are assignable to it, so the server, the
 * client component and the tests can all call in without this pure module
 * depending on either side.
 */
export interface WorkflowOperation {
  op: "create_task" | "update_task" | "link_tasks";
  confidence: number;
  citations: { span: [number, number] | null; assumption: boolean; quote?: string }[];
  fields?: { title?: string; parentRef?: string };
}

/* ───────────────────────────── intents ───────────────────────────────── */

/** The AI kinds the guided workflow exposes. Others (nl_query, test_diagnosis)
 *  are internal channels, not things a person picks from a menu. */
export type CopilotIntentId = "extract_plan" | "decompose" | "acceptance_criteria" | "summarize";

export interface CopilotIntent {
  id: CopilotIntentId;
  /** Short call-to-action used by entry points elsewhere in the product. */
  entryLabel: string;
  /** The intended outcome, in the words a first-time user would use. */
  label: string;
  /** What you get back, so nobody has to run it to find out. */
  outcome: string;
  /** What is worth pasting for this intent. */
  sourceHint: string;
  /** Concrete starting points shown instead of a blank textarea. */
  examples: string[];
  /** True when the intent is about one existing task rather than free text. */
  aboutATask: boolean;
}

export const COPILOT_INTENTS: CopilotIntent[] = [
  {
    id: "extract_plan",
    entryLabel: "Paste meeting notes",
    label: "Turn notes into a project plan",
    outcome: "A set of proposed tasks, with subtasks and dependencies where the notes imply them.",
    sourceHint:
      "Meeting notes, a client brief, a call transcript, rough requirements, or a brain dump — whatever you already wrote down.",
    examples: [
      "Kickoff call, 12 March. Client wants the new marketing site live before the trade show on 4 June. They still owe us brand assets. Design first, then build, then content migration. Legal has to review copy before launch.",
      "Rough plan for the mobile release: finish offline sync, fix the two crash reports from last week, get the store listing screenshots redone, then submit for review. Sync blocks the submission.",
    ],
    aboutATask: false,
  },
  {
    id: "decompose",
    entryLabel: "Break down a task",
    label: "Break a task into concrete steps",
    outcome: "Proposed subtasks under the task you picked, small enough to actually start.",
    sourceHint:
      "The task as it stands today, plus anything you know about it that is not written down yet.",
    examples: [
      "Migrate the customer database to the new schema. Zero downtime required. We have about 40 tables and two services reading from it.",
      "Redesign the onboarding flow. Currently five screens, people drop off on the third.",
    ],
    aboutATask: true,
  },
  {
    id: "acceptance_criteria",
    entryLabel: "Draft acceptance criteria",
    label: "Draft acceptance criteria",
    outcome: "Proposed criteria describing what finished actually means for this work.",
    sourceHint:
      "The task or requirement you want criteria for, and any constraints the reviewer will check against.",
    examples: [
      "Checkout must support saved cards and Apple Pay, handle a declined payment without losing the basket, and email a receipt within a minute.",
      "The export button should produce a CSV of the current filtered view, including the columns the user has visible.",
    ],
    aboutATask: true,
  },
  {
    id: "summarize",
    entryLabel: "Summarize a discussion",
    label: "Summarize a discussion",
    outcome: "A short summary plus any follow-up work the discussion implies.",
    sourceHint: "A long thread, a chat log, or a transcript you do not want to re-read.",
    examples: [
      "Long email thread about whether to keep supporting the legacy API. Three people, no decision, two action items buried in the middle.",
    ],
    aboutATask: false,
  },
];

const INTENT_BY_ID = new Map(COPILOT_INTENTS.map((i) => [i.id, i]));

/** The default intent — the one that makes the product's promise concrete. */
export const DEFAULT_INTENT_ID: CopilotIntentId = "extract_plan";

/**
 * Resolve an intent from an untrusted value (a query string on a contextual
 * entry link, a stored preference). Never throws: an unknown id falls back
 * to the default rather than leaving the page without a workflow.
 */
export function intentFor(id: string | null | undefined): CopilotIntent {
  return INTENT_BY_ID.get((id ?? "") as CopilotIntentId) ?? INTENT_BY_ID.get(DEFAULT_INTENT_ID)!;
}

/**
 * The AI kind to send for an intent. One-to-one today; the indirection is
 * the point — entry points and analytics speak intents, the job pipeline
 * speaks kinds, and neither has to change when the other does.
 */
export function kindForIntent(id: CopilotIntentId): string {
  return id;
}

/** The contextual actions offered from a task's detail view. */
export const TASK_INTENTS: CopilotIntent[] = COPILOT_INTENTS.filter((i) => i.aboutATask);

/**
 * A deep link into the guided workflow. Entry points use this rather than
 * hand-building query strings so a renamed parameter cannot half-land.
 */
export function copilotHref(
  slug: string,
  options: { intent?: CopilotIntentId; taskId?: string; from?: string } = {},
): string {
  const params = new URLSearchParams();
  if (options.intent) params.set("intent", options.intent);
  if (options.taskId) params.set("task", options.taskId);
  if (options.from) params.set("from", options.from);
  const qs = params.toString();
  return `/w/${slug}/copilot${qs ? `?${qs}` : ""}`;
}

/* ────────────────────────────── the steps ────────────────────────────── */

export type CopilotStepId = "source" | "outcome" | "destination" | "review";
export type StepState = "done" | "current" | "todo";

export interface CopilotStep {
  id: CopilotStepId;
  title: string;
  description: string;
  state: StepState;
}

/** Anything shorter than this is not enough to ground a proposal in. */
export const MIN_SOURCE_LENGTH = 10;

export interface CopilotFlowState {
  /** Length of the trimmed source text the user has pasted. */
  sourceLength: number;
  /** The chosen destination project, if any. */
  projectId: string | null;
  /** Active projects the viewer can write into. */
  projectCount: number;
  /** Whether a proposal is currently on screen awaiting review. */
  hasProposal: boolean;
}

const STEP_COPY: { id: CopilotStepId; title: string; description: string }[] = [
  {
    id: "source",
    title: "Paste what you already have",
    description:
      "Meeting notes, a brief, a transcript, rough requirements. It stays on screen while you review, so you can check every claim against it.",
  },
  {
    id: "outcome",
    title: "Say what you want out of it",
    description: "Pick the outcome in plain words. That is all the instruction TasksAI needs.",
  },
  {
    id: "destination",
    title: "Choose where it would land",
    description: "Nothing is written yet — this only decides where approved work would go.",
  },
  {
    id: "review",
    title: "Review, then approve",
    description:
      "You see every proposed change, what it is based on, and what it would create — before anything is saved.",
  },
];

/**
 * The four steps with their state. Exactly one step is `current`: the first
 * one that is not satisfied, so the page always points at one thing.
 */
export function copilotSteps(state: CopilotFlowState): CopilotStep[] {
  const done: Record<CopilotStepId, boolean> = {
    source: state.sourceLength >= MIN_SOURCE_LENGTH,
    // The outcome always has a value (the default intent), so this step is
    // satisfied as soon as there is source text to apply it to.
    outcome: state.sourceLength >= MIN_SOURCE_LENGTH,
    destination: state.projectId !== null,
    review: state.hasProposal,
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

/* ──────────────────────────── the destination ────────────────────────── */

export type DestinationKind =
  /** A destination is chosen. */
  | "ready"
  /** Projects exist; the user has to pick one. */
  | "choose"
  /** No projects, and this viewer may create one. */
  | "no_projects_can_create"
  /** No projects, and this viewer may not create one. */
  | "no_projects_read_only";

export type DestinationAction = "create_project" | "pick_project" | "ask_admin";

export interface DestinationState {
  kind: DestinationKind;
  title: string;
  description: string;
  actions: DestinationAction[];
}

/**
 * What the destination step says. The no-project case is the one that
 * mattered (issue #368): a disabled Generate button with no explanation is
 * the exact dead end this replaces, so every branch carries a next step.
 */
export function destinationState(input: {
  projectCount: number;
  projectId: string | null;
  canCreateProject: boolean;
}): DestinationState {
  if (input.projectCount === 0) {
    return input.canCreateProject
      ? {
          kind: "no_projects_can_create",
          title: "There is nowhere to put the work yet",
          description:
            "A proposal has to land in a project. Create one now — it takes a name and a short code — and you can come straight back to this draft.",
          actions: ["create_project"],
        }
      : {
          kind: "no_projects_read_only",
          title: "There is nowhere to put the work yet",
          description:
            "A proposal has to land in a project, this workspace has none, and your role cannot create one. Ask a workspace admin to create the first project.",
          actions: ["ask_admin"],
        };
  }
  if (!input.projectId) {
    return {
      kind: "choose",
      title: "Where would this land?",
      description:
        "Pick the project approved work would be created in. You can still change your mind before you approve anything.",
      actions: ["pick_project"],
    };
  }
  return {
    kind: "ready",
    title: "Where this would land",
    description: "Approved work goes here. Nothing is created until you approve it.",
    actions: [],
  };
}

/* ──────────────────────── why Generate is blocked ────────────────────── */

export type GenerateBlockCode = "no_source" | "short_source" | "no_destination";

export interface GenerateBlock {
  code: GenerateBlockCode;
  /** Plain-language reason, shown next to the button — never just disabled. */
  message: string;
}

/**
 * `null` when generating is allowed. Otherwise the single most useful reason
 * it is not, with the fix in the sentence.
 */
export function generateBlock(state: CopilotFlowState): GenerateBlock | null {
  if (state.sourceLength === 0) {
    return {
      code: "no_source",
      message: "Paste something first — notes, a brief, a thread. Or start from one of the examples.",
    };
  }
  if (state.sourceLength < MIN_SOURCE_LENGTH) {
    return {
      code: "short_source",
      message: `That is too short to work from. Around ${MIN_SOURCE_LENGTH} characters is the minimum, but a few sentences work far better.`,
    };
  }
  if (!state.projectId) {
    return {
      code: "no_destination",
      message:
        state.projectCount === 0
          ? "Create a project first — approved work has to land somewhere."
          : "Choose the project approved work would land in.",
    };
  }
  return null;
}

/** Set before the button is pressed: what generating does, and does not, do. */
export const GENERATE_EXPECTATION =
  "TasksAI will propose changes. Nothing is created until you approve them.";

/* ───────────────────── facts, assumptions, evidence ──────────────────── */

/** Below this, an ungrounded claim is not something to tick by default. */
export const LOW_CONFIDENCE = 0.6;

export interface OperationEvidence {
  /** At least one citation points at a real span of the source. */
  grounded: boolean;
  /** The strongest quote backing this operation, if the model gave one. */
  quote: string | null;
  /** The span to highlight in the source, if any. */
  span: [number, number] | null;
  confidence: number;
  /** Label rendered on the badge: what the user is actually being told. */
  label: "From your notes" | "Assumption";
}

/**
 * Whether an operation is grounded in the pasted source or is the model's
 * own inference. The distinction is the trust model — it is never inferred
 * from confidence, only from whether a citation points at real text.
 */
export function evidenceFor(op: WorkflowOperation): OperationEvidence {
  const cited = op.citations.find((c) => c.span !== null && !c.assumption) ?? null;
  return {
    grounded: cited !== null,
    quote: cited?.quote ?? null,
    span: cited?.span ?? null,
    confidence: op.confidence,
    label: cited !== null ? "From your notes" : "Assumption",
  };
}

/**
 * The slice of the source an operation cites, so review can show the actual
 * words rather than asking the user to trust a badge. Returns null when the
 * span is missing or does not address real text — a citation that points
 * outside the source is not evidence.
 */
export function evidenceText(source: string, op: WorkflowOperation): string | null {
  const { span, quote } = evidenceFor(op);
  if (!span) return quote ?? null;
  const [start, end] = span;
  if (start < 0 || end > source.length || end <= start) return quote ?? null;
  return source.slice(start, end);
}

/** How many operations rest on assumptions rather than the source. */
export function assumptionCount(ops: WorkflowOperation[]): number {
  return ops.filter((op) => !evidenceFor(op).grounded).length;
}

/**
 * Which operations start ticked. An assumption the model is not confident
 * about is exactly the thing that must not be accepted by inattention, so it
 * starts unticked and visible rather than pre-approved (issue #368, step 5).
 */
export function defaultAccepted(ops: WorkflowOperation[]): number[] {
  const out: number[] = [];
  ops.forEach((op, i) => {
    const ev = evidenceFor(op);
    if (!ev.grounded && ev.confidence < LOW_CONFIDENCE) return;
    out.push(i);
  });
  return out;
}

/** Why some items are unticked — said out loud, not left to be noticed. */
export function defaultAcceptanceNotice(ops: WorkflowOperation[]): string | null {
  const held = ops.length - defaultAccepted(ops).length;
  if (held === 0) return null;
  return `${held} of ${ops.length} item(s) are low-confidence assumptions rather than anything in your notes, so they start unticked. Read them and tick the ones you agree with.`;
}

/* ──────────────────────────── impact of Apply ────────────────────────── */

export interface ImpactCounts {
  /** Top-level tasks created. */
  tasks: number;
  /** Created tasks nested under another created task. */
  subtasks: number;
  /** Existing tasks edited. */
  updates: number;
  /** Dependencies/relations created between tasks. */
  dependencies: number;
  total: number;
}

/** What the accepted subset of a proposal would actually do. */
export function impactCounts(ops: WorkflowOperation[], accepted: number[]): ImpactCounts {
  const set = new Set(accepted);
  const counts: ImpactCounts = { tasks: 0, subtasks: 0, updates: 0, dependencies: 0, total: 0 };
  ops.forEach((op, i) => {
    if (!set.has(i)) return;
    counts.total += 1;
    if (op.op === "create_task") {
      if (op.fields?.parentRef) counts.subtasks += 1;
      else counts.tasks += 1;
    } else if (op.op === "update_task") {
      counts.updates += 1;
    } else {
      counts.dependencies += 1;
    }
  });
  return counts;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The sentence shown immediately before the confirmation — "This will create
 * 7 tasks, 2 subtasks and 3 dependencies in WEB · Website redesign." Nobody
 * should have to count checkboxes to know what they are approving.
 */
export function impactSentence(counts: ImpactCounts, destinationLabel: string): string {
  const parts: string[] = [];
  if (counts.tasks > 0) parts.push(plural(counts.tasks, "task"));
  if (counts.subtasks > 0) parts.push(plural(counts.subtasks, "subtask"));
  if (counts.dependencies > 0) parts.push(plural(counts.dependencies, "dependency", "dependencies"));
  const creates = parts.length > 0 ? `create ${listWords(parts)}` : "";
  const updates = counts.updates > 0 ? `update ${plural(counts.updates, "existing task")}` : "";
  const both = [creates, updates].filter(Boolean);
  if (both.length === 0) return "Nothing is selected, so applying would change nothing.";
  return `This will ${listWords(both)} in ${destinationLabel}.`;
}

function listWords(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * How many of the tasks this apply would create still need a human to plan
 * them. Mirrors the Inbox rule (lib/capture/inbox.ts): an applied proposal
 * never carries an owner or a due date — AI may not set either — so every
 * created task waits in the Inbox until somebody decides those. Expressed
 * here rather than assumed, so a future change to the rule is one edit.
 */
export function inboxLandingCount(ops: WorkflowOperation[], accepted: number[]): number {
  const counts = impactCounts(ops, accepted);
  return counts.tasks + counts.subtasks;
}

/** The plain sentence about that, or null when nothing would be created. */
export function inboxLandingSentence(count: number): string | null {
  if (count <= 0) return null;
  return `${plural(count, "new task")} will arrive without an owner or a date — TasksAI never lets AI set those — so they wait in your Inbox until somebody decides.`;
}

/* ────────────────────────── after the apply ──────────────────────────── */

export type PostApplyActionId = "open_inbox" | "open_project" | "my_work" | "another";

export interface PostApplyAction {
  id: PostApplyActionId;
  label: string;
  description: string;
}

export interface PostApplyOutcome {
  /** What the user is told happened, in counts they can verify. */
  summary: string;
  /** Where they can usefully go next — never just a status line. */
  actions: PostApplyAction[];
  /** True when some created work still needs triage. */
  needsTriage: boolean;
}

/**
 * The end of the workflow. "Applied 7 operation(s)." is a dead end; this is
 * the alternative — what happened, what still needs a person, and the ways
 * onward (issue #368, step 7).
 */
export function postApplyOutcome(input: {
  accepted: number;
  total: number;
  destinationLabel: string;
  inboxCount: number;
}): PostApplyOutcome {
  const partial = input.accepted < input.total;
  const summary = partial
    ? `Applied ${input.accepted} of ${input.total} proposed change(s) to ${input.destinationLabel}. The rest were not applied and changed nothing.`
    : `Applied all ${input.total} proposed change(s) to ${input.destinationLabel}.`;

  const actions: PostApplyAction[] = [];
  if (input.inboxCount > 0) {
    actions.push({
      id: "open_inbox",
      label: "Triage the new work",
      description: `${plural(input.inboxCount, "new task")} need an owner and a date before they count as planned.`,
    });
  }
  actions.push({
    id: "open_project",
    label: "Review in the project",
    description: `See everything that was created in ${input.destinationLabel}.`,
  });
  actions.push({
    id: "my_work",
    label: "Go to My Work",
    description: "Your own list, once the new work has an owner and a date.",
  });
  actions.push({
    id: "another",
    label: "Draft another proposal",
    description: "Start again from a different set of notes.",
  });

  return { summary, actions, needsTriage: input.inboxCount > 0 };
}

/* ───────────────────────── trust + degraded states ───────────────────── */

/** The first-use callout. Dismissible — education, never a permanent tutorial. */
export const FIRST_USE_CALLOUT = {
  title: "Copilot never edits your workspace directly",
  body: "It prepares a proposal for you to review first. You approve all of it, part of it, or none of it — and rejecting changes nothing.",
} as const;

/** localStorage key for "this person has read the callout". Per browser. */
export const FIRST_USE_STORAGE_KEY = "tasksai.copilot.trust-callout.dismissed";

/**
 * The provider-health warning, kept visible exactly as before but said in
 * words that explain the consequence rather than naming an internal mode.
 */
export function providerNotice(input: { degraded?: boolean }): string | null {
  if (!input.degraded) return null;
  return "The AI provider was unavailable, so this draft came from the built-in offline model. It leans much harder on assumptions than usual — read every item before you approve it.";
}

export interface AiDisabledState {
  title: string;
  description: string;
  /** Whether to offer a link to AI settings — admins only. */
  settingsLink: boolean;
}

/**
 * AI switched off. The workspace stays fully usable; this explains the state
 * and, for somebody who can actually change it, links to where.
 */
export function aiDisabledState(canManageAiSettings: boolean): AiDisabledState {
  return {
    title: "AI is turned off for this workspace",
    description: canManageAiSettings
      ? "Nothing here will run until it is switched back on. You can change that in AI settings. Everything else in TasksAI — capture, projects, planning, My Work — works exactly the same without it."
      : "Nothing here will run until a workspace admin switches it back on. Everything else in TasksAI — capture, projects, planning, My Work — works exactly the same without it.",
    settingsLink: canManageAiSettings,
  };
}
