import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/**
 * Static permission-completeness analysis directly inspired by the M09 bug
 * that scoped this milestone: `taskManagementTemplate` shipped with ZERO
 * `read` permission entries for `team_member`, so no role — including
 * admin — could ever read team members, silently breaking the Team page and
 * the task-assignee relation dropdown. `validateSpecification`/M04's engine
 * had no way to catch this because an *absent* permission is not a
 * structural error — it is a semantic gap this gate exists specifically to
 * find: for every (role, entity) pair actually reachable through a page,
 * navigation item, or relation-typed field the role's pages expose, at
 * least one explicit `read` permission decision (allow OR deny) must exist.
 * A pair with NO decision at all is the exact defect class this gate blocks
 * — an explicit `deny` is fine (that's an intentional design choice); silent
 * absence is not.
 */
export const permissionsAuthorizationGate: GateDefinition = {
  key: "permissions_authorization",
  version: "1.0.0",
  mandatory: true,
  title: "Permissions and generated-runtime authorization",
  description: "Every role/entity pair reachable through a page, navigation item, or relation field has an explicit read-permission decision — no silent gaps.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const spec = ctx.specPayload;
    const activeRoles = spec.roles.filter((r) => !r.archived).map((r) => r.id);
    const activeEntities = new Set(spec.entities.filter((e) => !e.archived).map((e) => e.id));

    const decidedPairs = new Set(spec.permissions.map((p) => `${p.roleId}:${p.entityId}:read`));

    // Which entities each role can actually REACH: bound directly by a
    // page/component the role can view, or reachable transitively via a
    // relation-typed field on an entity the role can already view (e.g. the
    // task-assignee dropdown needs to read team_member even though no page
    // is dedicated to it).
    const reachableByRole = new Map<string, Set<string>>();
    for (const roleId of activeRoles) reachableByRole.set(roleId, new Set());

    for (const page of spec.pages) {
      if (page.archived) continue;
      const roleIds = page.requiredRoleIds && page.requiredRoleIds.length > 0 ? page.requiredRoleIds : activeRoles;
      for (const component of page.components) {
        if (!component.entityId || !activeEntities.has(component.entityId)) continue;
        for (const roleId of roleIds) {
          reachableByRole.get(roleId)?.add(component.entityId);
        }
      }
    }

    // Transitive closure: a relation field on a reachable entity makes the
    // related entity reachable too (one hop is enough to catch the
    // team_member-via-task-assignee shape; deeper chains are a documented
    // deferral — see docs/appbuilder-m10-validation-qa.md).
    for (const [roleId, entityIds] of reachableByRole) {
      const additions = new Set<string>();
      for (const entityId of entityIds) {
        const entity = spec.entities.find((e) => e.id === entityId);
        if (!entity) continue;
        for (const field of entity.fields) {
          if (field.type === "relation" && field.relationId) {
            const relation = spec.relations.find((r) => r.id === field.relationId);
            if (!relation) continue;
            const otherEntityId = relation.fromEntityId === entityId ? relation.toEntityId : relation.fromEntityId;
            if (activeEntities.has(otherEntityId)) additions.add(otherEntityId);
          }
        }
      }
      additions.forEach((id) => entityIds.add(id));
      reachableByRole.set(roleId, entityIds);
    }

    const gaps: { code: string; message: string }[] = [];
    for (const [roleId, entityIds] of reachableByRole) {
      for (const entityId of entityIds) {
        if (!decidedPairs.has(`${roleId}:${entityId}:read`)) {
          gaps.push({
            code: "missing_read_permission",
            message: `Role "${roleId}" reaches entity "${entityId}" through a page/relation but has no explicit read-permission decision (allow or deny).`,
          });
        }
      }
    }

    if (gaps.length > 0) {
      return {
        status: "failed",
        failureCode: "missing_read_permission",
        failureMessage: `${gaps.length} role/entity permission gap(s) found.`,
        structuredFailures: redactFailures(gaps),
      };
    }

    return { status: "passed", evidence: { rolesChecked: activeRoles.length, permissionsDecided: spec.permissions.length } };
  },
};
