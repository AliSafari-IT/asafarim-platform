import type { ToolDefinition } from "../lib/tools/types";
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
    slug: "shell-reference",
    title: "Turn notes into a checklist (shell reference)",
    shortDescription: "Internal reference tool that exercises the Workbench shell with a prepared example.",
    longDescription:
      "This internal tool exists to prove the shared Workbench shell end to end: loading an example, running it, reviewing a result labelled by where each item came from, and exporting it. It has no AI provider behind it — only the prepared example produces a result.",
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
      "Only the prepared example produces a result; there is no live AI provider behind this tool.",
      "Not listed in the catalogue and not available in production.",
    ],
    privacyStatement: "Nothing you type here leaves your browser — this reference tool never calls a server.",
    relatedApp: { key: "tasksai", name: "TasksAI", reason: "Plan and track the actions on a shared board." },
    lastReviewed: "2026-09-27",
  },
];
