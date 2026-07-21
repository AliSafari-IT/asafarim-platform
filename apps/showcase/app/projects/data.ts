/**
 * Placeholder showcase entries. Real project content (from the dot-be
 * showcases and asafarim-digital products) is migrated in a later PR;
 * these prove the gallery structure.
 */
import { getPlatformLinks } from "@asafarim/ui";

const platformLinks = getPlatformLinks();

export interface ShowcaseProject {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  status: "live" | "beta" | "planned" | "archived";
  glyph: string;
  index: string;
  /** If set, the project card links to this external app instead of /projects/:slug. */
  externalUrl?: string;
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
    externalUrl: platformLinks.testora,
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
  {
    slug: "edumatch",
    title: "EduMatch",
    summary:
      "An explainable tutor-matching benchmark: synthetic students and tutors, a transparent weighted-factor engine you can adjust live, and fairness/stability checks.",
    tags: ["Matching", "Explainability", "Benchmark"],
    status: "live",
    glyph: "EM",
    index: "05",
  },
  {
    slug: "vionto",
    title: "Vionto Studio",
    summary:
      "A transparent AI media-pipeline benchmark: a schema-validated brief-to-render pipeline with approval-gated retry, seeded stage failures, and cost estimation — no live providers, no real media.",
    tags: ["Pipelines", "Reliability", "Benchmark"],
    status: "live",
    glyph: "VS",
    index: "06",
  },
];

export function getProject(slug: string): ShowcaseProject | undefined {
  return projects.find((project) => project.slug === slug);
}

function translateProject(t: (key: string) => string, project: ShowcaseProject): ShowcaseProject {
  const titleKey = `showcase.projects.${project.slug}.title`;
  const summaryKey = `showcase.projects.${project.slug}.summary`;
  const title = t(titleKey);
  const summary = t(summaryKey);

  return {
    ...project,
    title: title === titleKey ? project.title : title,
    summary: summary === summaryKey ? project.summary : summary,
  };
}

export function getProjects(t: (key: string) => string): ShowcaseProject[] {
  return projects.map((project) => translateProject(t, project));
}

export function getTranslatedProject(
  t: (key: string) => string,
  slug: string
): ShowcaseProject | undefined {
  const project = projects.find((item) => item.slug === slug);
  return project ? translateProject(t, project) : undefined;
}
