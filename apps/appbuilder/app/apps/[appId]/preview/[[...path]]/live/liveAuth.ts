import type { ApplicationSpecificationType, PermissionType } from "@asafarim/appbuilder-schema";

/**
 * UI-ONLY convenience mirror of `lib/generated-data/runtimeAuth.ts#hasPermission`
 * — used solely to decide whether to SHOW a control (e.g. an Archive
 * button). This never grants access by itself: every mutation this client
 * triggers goes through the real runtime API, which re-derives the actor's
 * membership and re-checks this same permission server-side on every
 * request (see routeHelpers.ts#resolveContextForRequest). Hiding a control
 * here is a convenience, not a security boundary — "UI visibility is not
 * authorization" (see docs/appbuilder-m09-data-engine.md).
 */
export function hasLivePermission(spec: ApplicationSpecificationType, roleIds: string[], entityId: string, verb: PermissionType["verb"]): boolean {
  const matches = spec.permissions.filter((p) => roleIds.includes(p.roleId) && p.entityId === entityId && p.verb === verb);
  if (matches.length === 0) return false;
  if (matches.some((p) => p.effect === "deny")) return false;
  return matches.some((p) => p.effect === "allow");
}
