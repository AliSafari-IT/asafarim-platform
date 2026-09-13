import "server-only";
import type { RequestContext } from "../context";
import { getAiSettings } from "../ai/settings";
import type { WorkspaceHomeData } from "./state";

export type { HomeProject, HomeTask, WorkspaceHomeData } from "./state";

/**
 * Due dates are stored as UTC calendar midnights (an HTML date input parsed
 * with `new Date("YYYY-MM-DD")`), so the overdue / due-today boundaries must
 * be UTC midnights too — server-local midnight plus 24h misclassifies both on
 * non-UTC servers and across DST.
 */
function utcMidnight(now: Date, dayOffset = 0): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset),
  );
}

/**
 * Everything the workspace home (issue #365) needs, in one server round
 * trip. Scoped by `ctx.workspaceId` like every other read; guests only see
 * projects they belong to, matching the Projects and Copilot pages.
 */
export async function workspaceHomeData(
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<WorkspaceHomeData> {
  const guestScope =
    ctx.actor.role === "guest"
      ? { members: { some: { membership: { platformUserId: ctx.actor.platformUserId } } } }
      : {};

  const projectRows = await ctx.db.project.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null, ...guestScope },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true, name: true },
  });
  const visibleProjectIds = projectRows.map((p) => p.id);

  const openScope = {
    workspaceId: ctx.workspaceId,
    archivedAt: null,
    completedAt: null,
    projectId: { in: visibleProjectIds },
  };
  const today = utcMidnight(now);
  const tomorrow = utcMidnight(now, 1);

  const [
    openTaskCount,
    assignedAnyCount,
    assignedOpenCount,
    overdueCount,
    dueTodayCount,
    unassignedCount,
    completedCount,
    pendingProposalCount,
    openPerProject,
    myNextRows,
    latestProposalRow,
    aiSettings,
  ] = await Promise.all([
    ctx.db.task.count({ where: openScope }),
    ctx.db.task.count({ where: { ...openScope, assigneeId: { not: null } } }),
    ctx.db.task.count({ where: { ...openScope, assigneeId: ctx.actor.membershipId } }),
    ctx.db.task.count({
      where: { ...openScope, assigneeId: ctx.actor.membershipId, dueDate: { lt: today } },
    }),
    ctx.db.task.count({
      where: {
        ...openScope,
        assigneeId: ctx.actor.membershipId,
        dueDate: { gte: today, lt: tomorrow },
      },
    }),
    ctx.db.task.count({ where: { ...openScope, assigneeId: null } }),
    ctx.db.task.count({
      where: {
        workspaceId: ctx.workspaceId,
        archivedAt: null,
        completedAt: { not: null },
        projectId: { in: visibleProjectIds },
      },
    }),
    ctx.db.proposal.count({
      where: { workspaceId: ctx.workspaceId, state: { in: ["draft", "previewed"] } },
    }),
    ctx.db.task.groupBy({ by: ["projectId"], where: openScope, _count: { _all: true } }),
    ctx.db.task.findMany({
      where: { ...openScope, assigneeId: ctx.actor.membershipId },
      orderBy: [{ dueDate: "asc" }, { position: "asc" }],
      take: 5,
      select: { id: true, title: true, dueDate: true, projectId: true },
    }),
    ctx.db.proposal.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { state: true, summary: true, createdAt: true },
    }),
    getAiSettings(ctx),
  ]);

  const openByProject = new Map<string, number>();
  for (const row of openPerProject) openByProject.set(row.projectId, row._count._all);
  const keyById = new Map(projectRows.map((p) => [p.id, p.key]));

  return {
    counts: {
      projectCount: projectRows.length,
      openTaskCount,
      assignedAnyCount,
      assignedOpenCount,
      overdueCount,
      dueTodayCount,
      unassignedCount,
      completedCount,
      pendingProposalCount,
      aiEnabled: aiSettings.enabled,
    },
    projects: projectRows.slice(0, 6).map((p) => ({
      ...p,
      openCount: openByProject.get(p.id) ?? 0,
    })),
    myNext: myNextRows.map((t) => ({
      id: t.id,
      title: t.title,
      projectKey: keyById.get(t.projectId) ?? "",
      dueDate: t.dueDate?.toISOString() ?? null,
    })),
    defaultProjectId: projectRows[0]?.id ?? null,
    latestProposal: latestProposalRow
      ? {
          state: latestProposalRow.state,
          summary: latestProposalRow.summary,
          at: latestProposalRow.createdAt.toISOString(),
        }
      : null,
  };
}
