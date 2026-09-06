import "server-only";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { toCsv } from "./csv";

/**
 * Workspace data export (docs: M05 "exports round-trip core entities") and
 * a deletion manifest (what a delete would remove). Admin+ only.
 */
export async function exportWorkspace(ctx: RequestContext, format: "json" | "csv") {
  authorize(ctx.actor, "workspace.update");
  const db = ctx.db;
  const ws = ctx.workspaceId;

  const [workspace, memberships, projects, tasks, comments, labels] = await Promise.all([
    db.workspace.findUnique({ where: { id: ws }, select: { id: true, name: true, slug: true, createdAt: true } }),
    db.membership.findMany({ where: { workspaceId: ws }, select: { id: true, platformUserId: true, role: true, archivedAt: true } }),
    db.project.findMany({ where: { workspaceId: ws }, select: { id: true, key: true, name: true, description: true, visibility: true, archivedAt: true } }),
    db.task.findMany({
      where: { workspaceId: ws },
      select: {
        id: true, projectId: true, parentId: true, title: true, description: true,
        assigneeId: true, statusId: true, estimate: true, startDate: true, dueDate: true,
        completedAt: true, source: true, archivedAt: true, createdAt: true,
      },
    }),
    db.comment.findMany({ where: { workspaceId: ws, deletedAt: null }, select: { id: true, taskId: true, authorId: true, body: true, createdAt: true } }),
    db.label.findMany({ where: { workspaceId: ws }, select: { id: true, name: true, color: true } }),
  ]);

  if (format === "json") {
    return {
      contentType: "application/json",
      filename: `${workspace?.slug ?? "workspace"}-export.json`,
      body: JSON.stringify({ workspace, memberships, projects, tasks, comments, labels }, null, 2),
    };
  }

  // CSV bundle: one tasks.csv is the useful round-trip artifact; the rest
  // ship as JSON inside a README-style header comment is overkill — return
  // the tasks CSV, formula-injection-safe.
  const taskCsv = toCsv(
    tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      parentId: t.parentId ?? "",
      title: t.title,
      description: t.description ?? "",
      assigneeId: t.assigneeId ?? "",
      estimate: t.estimate ?? "",
      startDate: t.startDate?.toISOString() ?? "",
      dueDate: t.dueDate?.toISOString() ?? "",
      completedAt: t.completedAt?.toISOString() ?? "",
      source: t.source,
    })),
    ["id", "projectId", "parentId", "title", "description", "assigneeId", "estimate", "startDate", "dueDate", "completedAt", "source"],
  );
  return {
    contentType: "text/csv",
    filename: `${workspace?.slug ?? "workspace"}-tasks.csv`,
    body: taskCsv,
  };
}

export async function deletionManifest(ctx: RequestContext) {
  authorize(ctx.actor, "workspace.archive");
  const db = ctx.db;
  const ws = ctx.workspaceId;
  const [projects, tasks, comments, attachments, memberships, notifications] = await Promise.all([
    db.project.count({ where: { workspaceId: ws } }),
    db.task.count({ where: { workspaceId: ws } }),
    db.comment.count({ where: { workspaceId: ws } }),
    db.attachment.count({ where: { workspaceId: ws } }),
    db.membership.count({ where: { workspaceId: ws } }),
    db.notification.count({ where: { workspaceId: ws } }),
  ]);
  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    wouldDelete: { projects, tasks, comments, attachments, memberships, notifications },
    note: "Deletion is irreversible. Attachment bytes in object storage are removed by a separate retention hook.",
  };
}
