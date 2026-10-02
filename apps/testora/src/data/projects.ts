// Project (app) registry — testora can hold the test catalogs of several apps
// at once. Every functional requirement carries a `projectId`; the Run page and
// the Cases/Fixtures/Suites lists filter the whole catalog by the active
// project, and selecting a project pre-fills the Target environment (URLs +
// branding) from its defaults. This is what makes "point at a different domain"
// run that domain's OWN tests instead of another app's.
//
// Add a new app by appending an entry here and tagging its requirements with the
// matching `projectId` (see how the seed bundles set it).

/**
 * A named deployment the Run page can point at (Local, Remote, …). These are the
 * built-in targets seeded into the `target_environments` table per app; users can
 * add more from the Run page (those live only in the DB, not here).
 */
export interface TargetDef {
  /** Stable slug — combined with the project id to form the seeded row id. */
  slug: string;
  /** Label shown in the Target environment dropdown. */
  name: string;
  baseUrl: string;
  apiUrl: string;
  /** The Hub this deployment signs in through (null/omitted = no Hub SSO). */
  hubUrl?: string | null;
}

export interface ProjectDef {
  /** Stable slug stored on each functional requirement's `projectId`. */
  id: string;
  /** Human label shown in the App selector. */
  name: string;
  /** Default site origin pre-filled into the Target environment. */
  baseUrl: string;
  /** Default API base pre-filled into the Target environment. */
  apiUrl: string;
  /** Optional default branding for exported reports. */
  brand?: { productName?: string; companyName?: string };
  /**
   * Built-in target environments seeded for this app. When omitted, a single
   * "Remote" target is derived from `baseUrl`/`apiUrl` at seed time.
   */
  targets?: TargetDef[];
}

// TimelineAI's Local target is always localhost:3010 (its dev port), independent
// of any deployment env var. The Remote target is env-driven so no real product
// domain is baked into source, falling back to the configured default.
const TIMELINEAI_LOCAL_BASE = process.env.NEXT_PUBLIC_ASAFARIM_TIMELINEAI_LOCAL_URL || "http://localhost:3010";
const TIMELINEAI_REMOTE_BASE =
  process.env.NEXT_PUBLIC_ASAFARIM_TIMELINEAI_URL || "https://tlai.asafarim.com";

// The Hub each kind of target signs in through (#700): a Local run must use the
// local Hub (port 3001), a Remote run the production one.
export const LOCAL_HUB_URL = process.env.NEXT_PUBLIC_ASAFARIM_HUB_LOCAL_URL || "http://localhost:3001";
export const REMOTE_HUB_URL = process.env.NEXT_PUBLIC_ASAFARIM_HUB_URL || "https://hub.asafarim.com";

// ASafariM apps — the maintainer's own sites, each on its own subdomain, so
// each is its own project with its own default URL. Selecting the app pre-fills
// the right origin (a single shared default would point edumatch runs at the
// portal and vice-versa).
const ASAFARIM_EDUMATCH: ProjectDef = {
  id: "asafarim-edumatch",
  name: "ASafariM · EduMatch",
  baseUrl: process.env.NEXT_PUBLIC_ASAFARIM_EDUMATCH_URL || "https://edumatch.asafarim.com",
  apiUrl: process.env.NEXT_PUBLIC_ASAFARIM_EDUMATCH_URL || "https://edumatch.asafarim.com",
  brand: { productName: "EduMatch", companyName: "ASafariM Digital" },
};

const ASAFARIM_VIONTO: ProjectDef = {
  id: "asafarim-vionto",
  name: "ASafariM · Vionto",
  baseUrl: process.env.NEXT_PUBLIC_ASAFARIM_VIONTO_URL || "https://vionto.asafarim.com",
  apiUrl: process.env.NEXT_PUBLIC_ASAFARIM_VIONTO_URL || "https://vionto.asafarim.com",
  brand: { productName: "Vionto", companyName: "ASafariM Digital" },
};

// ASafariM TimelineAI — AI-assisted timeline builder, on its own subdomain and
// signing in via Hub SSO (see docs/architecture.md). Local / Remote targets let
// a run point at localhost:3010 or tlai.asafarim.com without changing any test
// content.
const ASAFARIM_TIMELINEAI: ProjectDef = {
  id: "asafarim-timelineai",
  name: "ASafariM · TimelineAI",
  baseUrl: TIMELINEAI_REMOTE_BASE,
  apiUrl: TIMELINEAI_REMOTE_BASE,
  brand: { productName: "TimelineAI", companyName: "ASafariM Digital" },
  targets: [
    { slug: "local", name: "Local", baseUrl: TIMELINEAI_LOCAL_BASE, apiUrl: TIMELINEAI_LOCAL_BASE, hubUrl: LOCAL_HUB_URL },
    { slug: "remote", name: "Remote", baseUrl: TIMELINEAI_REMOTE_BASE, apiUrl: TIMELINEAI_REMOTE_BASE, hubUrl: REMOTE_HUB_URL },
  ],
};

// ASafariM TasksAI (#742) — AI-assisted task workspace, signing in via Hub SSO.
// Read when this module loads: at `db:seed` / "Update tests" time on the server
// (and inlined at build time where a client bundle imports this file).
//   NEXT_PUBLIC_ASAFARIM_TASKSAI_LOCAL_URL   Local app origin (default http://localhost:3013, its dev port)
//   NEXT_PUBLIC_ASAFARIM_TASKSAI_URL         Remote smoke app origin (default https://tasks-ai.asafarim.com)
//   NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_URL    Remote test environment app origin — no default
//   NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_HUB_URL  …and the Hub it signs in through — no default
// The Remote test environment (the only remote target mutation fixtures may
// use) is seeded only when both TEST variables are set: there is no staging
// hostname to guess, and it must never fall back to production.
const TASKSAI_LOCAL_BASE = process.env.NEXT_PUBLIC_ASAFARIM_TASKSAI_LOCAL_URL || "http://localhost:3013";
const TASKSAI_REMOTE_BASE = process.env.NEXT_PUBLIC_ASAFARIM_TASKSAI_URL || "https://tasks-ai.asafarim.com";
const TASKSAI_TEST_BASE = process.env.NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_URL || "";
const TASKSAI_TEST_HUB = process.env.NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_HUB_URL || "";

export const TASKSAI_PROJECT_ID = "asafarim-tasks-ai";

const ASAFARIM_TASKSAI: ProjectDef = {
  id: TASKSAI_PROJECT_ID,
  name: "ASafariM · TasksAI",
  baseUrl: TASKSAI_REMOTE_BASE,
  apiUrl: TASKSAI_REMOTE_BASE,
  brand: { productName: "TasksAI", companyName: "ASafariM Digital" },
  targets: [
    // A hosted Testora runner can't reach a developer's localhost (and the
    // strict target policy refuses it): Local runs need a local Testora.
    {
      slug: "local",
      name: "Local (local Testora only)",
      baseUrl: TASKSAI_LOCAL_BASE,
      apiUrl: TASKSAI_LOCAL_BASE,
      hubUrl: LOCAL_HUB_URL,
    },
    // Read-only smoke against the deployment: never a mutation target.
    { slug: "remote-smoke", name: "Remote smoke", baseUrl: TASKSAI_REMOTE_BASE, apiUrl: TASKSAI_REMOTE_BASE, hubUrl: REMOTE_HUB_URL },
    ...(TASKSAI_TEST_BASE && TASKSAI_TEST_HUB
      ? [
          {
            slug: "remote-test",
            name: "Remote test environment",
            baseUrl: TASKSAI_TEST_BASE,
            apiUrl: TASKSAI_TEST_BASE,
            hubUrl: TASKSAI_TEST_HUB,
          },
        ]
      : []),
  ],
};

export const PROJECTS: ProjectDef[] = [
  ASAFARIM_TIMELINEAI,
  ASAFARIM_EDUMATCH,
  ASAFARIM_VIONTO,
  ASAFARIM_TASKSAI,
];

/** The app new catalog entries (and untagged seed bundles) belong to by default. */
export const DEFAULT_PROJECT_ID = ASAFARIM_TIMELINEAI.id;

export function getProject(id: string | null | undefined): ProjectDef | undefined {
  return PROJECTS.find((p) => p.id === id);
}

/**
 * The built-in target environments to seed for a project. Uses the project's
 * explicit `targets` when defined, otherwise derives a single "Remote" from its
 * default URLs so every app has at least one selectable target.
 */
export function projectSeedTargets(project: ProjectDef): TargetDef[] {
  if (project.targets?.length) return project.targets;
  // Every seeded ASafariM app signs in through Hub.
  return [
    { slug: "remote", name: "Remote", baseUrl: project.baseUrl, apiUrl: project.apiUrl, hubUrl: REMOTE_HUB_URL },
  ];
}
