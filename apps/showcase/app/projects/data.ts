/**
 * Placeholder showcase entries. Real project content (from the dot-be
 * showcases and asafarim-digital products) is migrated in a later PR;
 * these prove the gallery structure.
 */
export interface ShowcaseProject {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  status: "live" | "beta" | "planned" | "archived";
  glyph: string;
  index: string;
}

export const projects: ShowcaseProject[] = [
  {
    slug: "task-management",
    title: "Task Management",
    summary:
      "End-to-end task management vertical with API and web client, originally built in the asafarim.be ecosystem.",
    tags: ["React", "TypeScript", "PostgreSQL"],
    status: "beta",
    glyph: "TM",
    index: "01",
  },
  {
    slug: "smart-operations",
    title: "Smart Operations Dashboard",
    summary:
      "Operations KPI dashboard showcase with real-time views and reporting.",
    tags: ["React", "Dashboards"],
    status: "beta",
    glyph: "SO",
    index: "02",
  },
  {
    slug: "testora",
    title: "Testora",
    summary:
      "A deterministic Playwright benchmark: a seeded sample app with intentional pass/fail/flaky tests, scored on detection, flake identification, and artifact completeness.",
    tags: ["Testing", "Playwright", "Benchmark"],
    status: "live",
    glyph: "TS",
    index: "03",
  },
  {
    slug: "ai-eval",
    title: "AI Evaluation Lab",
    summary:
      "A provider-neutral, fixture-mode AI benchmark: versioned prompts and synthetic datasets scored for correctness, groundedness, format compliance, latency, cost, and safety — reproducibly, with no API keys.",
    tags: ["AI", "Evaluation", "Benchmark"],
    status: "live",
    glyph: "AE",
    index: "04",
  },
];

export function getProject(slug: string): ShowcaseProject | undefined {
  return projects.find((project) => project.slug === slug);
}
