import { getPlatformLinks } from "@asafarim/ui";

/**
 * Builds the Hub sign-in URL for an unauthenticated request to a protected
 * TasksAI route, with a callback that returns the user to where they were
 * headed. Pure and unit-testable on its own — previously this exact
 * expression was duplicated inline in both `/workspace` and
 * `requireMembership` (workspace-access.ts), where it could only be
 * exercised by actually rendering a Server Component and catching the
 * `redirect()` throw (issue #363's test list explicitly calls out
 * verifying the callback URL, which needs this to be a plain function).
 */
export function buildHubSignInRedirect(callbackPath: string): string {
  const links = getPlatformLinks();
  const callbackUrl = `${links.tasksai}${callbackPath}`;
  return `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
