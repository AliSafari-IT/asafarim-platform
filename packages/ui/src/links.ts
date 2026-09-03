/**
 * Cross-app platform URLs.
 *
 * NEXT_PUBLIC_* vars are inlined per app at build time; the localhost
 * defaults keep local development working without any env file.
 */
// NEXT_PUBLIC_* reads are replaced at build time by the consuming Next.js
// app; this keeps the ui package free of a @types/node dependency.
declare const process: { env: Record<string, string | undefined> };

export interface PlatformLinks {
  web: string;
  hub: string;
  showcase: string;
  admin: string;
  vionto: string;
  edumatch: string;
  testora: string;
  appbuilder: string;
  timelineai: string;
  devtools: string;
  labs: string;
  jobmatch: string;
}

/**
 * Shape of a platform-app registry entry, structurally matching
 * `PlatformApp` from `@asafarim/auth/apps`. Declared here rather than
 * imported so the ui package keeps its zero-dependency-on-auth boundary —
 * pulling @asafarim/auth in would drag next-auth, Prisma, and bcryptjs
 * behind every design-system import.
 */
export interface AppSwitcherSource {
  key: string;
  name: string;
  meta: string;
}

/**
 * Turn registry entries into <AppSwitcher /> links. Entries with no URL in
 * PlatformLinks are dropped, so an app can be added to the registry before
 * its NEXT_PUBLIC_*_URL exists without rendering a dead menu row.
 */
export function toAppSwitcherLinks(
  apps: readonly AppSwitcherSource[],
  links: PlatformLinks
): { label: string; href: string; meta: string }[] {
  return apps
    .filter((app) => app.key in links)
    .map((app) => ({
      label: app.name,
      href: links[app.key as keyof PlatformLinks],
      meta: app.meta,
    }));
}

export function getPlatformLinks(): PlatformLinks {
  return {
    web: process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000",
    hub: process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:3001",
    showcase: process.env.NEXT_PUBLIC_SHOWCASE_URL ?? "http://localhost:3002",
    admin: process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3003",
    vionto: process.env.NEXT_PUBLIC_VIONTO_URL ?? "http://localhost:3004",
    edumatch: process.env.NEXT_PUBLIC_EDUMATCH_URL ?? "http://localhost:3009",
    testora: process.env.NEXT_PUBLIC_TESTORA_URL ?? "http://localhost:3005",
    appbuilder: process.env.NEXT_PUBLIC_APPBUILDER_URL ?? "http://localhost:3006",
    timelineai: process.env.NEXT_PUBLIC_TIMELINEAI_URL ?? "http://localhost:3010",
    // devtools lives on a separate domain (asafarim.be) as its own deployment,
    // not a subdomain of asafarim.com — it is not part of the local dev monorepo,
    // so the default points at the production URL.
    devtools: process.env.NEXT_PUBLIC_DEVTOOLS_URL ?? "https://asafarim.be",
    labs: process.env.NEXT_PUBLIC_LABS_URL ?? "http://localhost:3011",
    jobmatch: process.env.NEXT_PUBLIC_JOBMATCH_URL ?? "http://localhost:3012",
  };
}
