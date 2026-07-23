import type { Db } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertCapability } from "../repositories/authz";
import { resolveRuntimeContext, type RuntimeContext } from "./runtimeAuth";

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
  if (simulateRoleId) {
    await assertCapability(db, actor, appId, "app.viewPreview");
    return resolveRuntimeContext(db, actor, appId, { simulateRoleId });
  }
  return resolveRuntimeContext(db, actor, appId, {});
}
