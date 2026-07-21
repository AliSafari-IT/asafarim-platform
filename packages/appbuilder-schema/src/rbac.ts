import { z } from "zod";
import { StableId, DisplayName } from "./ids";
import { PERMISSION_EFFECTS, PERMISSION_VERBS, LIMITS } from "./constants";

export const Role = z.object({
  id: StableId,
  name: DisplayName,
  description: z.string().max(LIMITS.MAX_SHORT_TEXT_LENGTH).optional(),
  archived: z.boolean().default(false),
});
export type RoleType = z.infer<typeof Role>;

/**
 * A single CRUD-shaped grant/denial: role X may/may-not verb Y on entity Z.
 * This governs AppBuilder's *generated-app* RBAC contract only — the actual
 * enforcement engine ships in M09. There is exactly one permission row per
 * (roleId, entityId, verb) tuple; duplicates are a semantic validation
 * error (see validation.ts), not a "last one wins" merge.
 */
export const Permission = z.object({
  id: StableId,
  roleId: StableId,
  entityId: StableId,
  verb: z.enum(PERMISSION_VERBS),
  effect: z.enum(PERMISSION_EFFECTS),
});
export type PermissionType = z.infer<typeof Permission>;
