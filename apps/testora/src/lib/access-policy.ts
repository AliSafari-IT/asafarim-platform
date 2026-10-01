/**
 * Testora's access policy — the single source of truth for who may do what.
 * Enforced by src/proxy.ts (before any page or route runs), re-checked inside
 * the tester write routes (requireTester, lib/viewer-role.ts), and mirrored in
 * the UI via `canManage` / `canRunTests`, so controls the viewer can't use are
 * hidden or disabled.
 *
 *   signed out   public marketing pages only; app pages → Hub sign-in,
 *                API → 401
 *   member       read everything; preview an AI Workbench handoff
 *   tester       member + run tests, cancel a run, "Update tests", report a
 *                bug (draft, save and file an issue on GitHub)
 *   admin        every write: the tester actions plus apps, requirements,
 *   superadmin   suites, fixtures, cases, target environments and their
 *                secrets, results, editing/deleting issues, webhooks
 *
 * Roles come from the session JWT, which is refreshed at sign-in only
 * (packages/auth/src/config.ts), so a newly granted/revoked `tester` takes
 * effect at the user's next sign-in.
 *
 * Machine-to-machine endpoints carry their own bearer-token checks inside
 * the route and are let through the session gate (SERVICE_ROUTES).
 *
 * Pure, dependency-free functions so they can be unit-tested and run inside
 * the proxy.
 */

/** Pages anyone may see without signing in. */
export const PUBLIC_PAGES = ["/", "/about-this-project", "/roadmap"];

/** The role (besides admin/superadmin) that may run tests and file issues. */
export const TESTER_ROLE = "tester";

/** Error code carried by 403s for the tester-only actions. */
export const TESTER_ROLE_REQUIRED = "TESTER_ROLE_REQUIRED";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Service endpoints authenticated by their own bearer token in the route
 * (TasksAI bundle/artifact reads, test provisioning, the admin console's
 * activity feed). They never carry a user session, so the session gate must
 * not stop them — the route itself rejects a missing/wrong token.
 */
const SERVICE_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/api\/results\/[^/]+\/bundle$/ },
  { method: "GET", pattern: /^\/api\/results\/[^/]+\/artifact\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/provisions$/ },
  { method: "GET", pattern: /^\/api\/internal\/user-activity$/ },
];

/** Writes only testers (and admins) may make — the Run page's own actions. */
const TESTER_WRITES: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/run$/ }, // Run tests
  { method: "DELETE", pattern: /^\/api\/run\/[^/]+$/ }, // cancel a run
  // "Update tests" (re-seed the catalog). The route itself only lets admins
  // confirm an update that would delete tests/results (see app/api/seed).
  { method: "POST", pattern: /^\/api\/seed$/ },
  // Reporting a bug from a failed result: draft it, save it, file it on
  // GitHub. Editing or deleting existing issues stays admin-only.
  { method: "POST", pattern: /^\/api\/issues\/generate$/ },
  { method: "POST", pattern: /^\/api\/issues$/ },
  { method: "POST", pattern: /^\/api\/issues\/[^/]+\/publish$/ },
];

/** Writes any signed-in member may make. */
const MEMBER_WRITES: { method: string; pattern: RegExp }[] = [
  // Previewing an AI Workbench handoff (#678) writes nothing; confirming it stays admin-only.
  { method: "POST", pattern: /^\/api\/imports\/workbench\/preview$/ },
];

/** Reads that expose configuration only admins manage. */
const ADMIN_READS: RegExp[] = [
  /^\/api\/webhooks(\/|$)/,
  // Target secret names (values are never returned) — #702.
  /^\/api\/targets\/secrets(\/|$)/,
];

const matches = (
  rules: { method: string; pattern: RegExp }[],
  method: string,
  pathname: string,
) => rules.some((rule) => rule.method === method && rule.pattern.test(pathname));

export function isAdminRole(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("superadmin");
}

/** Whether the roles may run tests and file issues (tester, admin or superadmin). */
export function isTester(roles: readonly string[]): boolean {
  return roles.includes(TESTER_ROLE) || isAdminRole(roles);
}

/** Whether a request is one of the tester-only writes. */
export function isTesterWrite(method: string, pathname: string): boolean {
  return matches(TESTER_WRITES, method.toUpperCase(), pathname);
}

/** Whether a request may skip the session gate (the route authenticates it). */
export function isServiceRequest(method: string, pathname: string): boolean {
  return matches(SERVICE_ROUTES, method.toUpperCase(), pathname);
}

/**
 * For a signed-in, active user: may they make this request? Pages are all
 * viewable by members (controls they can't use are hidden or disabled in the
 * UI and their APIs are refused here).
 */
export function isAllowed(request: {
  pathname: string;
  method: string;
  roles: readonly string[];
}): boolean {
  const method = request.method.toUpperCase();
  const { pathname, roles } = request;
  if (isAdminRole(roles)) return true;
  if (!pathname.startsWith("/api/")) return true;
  if (READ_METHODS.has(method)) return !ADMIN_READS.some((re) => re.test(pathname));
  if (matches(TESTER_WRITES, method, pathname)) return isTester(roles);
  return matches(MEMBER_WRITES, method, pathname);
}
