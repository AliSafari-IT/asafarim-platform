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

// The "Local" target is always localhost — the site on :3233, the API on :3234
// — independent of any deployment env var (NEXT_PUBLIC_WEBAPP_BASE_URL is set to
// the live domain in production, so it must NOT define Local). The "Remote"
// target is env-driven so no real product domain is baked into source, falling
// back to the configured default.
const LOCAL_BASE = "http://localhost:3233";
const LOCAL_API = "http://localhost:3234/api/v1";
const WEBAPP_REMOTE_BASE = process.env.NEXT_PUBLIC_WEBAPP_REMOTE_BASE_URL || "https://immostory.ai";
const WEBAPP_REMOTE_API =
  process.env.NEXT_PUBLIC_WEBAPP_REMOTE_API_URL || "https://api.immostory.ai/api/v1";

// The primary app under test — ImmoStory. It owns the original catalog (auth,
// registration, scraper, video-gen, admin, contact, …). Its canonical URL is the
// live site; the Local / Remote targets let a run point at localhost or the
// deployment without changing any test content. The display name is env-override-
// able. (Was historically the generic "webapp" project; renamed so the catalog
// belongs to the real app it tests.)
const IMMOSTORY_PROJECT: ProjectDef = {
  id: "immostory",
  name: process.env.NEXT_PUBLIC_WEBAPP_NAME || "ImmoStory",
  baseUrl: WEBAPP_REMOTE_BASE,
  apiUrl: WEBAPP_REMOTE_API,
  targets: [
    { slug: "local", name: "Local", baseUrl: LOCAL_BASE, apiUrl: LOCAL_API },
    { slug: "remote", name: "Remote", baseUrl: WEBAPP_REMOTE_BASE, apiUrl: WEBAPP_REMOTE_API },
  ],
};

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

// Immo Local — a local deployment of the ImmoStory app. Shares the same test
// catalog as the main ImmoStory project but targets the local dev server by
// default. The display name and URLs are env-overrideable.
const IMMO_LOCAL_PROJECT: ProjectDef = {
  id: "immo-local",
  name: process.env.NEXT_PUBLIC_IMMO_LOCAL_NAME || "Immo Local",
  baseUrl: process.env.NEXT_PUBLIC_IMMO_LOCAL_BASE_URL || LOCAL_BASE,
  apiUrl: process.env.NEXT_PUBLIC_IMMO_LOCAL_API_URL || LOCAL_API,
  targets: [
    { slug: "local", name: "Local", baseUrl: LOCAL_BASE, apiUrl: LOCAL_API },
  ],
};

export const PROJECTS: ProjectDef[] = [
  IMMOSTORY_PROJECT,
  IMMO_LOCAL_PROJECT,
  ASAFARIM_PORTAL,
  ASAFARIM_EDUMATCH,
  ASAFARIM_VIONTO,
];

/** The app new catalog entries (and untagged seed bundles) belong to by default. */
export const DEFAULT_PROJECT_ID = IMMOSTORY_PROJECT.id;

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
