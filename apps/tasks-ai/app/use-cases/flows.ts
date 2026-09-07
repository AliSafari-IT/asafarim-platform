/**
 * Use-case flow definitions. Each use case is a genuinely different graph
 * shape — a branch with a human gate, a fan-out to views, a fan-in to a
 * score, a hub-and-spoke integration — because that shape *is* the
 * explanation. Positions are hand-placed in a ~760x340 coordinate space.
 */

export type NodeKind = "input" | "process" | "ai" | "gate" | "output" | "alert";

export type FlowNode = {
  id: string;
  kind: NodeKind;
  label: string;
  detail?: string;
  x: number;
  y: number;
};

export type FlowEdge = {
  from: string;
  to: string;
  label?: string;
  tone?: "default" | "ok" | "muted" | "warn";
  /** route out of the bottom and into the top — used for feedback loops */
  loop?: boolean;
};

export type UseCase = {
  id: string;
  tag: string;
  title: string;
  body: string;
  /** what the diagram is showing, in one sentence */
  readAs: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export const USE_CASES: UseCase[] = [
  {
    id: "notes-to-plan",
    tag: "M06–M07",
    title: "Kickoff notes → an executable plan",
    body: "Paste meeting notes, a brief, or an email thread. The copilot drafts a work graph — tasks, owners, estimates, dependencies — as a reviewable proposal with citations back to the source text.",
    readAs:
      "Two inputs converge on the copilot, but the only path into your plan runs through a human gate — and “request changes” loops back instead of forcing an all-or-nothing choice.",
    nodes: [
      { id: "notes", kind: "input", label: "kickoff-notes.md", detail: "Unstructured text", x: 0, y: 40 },
      { id: "thread", kind: "input", label: "Email thread", detail: "Forwarded brief", x: 0, y: 165 },
      { id: "copilot", kind: "ai", label: "Copilot drafts a work graph", detail: "Tasks · owners · estimates · deps", x: 230, y: 100 },
      { id: "gate", kind: "gate", label: "You review the diff", detail: "Line by line, with citations", x: 470, y: 100 },
      { id: "plan", kind: "output", label: "Plan updated", detail: "Undoable, fully audited", x: 700, y: 20 },
      { id: "nothing", kind: "output", label: "Nothing changes", detail: "Discard leaves no trace", x: 700, y: 180 },
    ],
    edges: [
      { from: "notes", to: "copilot", label: "parse" },
      { from: "thread", to: "copilot", label: "parse" },
      { from: "copilot", to: "gate", label: "proposal" },
      { from: "gate", to: "plan", label: "approve", tone: "ok" },
      { from: "gate", to: "nothing", label: "discard", tone: "muted" },
      { from: "gate", to: "copilot", label: "request changes", tone: "warn", loop: true },
    ],
  },
  {
    id: "sprint-planning",
    tag: "M03",
    title: "Sprint planning that stays honest",
    body: "Break work into a task hierarchy with dependencies, estimates, and dates. The same graph renders as a board, a timeline, or a calendar — and slip detection feeds back into re-planning before the sprint review.",
    readAs:
      "One structured graph, three views — plus a detection loop that sends at-risk work back to re-planning rather than surfacing it after the fact.",
    nodes: [
      { id: "backlog", kind: "input", label: "Backlog + sprint goal", detail: "What you committed to", x: 0, y: 120 },
      { id: "hierarchy", kind: "process", label: "Task hierarchy", detail: "Epics → tasks → subtasks", x: 210, y: 120 },
      { id: "graph", kind: "process", label: "Estimates, dates, blocked-by", detail: "The dependency graph", x: 420, y: 120 },
      { id: "board", kind: "output", label: "Board", detail: "Flow by status", x: 680, y: 10 },
      { id: "timeline", kind: "output", label: "Timeline", detail: "Critical path", x: 680, y: 105 },
      { id: "calendar", kind: "output", label: "Calendar", detail: "Due-date pressure", x: 680, y: 200 },
      { id: "risk", kind: "alert", label: "Slip detected", detail: "Estimate vs. remaining time", x: 420, y: 290 },
    ],
    edges: [
      { from: "backlog", to: "hierarchy", label: "break down" },
      { from: "hierarchy", to: "graph", label: "link" },
      { from: "graph", to: "board", label: "view", tone: "ok" },
      { from: "graph", to: "timeline", label: "view", tone: "ok" },
      { from: "graph", to: "calendar", label: "view", tone: "ok" },
      { from: "graph", to: "risk", label: "watch", tone: "warn" },
      { from: "risk", to: "hierarchy", label: "re-plan", tone: "warn", loop: true },
    ],
  },
  {
    id: "daily-focus",
    tag: "M08",
    title: "Daily focus without the noise",
    body: "A transparent focus score ranks what actually deserves attention today. Every factor is visible, so you can disagree with the ranking — and signals escalate at-risk work to the one person who can unblock it.",
    readAs:
      "Three independent signals fan into one score, which then splits: a ranked work list for you, and a targeted escalation for anything past the risk threshold.",
    nodes: [
      { id: "due", kind: "input", label: "Due dates", detail: "How soon", x: 0, y: 10 },
      { id: "blockers", kind: "input", label: "Blockers", detail: "Who is waiting on you", x: 0, y: 120 },
      { id: "deps", kind: "input", label: "Dependencies", detail: "What unblocks most work", x: 0, y: 230 },
      { id: "score", kind: "process", label: "Focus score", detail: "Every factor shown, none hidden", x: 250, y: 120 },
      { id: "mywork", kind: "output", label: "My work, ranked", detail: "One screen for today", x: 510, y: 20 },
      { id: "signal", kind: "alert", label: "At-risk signal", detail: "Past the threshold", x: 500, y: 220 },
      { id: "notify", kind: "output", label: "Owner notified", detail: "Inbox, not a firehose", x: 700, y: 300 },
    ],
    edges: [
      { from: "due", to: "score", label: "urgency" },
      { from: "blockers", to: "score", label: "leverage" },
      { from: "deps", to: "score", label: "unblocks" },
      { from: "score", to: "mywork", label: "top of list", tone: "ok" },
      { from: "score", to: "signal", label: "threshold", tone: "warn" },
      { from: "signal", to: "notify", label: "escalate", tone: "warn" },
    ],
  },
  {
    id: "portable-data",
    tag: "M05 · M09",
    title: "Own your data, plug in your stack",
    body: "CSV/JSON import-export gets your history in and out at any time. One versioned /api/v1 contract, signed webhooks, and a GitHub integration mean TasksAI fits your pipeline — never the other way around.",
    readAs:
      "Every arrow is reversible. Data flows in from your existing tools and back out through three independent exits, so leaving is always as cheap as arriving.",
    nodes: [
      { id: "import", kind: "input", label: "CSV / JSON import", detail: "Your existing history", x: 0, y: 40 },
      { id: "github", kind: "input", label: "GitHub issues", detail: "Two-way sync", x: 0, y: 190 },
      { id: "core", kind: "process", label: "TasksAI", detail: "Isolated database, opaque user id", x: 260, y: 115 },
      { id: "api", kind: "output", label: "/api/v1", detail: "Versioned, documented contract", x: 540, y: 10 },
      { id: "hooks", kind: "output", label: "Signed webhooks", detail: "Push into CI, Slack, anything", x: 540, y: 115 },
      { id: "export", kind: "output", label: "Full export", detail: "CSV / JSON, on demand", x: 540, y: 220 },
    ],
    edges: [
      { from: "import", to: "core", label: "map fields" },
      { from: "github", to: "core", label: "sync" },
      { from: "core", to: "api", label: "read + write", tone: "ok" },
      { from: "core", to: "hooks", label: "on change", tone: "ok" },
      { from: "core", to: "export", label: "anytime", tone: "ok" },
    ],
  },
];

export const NODE_LEGEND: { kind: NodeKind; label: string }[] = [
  { kind: "input", label: "Input you provide" },
  { kind: "ai", label: "AI proposal" },
  { kind: "gate", label: "Human approval gate" },
  { kind: "process", label: "TasksAI processing" },
  { kind: "output", label: "Outcome" },
  { kind: "alert", label: "Risk signal" },
];
