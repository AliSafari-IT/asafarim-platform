/**
 * Who may open /admin/business-plan (and its sub-pages).
 *
 * Two kinds of viewer:
 *  1. Anyone holding the `superadmin` role.
 *  2. Explicitly allow-listed emails from BUSINESS_PLAN_ALLOWLISTED_EMAILS
 *     (a JSON array, e.g. `["admin@asafarim.com","asafarim@gmail.com"]` in
 *     .env.production) — the owner's own account(s) that should see the
 *     strategy doc without holding a platform-wide role.
 *
 * The env var is read SERVER-SIDE only (it is not NEXT_PUBLIC_*): the route
 * gate (app/admin/business-plan/_shared.tsx) evaluates it directly, and the
 * root layout passes the computed decision down to the client nav
 * (components/EduNav.tsx) as a prop — so the nav link and the page gate can
 * never drift, and the allowlist never ships to the browser bundle.
 */

/** Used when BUSINESS_PLAN_ALLOWLISTED_EMAILS is unset (local dev). */
const FALLBACK_ALLOWLIST: readonly string[] = [
  "admin@asafarim.com",
  "asafarim@gmail.com",
];

export function getBusinessPlanAllowlist(): readonly string[] {
  const raw = process.env.BUSINESS_PLAN_ALLOWLISTED_EMAILS?.trim();
  if (!raw) return FALLBACK_ALLOWLIST;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const emails = parsed
        .map((entry) => String(entry).trim().toLowerCase())
        .filter((email) => email !== "");
      if (emails.length > 0) return emails;
    }
  } catch {
    // Malformed JSON — fall back rather than accidentally locking everyone out.
  }
  return FALLBACK_ALLOWLIST;
}

export function canViewBusinessPlan(
  user: { email?: string | null; roles?: string[] | null } | null | undefined,
  allowlist: readonly string[] = getBusinessPlanAllowlist(),
): boolean {
  if (!user) return false;
  if (user.roles?.includes("superadmin")) return true;
  const email = user.email?.trim().toLowerCase();
  return email !== undefined && email !== "" && allowlist.includes(email);
}
