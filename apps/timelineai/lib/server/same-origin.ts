import "server-only";

/**
 * CSRF guard for cookie-authenticated JSON writes: a browser request that
 * says where it came from must come from this site, and the body must be
 * JSON (which forces a CORS preflight these routes never answer).
 */
export function isSameOriginJson(request: Request): boolean {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
