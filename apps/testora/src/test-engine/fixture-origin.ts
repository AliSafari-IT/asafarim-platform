/** The origin a fixture's pages load from (its resolved, possibly retargeted, baseUrl). */
export function fixtureOrigin(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return undefined; // relative/invalid — the script falls back to its defaults
  }
}
