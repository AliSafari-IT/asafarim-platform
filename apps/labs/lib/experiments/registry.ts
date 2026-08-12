export type ExperimentStatus = "prototype" | "active" | "beta" | "paused" | "archived";
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
];

export function getExperiment(slug: string): Experiment | undefined {
  return experiments.find((e) => e.slug === slug);
}

export function getExperimentSlugs(): string[] {
  return experiments.map((e) => e.slug);
}
