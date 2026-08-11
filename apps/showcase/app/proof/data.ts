/**
 * Public engineering-proof data contract.
 *
 * Everything exported here is explicitly allow-listed and safe to render on
 * a public page. It answers "what backs this claim, when was it true, and
 * how was it measured" — never "what is the live state of the system right
 * now." See docs/proof-board-plan.md for the rules this file must follow.
 *
 * Hard rule: do not add a field here that carries a hostname, IP, port,
 * database name/URL, secret, internal log line, or admin-only endpoint.
 * If you're unsure whether a fact is safe to publish, it isn't — ask first.
 */
import fs from "node:fs";
import path from "node:path";

export type Freshness = "live" | "last-known" | "not-yet-measured";

export interface ProofMetric {
  label: string;
  value: string;
  method: string;
  measuredAt: string; // ISO date — always the actual measurement time, never "now"
  freshness: Freshness;
}

export interface PackageCard {
  name: string;
  version: string;
  kind: "package" | "app";
}

export interface ChangelogEntry {
  date: string;
  title: string;
  sha: string;
  url: string;
}

export interface ArchitectureNode {
  id: string;
  name: string;
  tier: "experience" | "shared" | "data";
  blurb: string;
}

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const REPO_URL = "https://github.com/AliSafari-IT/asafarim-platform";

/** Reads packages/*\/package.json + the app itself for name+version only. */
function readWorkspaceVersions(): PackageCard[] {
  const cards: PackageCard[] = [];
  const groups: Array<{ dir: string; kind: PackageCard["kind"] }> = [
    { dir: "packages", kind: "package" },
    { dir: "apps", kind: "app" },
  ];

  for (const group of groups) {
    const groupDir = path.join(REPO_ROOT, group.dir);
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(groupDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgPath = path.join(groupDir, entry, "package.json");
      try {
        const raw = fs.readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(raw) as { name?: string; version?: string; private?: boolean };
        if (!pkg.name || !pkg.version) continue;
        cards.push({ name: pkg.name, version: pkg.version, kind: group.kind });
      } catch {
        // package.json missing or unreadable — skip silently, never throw
        // a build over an incomplete public-proof surface.
      }
    }
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

/** A curated slice of shipped, user-visible milestones — not raw commit noise. */
export function getChangelog(): ChangelogEntry[] {
  return CHANGELOG_SEED;
}

// Curated by hand from `git log --grep="^feat" --pretty=format:"%h|%ad|%s"`
// on 2026-08-11. Regenerate periodically; do not hand-edit the sha/date pairs.
const CHANGELOG_SEED: ChangelogEntry[] = [
  { date: "2026-08-11", title: "EduMatch: age-aware student accounts, parent-managed minors", sha: "708f4af", url: `${REPO_URL}/commit/708f4af` },
  { date: "2026-08-11", title: "EduMatch: student avatar system with 13+ photo restriction", sha: "ab9b2f0", url: `${REPO_URL}/commit/ab9b2f0` },
  { date: "2026-08-11", title: "EduMatch: multi-aspect ratings, tutor dynamic resume, rating filter", sha: "488c65b", url: `${REPO_URL}/commit/488c65b` },
  { date: "2026-08-10", title: "EduMatch: learning-brief experience — conversational intake, matching, journey", sha: "ca6cfb0", url: `${REPO_URL}/commit/ca6cfb0` },
  { date: "2026-08-10", title: "Admin: advanced platform console — table toolkit, settings v2, access matrix", sha: "bba7452", url: `${REPO_URL}/commit/bba7452` },
  { date: "2026-08-09", title: "Showcase: honest \"showcase project\" positioning across public product apps", sha: "48d3927", url: `${REPO_URL}/commit/48d3927` },
  { date: "2026-08-09", title: "Admin: centralized Seed Data management — read-only core", sha: "c0077ed", url: `${REPO_URL}/commit/c0077ed` },
  { date: "2026-08-09", title: "TimelineAI: three timeline-only layouts and themes shipped", sha: "4c6a0c7", url: `${REPO_URL}/commit/4c6a0c7` },
];

export const ARCHITECTURE_NODES: ArchitectureNode[] = [
  { id: "hub", name: "Hub", tier: "experience", blurb: "Central sign-in gateway; every app redirects here when unauthenticated." },
  { id: "web", name: "Web / Showcase / Admin / Vionto / EduMatch / TimelineAI", tier: "experience", blurb: "Next.js 16 App Router apps sharing the design system and auth cookie." },
  { id: "auth", name: "@asafarim/auth", tier: "shared", blurb: "Auth.js v5 config, JWT sessions, RBAC helpers, app registry." },
  { id: "ui", name: "@asafarim/ui", tier: "shared", blurb: "CSS design tokens, AppShell, DataTable, and brand components." },
  { id: "i18n", name: "@asafarim/shared-i18n", tier: "shared", blurb: "Locale resolution and dictionaries for en/nl/fr/de/lb." },
  { id: "db", name: "@asafarim/db (Prisma)", tier: "data", blurb: "Shared platform schema: users, RBAC, audit log, EduMatch, TimelineAI." },
  { id: "isolated-db", name: "Testora / AppBuilder databases (Drizzle)", tier: "data", blurb: "Per-app isolated Postgres instances, deliberately not shared." },
  { id: "queue", name: "Redis + BullMQ", tier: "data", blurb: "Background job queues for Vionto's render pipeline and AppBuilder's AI generation." },
];

export const SECURITY_BOUNDARIES = [
  {
    title: "Single sign-on, shared cookie",
    body: "Hub issues a JWT session on a cookie scoped to the shared apex domain. Every other app validates that session; none of them hold a separate credential store.",
  },
  {
    title: "RBAC is checked server-side, per app",
    body: "Role/permission checks run in each app's own middleware and API routes against the shared platform schema — a client-side role flag is never trusted for access control.",
  },
  {
    title: "Isolated databases stay isolated",
    body: "Testora and AppBuilder each run against their own Postgres instance specifically so a bug in one app's queries can't reach platform user data.",
  },
  {
    title: "Secrets never leave the server boundary",
    body: "API keys and connection strings are decrypted server-side from an age-encrypted file at deploy time; they are not present in any client bundle or public repository file.",
  },
];

export const DEPLOYMENT_TOPOLOGY = {
  summary:
    "Docker Compose stack behind a reverse proxy, deployed by pushing to main. Each app builds as its own standalone Next.js image; a background worker process runs alongside the apps that need one (Vionto, AppBuilder).",
  steps: [
    "GitHub Actions triggers on push to main.",
    "The deploy job connects over SSH to the host and runs the repository's deploy script.",
    "The script pulls the latest commit, decrypts environment secrets from the committed encrypted file, and rebuilds images sequentially.",
    "The reverse proxy routes each subdomain to its container; the stack restarts with zero manual steps.",
  ],
  note: "Host address, credentials, and internal service ports are intentionally not published here — see the Rules section above.",
};

export const CI_METRICS: ProofMetric[] = [
  {
    label: "Build / lint / typecheck",
    value: "Not yet wired to a public CI artifact",
    method: "Planned: turbo build && turbo lint && turbo typecheck on every PR, publishing a JSON summary as a workflow artifact.",
    measuredAt: "2026-08-11",
    freshness: "not-yet-measured",
  },
  {
    label: "Accessibility snapshot",
    value: "Not yet measured",
    method: "Planned: Lighthouse CI against the deployed showcase, run on a schedule, published with the report's own timestamp.",
    measuredAt: "2026-08-11",
    freshness: "not-yet-measured",
  },
  {
    label: "Performance snapshot",
    value: "Not yet measured",
    method: "Planned: Lighthouse CI (performance category), same pipeline as accessibility.",
    measuredAt: "2026-08-11",
    freshness: "not-yet-measured",
  },
];

export function getPackageCards(): PackageCard[] {
  return readWorkspaceVersions();
}
