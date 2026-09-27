import type { ToolDefinition } from "../lib/tools/types";
import { actionPlanExampleNotes, actionPlanExampleOutput } from "./tool-fixtures/notes-to-action-plan";
import { testPlanExampleOutput, testPlanExampleRequirement } from "./tool-fixtures/requirements-to-test-plan";
import { shellReferenceExampleInput, shellReferenceExampleOutput } from "./tool-fixtures/shell-reference";

/**
 * The AI Workbench catalogue — the single source of truth for every tool's
 * public copy, lifecycle, limits, disclosures, and links. Pages, catalogue
 * cards, and metadata read from here; they never restate these strings.
 *
 * Plain data only (validated in lib/tools/validate.ts). Import it through
 * lib/tools/catalogue.ts, which validates it, rather than directly.
 * See docs/ai-tools/adding-a-tool.md before adding an entry.
 */
export const toolCatalogue: ToolDefinition[] = [
  {
    slug: "requirements-to-test-plan",
    title: "Turn a requirement into a reviewable test plan",
    shortDescription:
      "Paste a user story or requirement and get test scenarios that each point back to your text, plus the questions it leaves open.",
    longDescription:
      "Paste a requirement, user story, or acceptance criteria. You get a draft test plan: happy paths, boundaries, failure cases, security, accessibility, and compatibility, where relevant. Every scenario either quotes the line of your requirement it tests or is labelled as an inferred risk with its assumption spelled out. Vague, missing, or contradictory requirements come back as open questions instead of guesses. Review, edit, and pick the scenarios you want, then export Markdown or JSON. It's planning help: nothing is executed.",
    category: "testing",
    lifecycle: "experiment",
    indexable: false,
    liveGeneration: false,
    inputSummary: "A requirement or user story, optionally with acceptance criteria, product context, and browsers or platforms in scope.",
    outputSummary: "Test scenarios with steps and expected results, each traced to your text or labelled as an assumption, plus open questions.",
    capabilities: ["structured-output", "source-grounding", "uncertainty-labelling", "human-review", "export", "fixture-mode"],
    example: {
      label: "Load the password-reset example",
      input: testPlanExampleRequirement,
      output: testPlanExampleOutput,
    },
    limits: { minInputChars: 40, maxInputChars: 8000 },
    limitations: [
      "It plans tests; it doesn't run them. Nothing here shows that any system was tested or works.",
      "It only knows what you paste: no links are followed and no code or repository is read.",
      "Inferred scenarios are suggestions based on common risks, not requirements. Check each assumption.",
      "Live generation isn't switched on yet: while this tool is experimental, only the example runs.",
    ],
    privacyStatement:
      "Your text is sent to our server to build the plan and isn't stored or logged. When live generation is on, it's also sent to an AI provider (Anthropic) to draft the plan. Don't paste secrets or personal data.",
    relatedApp: { key: "testora", name: "Testora", reason: "Turn planned scenarios into automated checks and track results." },
    lastReviewed: "2026-09-27",
  },
  {
    slug: "notes-to-action-plan",
    title: "Turn messy notes into an action plan you can review",
    shortDescription:
      "Paste meeting notes, a brief, or an idea dump and get tasks, dependencies, risks, and open questions, each labelled with where it came from.",
    longDescription:
      "Paste meeting notes, a project brief, or a list of loose ideas. You get a draft plan: an objective, tasks in a suggested order with the links between them, risks, decisions already made, possible milestones, and the questions your notes leave open. Every item says whether it's from your notes (with the quote), from a constraint you gave, inferred, or a suggestion. It never assigns people or invents deadlines. Reorder, edit, remove, and pick tasks, undo mistakes, then export Markdown or JSON.",
    category: "planning",
    lifecycle: "experiment",
    indexable: false,
    liveGeneration: false,
    inputSummary: "Meeting notes, a project brief, or an idea dump, optionally with the outcome you want, a horizon, participants, and planning depth.",
    outputSummary: "Ordered tasks with dependencies, risks, decisions, milestones, and open questions, each labelled as from your notes, your constraint, inferred, or a suggestion.",
    capabilities: ["structured-output", "source-grounding", "uncertainty-labelling", "human-review", "export", "fixture-mode"],
    example: {
      label: "Load the help-centre move example",
      input: actionPlanExampleNotes,
      output: actionPlanExampleOutput,
    },
    limits: { minInputChars: 40, maxInputChars: 10000 },
    limitations: [
      "It drafts a plan; it doesn't schedule, assign, or send anything, and it never writes to TasksAI.",
      "It never assigns tasks to people or adds deadlines. Dates appear only when your notes state them.",
      "Effort ranges are rough estimates, and dependencies marked inferred are guesses. Check both.",
      "It only knows what you paste: no links are followed and no calendars or tools are read.",
      "Live generation isn't switched on yet: while this tool is experimental, only the example runs.",
    ],
    privacyStatement:
      "Your notes are sent to our server to build the plan and aren't stored or logged. When live generation is on, they're also sent to an AI provider (Anthropic) to draft the plan. Remove names, secrets, and personal data you don't need to share.",
    relatedApp: { key: "tasksai", name: "TasksAI", reason: "Track the reviewed tasks on a shared board." },
    lastReviewed: "2026-09-27",
  },
  {
    slug: "shell-reference",
    title: "Turn notes into a checklist (shell reference)",
    shortDescription: "Internal reference tool that exercises the Workbench shell with a prepared example.",
    longDescription:
      "This internal tool exists to prove the shared Workbench shell end to end: loading an example, running it, reviewing a result labelled by where each item came from, and exporting it. It runs through the real server execution boundary, but has no AI provider behind it: every result comes from its deterministic fixture.",
    category: "reference",
    lifecycle: "experiment",
    indexable: false,
    internal: true,
    liveGeneration: false,
    inputSummary: "A few lines of meeting or planning notes.",
    outputSummary: "A checklist where each item is marked as from your text, inferred, or needing your input.",
    capabilities: ["structured-output", "source-grounding", "uncertainty-labelling", "human-review", "export", "fixture-mode"],
    example: {
      label: "Load the team-sync example",
      input: shellReferenceExampleInput,
      output: shellReferenceExampleOutput,
    },
    limits: { minInputChars: 20, maxInputChars: 4000 },
    limitations: [
      "There is no live AI provider behind this tool. Outside fixture mode, only the prepared example produces a result.",
      "Not listed in the catalogue and not available in production.",
    ],
    privacyStatement: "Your text is sent to our server to produce the result and is not stored or logged. No AI provider sees it.",
    relatedApp: { key: "tasksai", name: "TasksAI", reason: "Plan and track the actions on a shared board." },
    lastReviewed: "2026-09-27",
  },
];
