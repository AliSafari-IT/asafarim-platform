/** A fixture's baseUrl is valid if it's absolute (full override) or a path
 * starting with "/" (resolved against the parent FR's baseUrl). */
export function isValidFixtureBaseUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

/**
 * Resolves the final page URL a fixture should navigate to, given the
 * environment root configured on its parent functional requirement.
 *
 * - fixture.baseUrl is absolute (http/https) → used as-is, full override.
 * - fixture.baseUrl is a relative path (starts with "/") → appended to the
 *   FR's baseUrl, so switching the FR's environment (local vs remote)
 *   moves every fixture under it without touching each one individually.
 * - fixture.baseUrl is empty/undefined → falls back to the FR's baseUrl
 *   directly (fixture targets the FR's root).
 */
export function resolveFixtureBaseUrl(
  frBaseUrl: string | null | undefined,
  fixtureBaseUrl: string | null | undefined,
): string | undefined {
  if (fixtureBaseUrl && /^https?:\/\//i.test(fixtureBaseUrl)) {
    return fixtureBaseUrl;
  }
  if (fixtureBaseUrl && fixtureBaseUrl.startsWith("/")) {
    if (!frBaseUrl) return fixtureBaseUrl;
    return `${frBaseUrl.replace(/\/+$/, "")}${fixtureBaseUrl}`;
  }
  if (fixtureBaseUrl) return fixtureBaseUrl;
  return frBaseUrl ?? undefined;
}
