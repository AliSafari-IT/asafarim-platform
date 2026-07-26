import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";

/**
 * Whether a specification matches the `task_management` fixture shape
 * (`@asafarim/appbuilder-runtime`'s `taskManagementTemplate`) closely enough
 * for the data-dependent smoke gates (CRUD, role-denial) to drive against
 * it using known page paths/labels/entity ids. Every other specification
 * shape SKIPS these gates with an explicit reason rather than either
 * silently passing (false confidence) or failing (penalizing a
 * legitimately different, valid app shape this milestone's fixture coverage
 * doesn't yet reach) — see docs/appbuilder-m10-validation-qa.md's
 * "known-risk resolution" section for this documented scope boundary.
 */
export function matchesTaskManagementFixture(spec: ApplicationSpecificationType): boolean {
  const entityIds = new Set(spec.entities.filter((e) => !e.archived).map((e) => e.id));
  const roleIds = new Set(spec.roles.filter((r) => !r.archived).map((r) => r.id));
  const pagePaths = new Set(spec.pages.filter((p) => !p.archived).map((p) => p.path));
  return (
    ["project", "task", "team_member"].every((id) => entityIds.has(id)) &&
    ["admin", "manager", "employee_role"].every((id) => roleIds.has(id)) &&
    ["projects", "tasks"].every((path) => pagePaths.has(path))
  );
}
