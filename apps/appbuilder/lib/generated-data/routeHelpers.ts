import type { Db } from "../db/client";
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../errors";
import { assertCapability } from "../repositories/authz";
import { resolveActiveDomainForHost } from "../routing/resolveAppHost";
import { PRODUCTION, type GeneratedEnvironment } from "./environment";
import { resolveRuntimeContext, type RuntimeContext } from "./runtimeAuth";

const BUILDER_ORIGIN = process.env.NEXT_PUBLIC_APPBUILDER_URL || process.env.APPBUILDER_URL || "http://localhost:3006";

export class UntrustedOriginError extends ForbiddenError {
  constructor() {
    super("Request origin is not allowed for this app.");
    this.name = "UntrustedOriginError";
  }
}

/**
 * A wildcard `*.apps.asafarim.com` origin is NEVER broadly trusted just for
 * sharing that suffix — only the ONE host this exact resolved app/environment
 * is actually reachable at (the builder's own origin for preview, or this
 * specific app's own `app_domains.host` for production) is ever an allowed
 * `Origin` for a mutating request. Requests with no `Origin` header at all
 * (same-origin GETs, non-browser tooling) are not blocked here — this is a
 * cross-origin guard, not a substitute for session/capability checks.
 */
function assertTrustedOrigin(request: Request, environment: GeneratedEnvironment, host: string | null): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = environment === PRODUCTION && host ? `https://${host}` : BUILDER_ORIGIN;
  if (origin !== allowed && origin.replace(/\/$/, "") !== allowed.replace(/\/$/, "")) {
    throw new UntrustedOriginError();
  }
}

/**
 * M11: derives the data environment from HOW this exact request arrived —
 * never from a query parameter, a client-set header, or the URL's own
 * `[appId]` path segment alone. The request's `Host` is resolved against the
 * persisted, ACTIVE `app_domains` table (lib/routing/resolveAppHost.ts);
 * only when that resolution names THIS SAME app is the request treated as
 * production. Every other case — no managed-app host match, a mismatched
 * app id, a reserved/unknown host, or the builder's own
 * `appbuilder.asafarim.com` origin — resolves to `preview`, fail-closed.
 */
async function resolveEnvironmentForRequest(db: Db, appId: string, request: Request): Promise<{ environment: GeneratedEnvironment; host: string | null }> {
  const resolved = await resolveActiveDomainForHost(db, request.headers.get("host"));
  if (resolved && resolved.appId === appId) {
    return { environment: "production", host: resolved.host };
  }
  return { environment: "preview", host: null };
}

/**
 * Resolves the runtime context for an API request, honoring an OPTIONAL
 * `?simulateRoleId=` query param for BUILDER role-simulation. Simulation
 * requires the caller to independently hold a real builder capability
 * (`app.viewPreview`, viewer-rank — the same one that already gates
 * viewing this app's preview at all) — a client cannot grant itself
 * simulated permissions merely by setting a query string; the server
 * re-derives builder authorization on every request. The returned
 * `RuntimeContext.simulated` flag is always present in every API response
 * built from this context so the UI can render a visible "viewing as"
 * label — see docs/appbuilder-m09-data-engine.md#role-simulation.
 */
export async function resolveContextForRequest(db: Db, actor: Actor, appId: string, request: Request): Promise<RuntimeContext> {
  const url = new URL(request.url);
  const simulateRoleId = url.searchParams.get("simulateRoleId") ?? undefined;
  const { environment, host } = await resolveEnvironmentForRequest(db, appId, request);
  assertTrustedOrigin(request, environment, host);
  if (simulateRoleId) {
    await assertCapability(db, actor, appId, "app.viewPreview");
    return resolveRuntimeContext(db, actor, appId, { simulateRoleId, environment });
  }
  return resolveRuntimeContext(db, actor, appId, { environment });
}
