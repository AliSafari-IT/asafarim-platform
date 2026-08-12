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

// ASafariM apps — the maintainer's own sites, each on its own subdomain, so
// each is its own project with its own default URL. Selecting the app pre-fills
// the right origin (a single shared default would point edumatch runs at the
// portal and vice-versa).
const ASAFARIM_PORTAL: ProjectDef = {
  id: "asafarim-portal",
  name: "ASafariM · Portal",
  baseUrl: process.env.NEXT_PUBLIC_ASAFARIM_PORTAL_URL || "https://portal.asafarim.com",
  apiUrl: process.env.NEXT_PUBLIC_ASAFARIM_PORTAL_URL || "https://portal.asafarim.com",
  brand: { productName: "ASafariM", companyName: "ASafariM Digital" },
};

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
    { slug: "local", name: "Local", baseUrl: TIMELINEAI_LOCAL_BASE, apiUrl: TIMELINEAI_LOCAL_BASE },
    { slug: "remote", name: "Remote", baseUrl: TIMELINEAI_REMOTE_BASE, apiUrl: TIMELINEAI_REMOTE_BASE },
  ],
};

export const PROJECTS: ProjectDef[] = [
  ASAFARIM_TIMELINEAI,
  ASAFARIM_PORTAL,
  ASAFARIM_EDUMATCH,
  ASAFARIM_VIONTO,
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
  return [{ slug: "remote", name: "Remote", baseUrl: project.baseUrl, apiUrl: project.apiUrl }];
}
