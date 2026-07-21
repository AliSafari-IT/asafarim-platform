/**
 * Route contracts for AppBuilder (M01).
 *
 * Single source of truth for the app's URL shape so pages, links, and tests
 * stay in sync. Later milestones add real params/query contracts (e.g. spec
 * version, preview mode) here rather than inlining path strings elsewhere.
 */

export const routes = {
  /** Landing page. */
  home: () => "/",
  /** List of the signed-in owner/tenant's generated apps. */
  apps: () => "/apps",
  /** Prompt-first creation entry point (spec generation ships in M05/M07). */
  newApp: () => "/apps/new",
  /** A single generated app's detail/overview shell. */
  appDetail: (appId: string) => `/apps/${encodeURIComponent(appId)}`,
  /** Metadata-driven preview runtime for a generated app (ships in M06). */
  appPreview: (appId: string) => `/apps/${encodeURIComponent(appId)}/preview`,
} as const;

export interface AppRouteParams {
  appId: string;
}
