/**
 * AI Workbench case-study content (#683). Every technical claim here is
 * about shipped code and points at public evidence (source, docs, the
 * committed eval report). Fixture numbers are labelled as fixture numbers;
 * nothing here is production telemetry, a customer deployment, or a user
 * count. Keep it in step with apps/web/content/tools.ts.
 */
import { getPlatformLinks } from "@asafarim/ui";
import evalReport from "./eval-report.json";

const links = getPlatformLinks();
const REPO = "https://github.com/AliSafari-IT/asafarim-platform";
export const src = (path: string) => `${REPO}/blob/main/${path}`;

export type EvalReport = typeof evalReport;
export const report: EvalReport = evalReport;

export interface Evidence {
  label: string;
  href: string;
}

export interface ToolCaseStudy {
  anchor: string;
  slug: string;
  title: string;
  problem: string;
  whyNarrow: string;
  contract: { name: string; fields: string[] };
  review: string[];
  grounding: string[];
  failureCases: string[];
  status: { works: string[]; fixture: string[]; deferred: string[] };
  app: { name: string; href: string };
  evidence: Evidence[];
}

export const tools: ToolCaseStudy[] = [
  {
    anchor: "test-plan",
    slug: "requirements-to-test-plan",
    title: "Requirements → Test Plan",
    problem:
      "A requirement or user story needs a test plan a tester can trust: which scenario tests which line, what the text leaves vague, and no pretence that anything ran.",
    whyNarrow:
      "One input, one reviewable artifact, and a clear done state (reviewed and exported, or continued in Testora). Narrow enough that every scenario can be traced to a line of the input.",
    contract: {
      name: "test-plan/1",
      fields: [
        "sources: the requirement split server-side into numbered units (R1, R2, …)",
        "scenarios: category, priority, steps, expected result, and either the source ids it traces to or an inferred-risk assumption",
        "questions: ambiguity, missing information, or contradiction, each citing its units",
        "No field for execution status, pass/fail, or coverage; strict objects so a model can't add one",
      ],
    },
    review: ["Select, edit, remove and restore scenarios", "Per-scenario origin: sample, AI draft, edited by you", "Markdown and JSON export; Testora handoff as pending scaffolds"],
    grounding: [
      "Scenarios citing text that doesn't exist, or neither citing nor stating an assumption, are removed and reported.",
      "Text claiming tests ran, passed, or reached 100% coverage is removed (typically an injected instruction).",
      "Ids are assigned by the server, never by the model.",
    ],
    failureCases: [
      "The eval gate caught the rule-based fixture turning an injected \"every test passed\" line into a scenario; such lines now become an open question.",
      "Vague wording is only flagged when it matches a small word list in the fixture; the live prompt is expected to do better and is scored on it.",
    ],
    status: {
      works: ["Full review, edit, export, and Testora handoff on the example"],
      fixture: ["Results for your own text come from a deterministic, rule-based fixture in fixture mode"],
      deferred: ["Live generation (behind the eval gate and launch checks)"],
    },
    app: { name: "Testora", href: links.testora },
    evidence: [
      { label: "Server adapter", href: src("apps/web/lib/tools/server/adapters/requirements-to-test-plan.ts") },
      { label: "Contract", href: src("apps/web/lib/tools/test-plan/schema.ts") },
      { label: "Eval cases", href: src("apps/web/lib/tools/test-plan/eval-cases.ts") },
    ],
  },
  {
    anchor: "action-plan",
    slug: "notes-to-action-plan",
    title: "Notes → Action Plan",
    problem: "Meeting notes and idea dumps need to become tasks with dependencies, risks, and open questions, without an AI quietly assigning people or inventing deadlines.",
    whyNarrow: "The job ends at a reviewed plan. Scheduling, assignment, and execution stay with people and with TasksAI.",
    contract: {
      name: "action-plan/1",
      fields: [
        "sources: note lines (N1…) and the user's own constraints (C1…)",
        "tasks, dependencies, risks, decisions, milestones, questions, each labelled fact / constraint / inference / suggestion",
        "Dependencies must reference real tasks and stay acyclic",
        "No field for an assignee, owner, or due date",
      ],
    },
    review: ["Select, reorder, edit, and remove tasks (their links go with them)", "Add and remove dependencies, with cycle refusal", "Session undo; Markdown/JSON export listing anything left out; TasksAI handoff"],
    grounding: [
      "Tasks, milestones, or risks that assign a person or add a date the notes don't contain are removed on the server.",
      "Dangling links are dropped; a link that would close a cycle is dropped and turned into an open question.",
    ],
    failureCases: [
      "Owner and deadline detection is text-based: an unusually worded assignment can slip through, which is why every item shows its provenance for review.",
      "The rule-based fixture recognises actions by keywords, so sparse or unusual notes produce few tasks; it then says so rather than inventing work.",
    ],
    status: {
      works: ["Full review, edit, undo, export, and TasksAI handoff on the example"],
      fixture: ["Results for your own text come from a deterministic, rule-based fixture in fixture mode"],
      deferred: ["Live generation (behind the eval gate and launch checks)"],
    },
    app: { name: "TasksAI", href: links.tasksai },
    evidence: [
      { label: "Server adapter", href: src("apps/web/lib/tools/server/adapters/notes-to-action-plan.ts") },
      { label: "Owner and deadline guards", href: src("apps/web/lib/tools/action-plan/commitments.ts") },
      { label: "Eval cases", href: src("apps/web/lib/tools/action-plan/eval-cases.ts") },
    ],
  },
  {
    anchor: "timeline",
    slug: "text-to-cited-timeline",
    title: "Text → Cited Timeline",
    problem: "Prose full of dates needs to become a timeline where each event cites its sentence, dates keep the precision the text gave, and disagreeing sources stay visible.",
    whyNarrow: "It reuses TimelineAI's own date contract instead of a second, incompatible extractor, and hands reviewed events to TimelineAI to design and publish.",
    contract: {
      name: "cited-timeline/1",
      fields: [
        "sources: numbered sentences (S1…)",
        "events: TimelineAI's TemporalValue (day, month, season, decade, range, unknown…), basis cited or inferred, confidence, uncertainty",
        "conflicts: conflicting dates, impossible range, ordering, ambiguous date",
        "A cited, dated event's date must appear verbatim in the sentence it cites",
      ],
    },
    review: ["Accept, reject, edit (date re-parsed), reorder, or sort by date", "Per-conflict decision: keep unresolved on purpose, corrected, or not a conflict", "Accessible preview; Markdown/JSON export; TimelineAI handoff"],
    grounding: [
      "The model copies the date phrase; the server works out precision with TimelineAI's parser, so \"spring 1990\" can't become 1990-04-01.",
      "A date not worded that way in its sentence is removed and the event shown as undated, with a note.",
      "Impossible ranges come from TimelineAI's own conflict check; disagreeing sources are never resolved automatically.",
    ],
    failureCases: [
      "Date parsing covers English formats; anything else is shown as written with precision \"unclear\".",
      "Building this tool exposed a parser bug shared with TimelineAI: a range written with exact dates collapsed to its first day. It was fixed in the shared contract, for both apps.",
    ],
    status: {
      works: ["Full review, conflict decisions, preview, export, and TimelineAI handoff on the example"],
      fixture: ["Results for your own text come from a deterministic, rule-based fixture in fixture mode"],
      deferred: ["Live generation (behind the eval gate and launch checks)"],
    },
    app: { name: "TimelineAI", href: links.timelineai },
    evidence: [
      { label: "Server adapter", href: src("apps/web/lib/tools/server/adapters/text-to-cited-timeline.ts") },
      { label: "Shared timeline contract", href: src("packages/timeline-contract/src/temporal-parse.ts") },
      { label: "Eval cases", href: src("apps/web/lib/tools/timeline/eval-cases.ts") },
    ],
  },
];

export const platformEvidence: Evidence[] = [
  { label: "Charter and promotion criteria", href: src("docs/ai-tools/charter.md") },
  { label: "Execution boundary", href: src("docs/ai-tools/execution-boundary.md") },
  { label: "Threat model", href: src("docs/ai-tools/threat-model.md") },
  { label: "Eval gate", href: src("benchmarks/ai-tools/README.md") },
  { label: "Handoffs", href: src("docs/ai-tools/handoff.md") },
  { label: "Measurement plan", href: src("docs/ai-tools/analytics.md") },
];

export const workbenchUrl = `${links.web}/tools`;
export const toolUrl = (slug: string) => `${links.web}/tools/${slug}`;
export const contactUrl = `${links.web}/contact`;
