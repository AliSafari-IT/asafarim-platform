export type ExperimentStatus =
  "prototype" | "active" | "beta" | "paused" | "archived";
export type ExperimentCategory = "AI" | "UI" | "Audio" | "Data" | "DevTools";

export interface Experiment {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  category: ExperimentCategory;
  status: ExperimentStatus;
  version: string;
  lastUpdated: string;
  featured?: boolean;
  /** Name of the component under app/experiments/[slug] that renders the canvas. */
  component: string;
  limitations: string[];
}

export const experiments: Experiment[] = [
  {
    slug: "timeline-layout",
    title: "Timeline Layout Lab",
    tagline: "One dataset, four layouts.",
    description:
      "Add events to a shared timeline and instantly switch between Vertical, Horizontal, Roadmap (Gantt-lite), and Storytelling Card layouts.",
    category: "UI",
    status: "prototype",
    version: "0.1.0",
    lastUpdated: "2026-08-12",
    featured: true,
    component: "TimelineLayoutLab",
    limitations: [
      "Layouts are not yet keyboard-navigable end to end.",
      "PNG export is a stub — only JSON export is wired up.",
      "State resets on reload; nothing is persisted server-side.",
    ],
  },
  {
    slug: "ui-playground",
    title: "ASafarIM UI Playground",
    tagline: "Poke the design tokens.",
    description:
      "A visual testbench for shared design tokens, buttons, inputs, empty states, and feedback banners across viewport sizes and pseudo-states.",
    category: "UI",
    status: "prototype",
    version: "0.1.0",
    lastUpdated: "2026-08-12",
    component: "UiPlayground",
    limitations: [
      "Forced pseudo-states are simulated via CSS classes, not real `:hover`/`:focus`.",
      "Contrast ratio inspector only checks foreground/background pairs you select manually.",
      "i18n string switcher covers a small fixture set, not the full dictionary.",
    ],
  },
  {
    slug: "ai-eval-explorer",
    title: "AI Evaluation Explorer",
    tagline: "Compare model fixture runs.",
    description:
      "Multi-model fixture comparison viewer — latency, token efficiency, hallucination markers, and formatting adherence across static eval runs.",
    category: "AI",
    status: "prototype",
    version: "0.1.0",
    lastUpdated: "2026-08-12",
    component: "AiEvalExplorer",
    limitations: [
      "Data is static fixtures in fixtures/eval-runs.json, not live model calls.",
      "Radar chart is unscaled across dimensions with very different ranges.",
      "No historical trend view yet — single snapshot per run.",
    ],
  },
  {
    slug: "prompt-composer",
    title: "Prompt Composer Lab",
    tagline: "Blend instructions without prompt soup.",
    description:
      "A tactile prompt-shaping surface for exploring how voice, reasoning depth, and output structure change the same underlying instruction.",
    category: "AI",
    status: "active",
    version: "0.2.0",
    lastUpdated: "2026-09-27",
    component: "PromptComposerLab",
    limitations: [
      "The token count is an illustrative estimate, not a model tokenizer result.",
      "Prompt variants are composed locally and are not sent to a model.",
      "The study covers three voice presets rather than a continuous style space.",
    ],
  },
  {
    slug: "retrieval-threshold",
    title: "Retrieval Threshold Studio",
    tagline: "See what relevance cutoffs actually remove.",
    description:
      "Move a relevance threshold and watch the context set change — a small visual model of the precision-versus-coverage trade-off in retrieval systems.",
    category: "Data",
    status: "beta",
    version: "0.2.0",
    lastUpdated: "2026-09-27",
    component: "RetrievalThresholdStudio",
    limitations: [
      "Documents and similarity scores are representative fixtures.",
      "The experiment does not model reranking or query rewriting.",
      "Score distributions differ significantly between embedding models.",
    ],
  },
  {
    slug: "agent-route",
    title: "Agent Route Sandbox",
    tagline: "Trace a task through tools and guardrails.",
    description:
      "Switch missions, add approval gates, and inspect how an agent route changes from initial input to final action.",
    category: "DevTools",
    status: "prototype",
    version: "0.1.0",
    lastUpdated: "2026-09-27",
    component: "AgentRouteSandbox",
    limitations: [
      "Routes are illustrative and do not execute tools or network requests.",
      "Approval gates represent policy boundaries, not a full authorization model.",
      "Latency and failure recovery are not simulated yet.",
    ],
  },
  {
    slug: "voice-shape",
    title: "Voice Shape Lab",
    tagline: "Sculpt an interface voice as a living waveform.",
    description:
      "Explore warmth, pace, and energy as visible properties of a synthetic interface voice before committing to an audio direction.",
    category: "Audio",
    status: "beta",
    version: "0.2.0",
    lastUpdated: "2026-09-27",
    component: "VoiceShapeLab",
    limitations: [
      "The waveform is a visual model and does not synthesize or play audio.",
      "Voice qualities are subjective and intentionally simplified.",
      "No pronunciation, locale, or accessibility controls are included yet.",
    ],
  },
  {
    slug: "context-budget",
    title: "Context Budget Garden",
    tagline: "Grow the answer without starving the context.",
    description:
      "Allocate a finite context window between sources, conversation history, tools, and the answer to make hidden token-budget trade-offs visible.",
    category: "AI",
    status: "active",
    version: "0.2.0",
    lastUpdated: "2026-09-27",
    component: "ContextBudgetGarden",
    limitations: [
      "Percentages are conceptual and are not tied to a specific model context window.",
      "The controls do not enforce a minimum viable answer allocation.",
      "Caching and provider-specific token accounting are outside this study.",
    ],
  },
];

export function getExperiment(slug: string): Experiment | undefined {
  return experiments.find((e) => e.slug === slug);
}

export function getExperimentSlugs(): string[] {
  return experiments.map((e) => e.slug);
}
