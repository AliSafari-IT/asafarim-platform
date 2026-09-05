/**
 * Placeholder showcase entries. Real project content (from the dot-be
 * showcases and asafarim-digital products) is migrated in a later PR;
 * these prove the gallery structure.
 */
import { getPlatformLinks } from "@asafarim/ui";

const platformLinks = getPlatformLinks();

/**
 * Shared building blocks every project draws on. `dependsOn` below references
 * these ids, which is what makes the architecture diagram and the coverage
 * matrix on /projects real data rather than decoration — add a dependency to
 * a project and both visuals change with it.
 */
export type PlatformElementId =
  | "auth"
  | "db"
  | "ui"
  | "storage"
  | "redis"
  | "worker"
  | "ai"
  | "own-db";

export type PlatformTier = "experience" | "shared" | "data";

export interface PlatformElement {
  id: PlatformElementId;
  name: string;
  package: string;
  tier: PlatformTier;
  blurb: string;
}

export const PLATFORM_ELEMENTS: PlatformElement[] = [
  { id: "ui", name: "Design system", package: "@asafarim/ui", tier: "shared", blurb: "Tokens, moods, and brand components." },
  { id: "auth", name: "Identity", package: "@asafarim/auth", tier: "shared", blurb: "Auth.js config, SSO cookie, RBAC helpers." },
  { id: "ai", name: "AI boundary", package: "@asafarim/appbuilder-ai", tier: "shared", blurb: "Server-only provider boundary." },
  { id: "worker", name: "Job runner", package: "BullMQ worker", tier: "shared", blurb: "Durable background pipelines." },
  { id: "db", name: "Platform database", package: "@asafarim/db", tier: "data", blurb: "Shared Prisma schema on PostgreSQL." },
  { id: "own-db", name: "Isolated database", package: "Drizzle + PostgreSQL", tier: "data", blurb: "App-private schema, separate instance." },
  { id: "storage", name: "Object storage", package: "@asafarim/storage", tier: "data", blurb: "S3-compatible media and exports." },
  { id: "redis", name: "Queue / cache", package: "Redis", tier: "data", blurb: "Job queues and rate limiting." },
];

export interface ShowcaseProject {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  status: "live" | "beta" | "planned" | "archived";
  glyph: string;
  index: string;
  /**
   * The deployed app, when there is one. Drives the "Open live" action on the
   * gallery — a project without this is simply not deployed yet, and the card
   * offers only its details page.
   */
  externalUrl?: string;
  /** Full stack, shown on the details page (`tags` stays the short card set). */
  stack: string[];
  /** Shared platform elements this project builds on. */
  dependsOn: PlatformElementId[];
  /** Two to four concrete things worth knowing, for the details page. */
  highlights: string[];
}

export const projects: ShowcaseProject[] = [
  {
    slug: "task-management",
    title: "Task Management",
    summary:
      "A planned AI-native work operating system that turns scattered intent into explainable, outcome-linked execution.",
    tags: ["Next.js", "TypeScript", "AI"],
    status: "planned",
    glyph: "TM",
    index: "01",
    stack: [
      "Next.js",
      "TypeScript",
      "PostgreSQL",
      "Redis",
      "BullMQ",
      "OpenAPI",
    ],
    dependsOn: ["ui", "auth", "ai", "worker", "own-db", "storage", "redis"],
    highlights: [
      "Human-approved AI proposals convert briefs and notes into tasks, dependencies, owners, and delivery plans.",
      "An outcome-linked work graph powers list, board, calendar, timeline, goals, risk, and portfolio views.",
      "A versioned REST API, signed webhooks, and portable exports make integrations first-class rather than an afterthought.",
      "Designed for tasks-ai.asafarim.com with shared platform SSO and an isolated application database.",
    ],
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
    stack: ["React", "TypeScript", "Recharts", "PostgreSQL"],
    dependsOn: ["ui", "auth", "db"],
    highlights: [
      "KPI tiles and trend views composed from the shared design-system primitives.",
      "Reporting queries read the platform schema directly — no separate warehouse.",
    ],
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
    stack: ["Next.js", "TypeScript", "Playwright", "Drizzle", "PostgreSQL"],
    dependsOn: ["ui", "auth", "own-db"],
    highlights: [
      "Seeded sample app with deliberate pass / fail / flaky tests as the fixture.",
      "Scores a run on detection, flake identification, and artifact completeness.",
      "Keeps its own Drizzle database, isolated from the shared platform schema.",
      "Published results are a committed snapshot — nothing executes live.",
    ],
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
    externalUrl: `${platformLinks.labs}/experiments/ai-eval-explorer`,
    stack: ["TypeScript", "Zod", "Vitest", "Provider-neutral adapters"],
    dependsOn: ["ui", "ai"],
    highlights: [
      "Versioned prompts and synthetic datasets — no API keys, no employer data.",
      "Scores correctness, groundedness, format compliance, latency, cost, safety.",
      "Models appear as provider-neutral aliases so runs stay comparable.",
      "Latency and cost are representative fixtures, never live measurements.",
    ],
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
    externalUrl: platformLinks.edumatch,
    stack: ["Next.js", "TypeScript", "Prisma", "PostgreSQL"],
    dependsOn: ["ui", "auth", "db"],
    highlights: [
      "Synthetic students and tutors — no real people, bookings, or payments.",
      "Transparent weighted-factor engine you can adjust live in the browser.",
      "Fairness and stability checks run against the committed fixtures.",
    ],
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
    externalUrl: platformLinks.vionto,
    stack: ["Next.js", "BullMQ", "FFmpeg", "Prisma", "S3", "Redis"],
    dependsOn: ["ui", "auth", "db", "storage", "redis", "worker", "ai"],
    highlights: [
      "Schema-validated brief-to-render pipeline with approval-gated retry.",
      "Seeded stage failures make the recovery path observable, not hypothetical.",
      "Render work runs on a durable BullMQ worker, not in the request cycle.",
      "Cost estimation per render, with no live providers and no real media.",
    ],
  },
  {
    slug: "timelineai",
    title: "TimelineAI",
    summary:
      "Turn a list of events into a polished visual timeline: ten layouts over one content model — vertical, zigzag, circular, roadmap, Gantt, calendar board, and more — with live preview, PNG/JPG/PDF export, and a public gallery. No account needed to try it.",
    tags: ["Visualization", "Next.js", "Export"],
    status: "live",
    glyph: "TL",
    index: "07",
    externalUrl: platformLinks.timelineai,
    stack: ["Next.js", "TypeScript", "Prisma", "Puppeteer", "Playwright", "Redis"],
    dependsOn: ["ui", "auth", "db", "redis"],
    highlights: [
      "One content model, ten layouts — switching layout never touches event data.",
      "Live editor preview renders through the exact component the public page uses.",
      "PNG / JPG / PDF export via headless Chromium against the same renderer.",
      "Guests can build and submit a timeline without an account; admins moderate.",
    ],
  },
  {
    slug: "jobmatch",
    title: "JobMatch",
    summary:
      "An explainable job-search showcase: build a versioned candidate profile, inspect transparent eligibility reasons, and track synthetic demo postings without treating the app as a professional recruiting service.",
    tags: ["Job Search", "Explainability", "Privacy"],
    status: "beta",
    glyph: "JM",
    index: "08",
    externalUrl: platformLinks.jobmatch,
    stack: ["Next.js", "TypeScript", "Prisma", "PostgreSQL", "Zod", "S3-compatible storage"],
    dependsOn: ["ui", "auth", "own-db", "storage"],
    highlights: [
      "CV-derived profiles are editable, explicitly confirmed, and kept as immutable versions.",
      "Search results preserve source attribution and show deterministic eligibility reasons.",
      "The current source is a clearly labelled synthetic Belgian demo dataset, not live vacancies.",
      "The public deployment is a non-commercial portfolio MVP, not a professional hiring service.",
    ],
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
