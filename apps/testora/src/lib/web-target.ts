/**
 * Local vs web targets — the line the destructive-fixture guard and the
 * sign-up gate draw (#701). Pure, so it can be unit-tested.
 */

/** A web (non-local) URL — anything that isn't clearly localhost. Missing or unparseable → web, the safer default. */
export function isWebTarget(url: string | undefined | null): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    const local =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".localhost");
    return !local;
  } catch {
    return true;
  }
}

/**
 * Whether a run unit would touch a web deployment: its (retargeted) page
 * origin, or the run's API base when one is set.
 */
export function unitTargetsWeb(unit: { fixture: { baseUrl?: string } }, apiUrl?: string): boolean {
  return isWebTarget(unit.fixture.baseUrl) || (apiUrl !== undefined && isWebTarget(apiUrl));
}
