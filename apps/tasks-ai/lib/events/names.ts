/**
 * Canonical event names (docs/research/event-taxonomy.md). Adding a name
 * here is the only supported way to introduce one — services reference the
 * constant, never a string literal.
 */
export const EVENT = {
  workspaceCreated: "workspace.created",
  workspaceUpdated: "workspace.updated",
  workspaceArchived: "workspace.archived",
  membershipAdded: "membership.added",
  membershipRemoved: "membership.removed",
  membershipRoleChanged: "member.role_changed",
  projectCreated: "project.created",
  projectUpdated: "project.updated",
  projectArchived: "project.archived",
  taskCreated: "task.created",
  taskUpdated: "task.updated",
  taskStatusChanged: "task.status_changed",
  taskAssigned: "task.assigned",
  taskCompleted: "task.completed",
  taskDeleted: "task.deleted",
  taskRestored: "task.restored",
  dependencyLinked: "dependency.linked",
  dependencyUnlinked: "dependency.unlinked",
  viewCreated: "view.created",
  viewUpdated: "view.updated",
  checkAdded: "check.added",
  checkUpdated: "check.updated",
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];

/** Outbox job types the worker knows how to drain. */
export const OUTBOX_TYPE = {
  activityFanout: "activity.fanout",
  searchIndex: "search.index",
  notification: "notification.dispatch",
  /** Testora regression/flake → run the test_diagnosis pipeline (issue #264). */
  testoraDiagnose: "testora.diagnose",
} as const;

export type OutboxType = (typeof OUTBOX_TYPE)[keyof typeof OUTBOX_TYPE];
