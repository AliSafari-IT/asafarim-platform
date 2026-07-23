import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertCapability } from "../repositories/authz";
import { recordAuditEvent } from "../repositories/audit";
import { generateId } from "../db/ids";
import { ConflictError, NotFoundError } from "../errors";
import { loadPinnedSpec } from "./runtimeAuth";
import {
  generatedActivity,
  generatedAppMembers,
  generatedFiles,
  generatedNotifications,
  generatedRecordRelations,
  generatedRecordRevisions,
  generatedRecords,
  generatedRowAccessRules,
  generatedUniquenessClaims,
  generatedWorkflowExecutions,
  releases,
} from "../db/schema";

/**
 * Deterministic task-management demo data — preview environments only.
 * Bypasses `records.ts`'s normal create path deliberately (direct inserts,
 * no workflow triggers) so a reset is fast, idempotent, and never floods
 * members with notifications for demo data nobody actually created.
 *
 * Matches `@asafarim/appbuilder-runtime`'s `taskManagementTemplate` ids
 * exactly (`project`/`task`/`team_member` entities, `admin`/`manager`/
 * `employee_role` roles, `project_ref`/`assignee_ref` relation fields) —
 * see packages/appbuilder-runtime/src/templates/taskManagement.ts.
 */

const TASK_MGMT_IDS = {
  project: "project",
  task: "task",
  teamMember: "team_member",
  admin: "admin",
  manager: "manager",
  employee: "employee_role",
  projectRef: "project_ref",
  assigneeRef: "assignee_ref",
  relationTaskProject: "task_project",
  relationTaskAssignee: "task_assignee",
} as const;

export class ReleasedAppResetError extends ConflictError {
  constructor() {
    super("Cannot reset generated data for an app with a published release.");
    this.name = "ReleasedAppResetError";
  }
}

async function clearExistingGeneratedData(tx: Db, appId: string): Promise<void> {
  // Deleting generatedWorkflowExecutions cascades to
  // generatedWorkflowStepExecutions automatically (ON DELETE CASCADE) —
  // see lib/db/schema.ts.
  await tx.delete(generatedWorkflowExecutions).where(eq(generatedWorkflowExecutions.appId, appId));
  await tx.delete(generatedNotifications).where(eq(generatedNotifications.appId, appId));
  await tx.delete(generatedActivity).where(eq(generatedActivity.appId, appId));
  await tx.delete(generatedFiles).where(eq(generatedFiles.appId, appId));
  await tx.delete(generatedRecordRelations).where(eq(generatedRecordRelations.appId, appId));
  await tx.delete(generatedUniquenessClaims).where(eq(generatedUniquenessClaims.appId, appId));
  await tx.delete(generatedRecordRevisions).where(eq(generatedRecordRevisions.appId, appId));
  await tx.delete(generatedRecords).where(eq(generatedRecords.appId, appId));
  await tx.delete(generatedRowAccessRules).where(eq(generatedRowAccessRules.appId, appId));
}

function insertRecordValues(appId: string, entityId: string, specVersionNumber: number, data: Record<string, unknown>, actorPrincipalId: string) {
  return {
    id: generateId(),
    appId,
    entityId,
    specVersionNumber,
    revision: 1,
    data,
    status: "active" as const,
    createdByPrincipalId: actorPrincipalId,
    updatedByPrincipalId: actorPrincipalId,
  };
}

export interface ResetGeneratedDataInput {
  confirm: boolean;
}

/** Explicit, authorized, idempotent, audited demo-data reset — never reachable by ordinary generated-app end users (see the runtime API route's capability check), and never possible against an app with a published release. */
export async function resetGeneratedData(db: Db, actor: Actor, appId: string, input: ResetGeneratedDataInput): Promise<void> {
  if (!input.confirm) throw new ConflictError("Explicit confirmation is required to reset generated data.");
  // `app.resetGeneratedData` (editor+) is the ONLY capability check this
  // function performs — deliberately not layering `bootstrapOwnerAsAdmin`'s
  // own `app.manageGeneratedMembers` (owner-only) check on top, which would
  // wrongly block an editor from resetting demo data. The admin-membership
  // bootstrap below is inlined instead of calling that function, since
  // authorization for this whole operation was already established above.
  const { app } = await assertCapability(db, actor, appId, "app.resetGeneratedData");

  const [publishedRelease] = await db.select().from(releases).where(and(eq(releases.appId, appId), eq(releases.status, "published"))).limit(1);
  if (publishedRelease) throw new ReleasedAppResetError();

  // Seeded records are stamped with the PINNED preview's version number —
  // the same version `runtimeAuth.ts#loadPinnedSpec` resolves for every
  // runtime read/write — never the latest draft. Seeding against a draft
  // that hasn't been pinned yet would insert records the runtime can't
  // actually serve (every runtime call fails closed with "Pinned preview
  // for app" until a preview succeeds and is pinned), so this requires the
  // same pinned preview precondition the live generated-app already needs.
  let versionNumber: number;
  try {
    ({ versionNumber } = await loadPinnedSpec(db, appId));
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new ConflictError("This app has no pinned preview yet — generate and pin a preview before seeding demo data.");
    }
    throw err;
  }

  await db.transaction(async (tx) => {
    await clearExistingGeneratedData(tx, appId);

    const [existingAdmin] = await tx
      .select()
      .from(generatedAppMembers)
      .where(and(eq(generatedAppMembers.appId, appId), eq(generatedAppMembers.principalId, app.ownerPrincipalId)))
      .limit(1);
    const [adminMember] = existingAdmin
      ? [existingAdmin]
      : await tx
          .insert(generatedAppMembers)
          .values({
            id: generateId(),
            appId,
            principalId: app.ownerPrincipalId,
            roleIds: [TASK_MGMT_IDS.admin],
            status: "active",
            provenance: "owner_bootstrap",
            invitedByPrincipalId: null,
          })
          .returning();

    const managerPrincipalId = `demo-manager-${appId}`;
    const employeePrincipalId = `demo-employee-${appId}`;
    for (const [principalId, roleId] of [
      [managerPrincipalId, TASK_MGMT_IDS.manager],
      [employeePrincipalId, TASK_MGMT_IDS.employee],
    ] as const) {
      const [existing] = await tx.select().from(generatedAppMembers).where(and(eq(generatedAppMembers.appId, appId), eq(generatedAppMembers.principalId, principalId))).limit(1);
      if (!existing) {
        await tx.insert(generatedAppMembers).values({
          id: generateId(),
          appId,
          principalId,
          roleIds: [roleId],
          status: "active",
          provenance: "invited",
          invitedByPrincipalId: actor.principalId,
        });
      }
    }

    const teamMember1 = insertRecordValues(appId, TASK_MGMT_IDS.teamMember, versionNumber, { name: "Morgan Lee", email: "morgan@example.test", job_role: "manager" }, actor.principalId);
    const teamMember2 = insertRecordValues(appId, TASK_MGMT_IDS.teamMember, versionNumber, { name: "Sam Rivera", email: "sam@example.test", job_role: "employee" }, actor.principalId);
    await tx.insert(generatedRecords).values([teamMember1, teamMember2]);
    await tx.insert(generatedUniquenessClaims).values([
      { id: generateId(), appId, entityId: TASK_MGMT_IDS.teamMember, fieldId: "email", valueHash: "morgan@example.test", recordId: teamMember1.id },
      { id: generateId(), appId, entityId: TASK_MGMT_IDS.teamMember, fieldId: "email", valueHash: "sam@example.test", recordId: teamMember2.id },
    ]);

    const project1 = insertRecordValues(appId, TASK_MGMT_IDS.project, versionNumber, { name: "Riverside Renovation", description: "Full kitchen and bath remodel.", status: "active" }, actor.principalId);
    const project2 = insertRecordValues(appId, TASK_MGMT_IDS.project, versionNumber, { name: "Downtown Office Build-out", description: "New office fit-out for a 40-person team.", status: "planning" }, actor.principalId);
    await tx.insert(generatedRecords).values([project1, project2]);

    const tasks = [
      insertRecordValues(appId, TASK_MGMT_IDS.task, versionNumber, { title: "Order kitchen cabinets", status: "in_progress", priority: "high", due_date: "2026-08-01", [TASK_MGMT_IDS.projectRef]: project1.id, [TASK_MGMT_IDS.assigneeRef]: teamMember2.id }, actor.principalId),
      insertRecordValues(appId, TASK_MGMT_IDS.task, versionNumber, { title: "Schedule electrician", status: "todo", priority: "medium", due_date: "2026-08-05", [TASK_MGMT_IDS.projectRef]: project1.id, [TASK_MGMT_IDS.assigneeRef]: teamMember2.id }, actor.principalId),
      insertRecordValues(appId, TASK_MGMT_IDS.task, versionNumber, { title: "Finalize floor plan", status: "done", priority: "high", due_date: "2026-07-15", [TASK_MGMT_IDS.projectRef]: project2.id, [TASK_MGMT_IDS.assigneeRef]: teamMember1.id }, actor.principalId),
      insertRecordValues(appId, TASK_MGMT_IDS.task, versionNumber, { title: "Get permit approval", status: "todo", priority: "low", due_date: "2026-08-20", [TASK_MGMT_IDS.projectRef]: project2.id }, actor.principalId),
    ];
    await tx.insert(generatedRecords).values(tasks);

    const edges = [
      { id: generateId(), appId, relationId: TASK_MGMT_IDS.relationTaskProject, fromRecordId: tasks[0].id, toRecordId: project1.id },
      { id: generateId(), appId, relationId: TASK_MGMT_IDS.relationTaskProject, fromRecordId: tasks[1].id, toRecordId: project1.id },
      { id: generateId(), appId, relationId: TASK_MGMT_IDS.relationTaskProject, fromRecordId: tasks[2].id, toRecordId: project2.id },
      { id: generateId(), appId, relationId: TASK_MGMT_IDS.relationTaskProject, fromRecordId: tasks[3].id, toRecordId: project2.id },
      { id: generateId(), appId, relationId: TASK_MGMT_IDS.relationTaskAssignee, fromRecordId: tasks[0].id, toRecordId: teamMember2.id },
      { id: generateId(), appId, relationId: TASK_MGMT_IDS.relationTaskAssignee, fromRecordId: tasks[1].id, toRecordId: teamMember2.id },
      { id: generateId(), appId, relationId: TASK_MGMT_IDS.relationTaskAssignee, fromRecordId: tasks[2].id, toRecordId: teamMember1.id },
    ];
    await tx.insert(generatedRecordRelations).values(edges);

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generated_data.reset",
      targetType: "app",
      targetId: appId,
      metadata: { adminMemberId: adminMember.id, seededRecords: 2 + 2 + tasks.length },
    });
  });
}
