import type { MemberRole } from "./db/generated";
import { ApiError } from "./errors";

/**
 * The single authorization helper (docs/adr/0002-tenant-model.md). Every
 * mutating service calls `authorize(actor, action, resource?)` before it
 * touches data. Reads are scoped by the repository layer; writes are gated
 * here.
 *
 * Role capability is coarse by design in M02: owner ⊃ admin ⊃ member ⊃
 * guest. Project-level overrides (a member who is an admin on one project)
 * are applied by passing the effective role for that project as `actor.role`.
 */
export type Action =
  | "workspace.update"
  | "workspace.archive"
  | "membership.invite"
  | "membership.update_role"
  | "membership.remove"
  | "team.manage"
  | "project.create"
  | "project.update"
  | "project.archive"
  | "task.create"
  | "task.update"
  | "task.delete"
  | "label.manage"
  | "customfield.manage"
  | "view.create"
  | "view.update";

const RANK: Record<MemberRole, number> = { guest: 0, member: 1, admin: 2, owner: 3 };

/** Minimum role required for each action. */
const REQUIRED: Record<Action, MemberRole> = {
  "workspace.update": "admin",
  "workspace.archive": "owner",
  "membership.invite": "admin",
  "membership.update_role": "admin",
  "membership.remove": "admin",
  "team.manage": "admin",
  "project.create": "member",
  "project.update": "member",
  "project.archive": "admin",
  "task.create": "member",
  "task.update": "member",
  "task.delete": "member",
  "label.manage": "member",
  "customfield.manage": "admin",
  "view.create": "member",
  "view.update": "member",
};

export interface Actor {
  membershipId: string;
  platformUserId: string;
  role: MemberRole;
}

export function can(actor: Actor, action: Action): boolean {
  return RANK[actor.role] >= RANK[REQUIRED[action]];
}

/** Throw `forbidden` unless the actor may perform the action. */
export function authorize(actor: Actor, action: Action): void {
  if (!can(actor, action)) {
    throw new ApiError("forbidden", { action, role: actor.role, required: REQUIRED[action] });
  }
}

export function isAtLeast(role: MemberRole, min: MemberRole): boolean {
  return RANK[role] >= RANK[min];
}
