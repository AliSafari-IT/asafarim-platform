import "server-only";
import { z } from "zod";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { getProjectOr404 } from "../repositories/projects";
import { stageRows, type FieldMapping, type StagedRow } from "./parse";

export const createImportSchema = z.object({
  kind: z.enum(["csv", "json"]),
  filename: z.string().min(1).max(255),
  projectId: z.string(),
  mapping: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    estimate: z.string().optional(),
    externalId: z.string().optional(),
  }),
  content: z.string().min(1).max(5_000_000),
});

/** Create + dry-run validate. No tasks are written yet. */
export async function createImport(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "task.create");
  const data = createImportSchema.parse(input);
  const project = await getProjectOr404(ctx, data.projectId);

  let staged: { rows: StagedRow[]; totalRows: number };
  try {
    staged = stageRows(data.kind, data.content, data.mapping as FieldMapping);
  } catch (err) {
    throw new ApiError("validation_failed", {
      file: err instanceof Error ? err.message : "could not parse file",
    });
  }

  const failedRows = staged.rows.filter((r) => r.status === "error").length;
  const job = await ctx.db.importJob.create({
    data: {
      workspaceId: ctx.workspaceId,
      membershipId: ctx.actor.membershipId,
      kind: data.kind,
      filename: data.filename,
      mapping: { ...data.mapping, projectId: project.id } as Prisma.InputJsonValue,
      state: "dry_run_ready",
      totalRows: staged.totalRows,
      failedRows,
      errors: staged.rows
        .filter((r) => r.status === "error")
        .slice(0, 200)
        .map((r) => ({ rowKey: r.rowKey, errors: r.errors })) as Prisma.InputJsonValue,
      rows: staged.rows as unknown as Prisma.InputJsonValue,
    },
  });
  return summarize(job);
}

export async function getImport(ctx: RequestContext, id: string) {
  const job = await ctx.db.importJob.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
  });
  if (!job) throw new ApiError("not_found");
  return summarize(job);
}

/**
 * Apply the staged rows. Idempotent and resumable: each staged row is
 * marked `applied` in the job's `rows` json as it lands, and progress is
 * persisted every 25 rows. Re-calling apply (after success or a crash)
 * skips rows already marked `applied`, so no task is created twice and a
 * crashed run resumes from the first unapplied row. `error` and
 * `duplicate` rows are never applied.
 */
export async function applyImport(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "task.create");
  const job = await ctx.db.importJob.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!job) throw new ApiError("not_found");
  if (job.state === "completed") return summarize(job);
  if (job.state !== "dry_run_ready" && job.state !== "applying") {
    throw new ApiError("validation_failed", { state: job.state });
  }

  const mapping = job.mapping as { projectId: string };
  const rows = job.rows as unknown as (StagedRow & { applied?: boolean })[];
  await ctx.db.importJob.update({ where: { id }, data: { state: "applying" } });

  let applied = job.appliedRows;
  for (const row of rows) {
    if (row.applied || row.status === "error" || row.status === "duplicate") continue;
    await ctx.db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          workspaceId: ctx.workspaceId,
          projectId: mapping.projectId,
          title: row.data.title,
          description: row.data.description,
          dueDate: row.data.dueDate ? new Date(row.data.dueDate) : undefined,
          estimate: row.data.estimate,
          source: "import",
          creatorId: ctx.actor.membershipId,
        },
      });
      await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
        name: EVENT.taskCreated,
        targetType: "task",
        targetId: task.id,
        actorId: ctx.actor.membershipId,
        data: { source: "import", importJobId: id, rowKey: row.rowKey },
      });
    });
    row.applied = true;
    applied += 1;
    // Persist progress every 25 rows so a crash resumes cheaply.
    if (applied % 25 === 0) {
      await ctx.db.importJob.update({
        where: { id },
        data: { appliedRows: applied, rows: rows as unknown as Prisma.InputJsonValue },
      });
    }
  }

  const done = await ctx.db.importJob.update({
    where: { id },
    data: { appliedRows: applied, state: "completed", rows: rows as unknown as Prisma.InputJsonValue },
  });
  return summarize(done);
}

function summarize(job: {
  id: string;
  state: string;
  kind: string;
  filename: string;
  totalRows: number;
  appliedRows: number;
  failedRows: number;
  errors: unknown;
  rows: unknown;
}) {
  const rows = (job.rows as StagedRow[]) ?? [];
  return {
    id: job.id,
    state: job.state,
    kind: job.kind,
    filename: job.filename,
    totalRows: job.totalRows,
    appliedRows: job.appliedRows,
    failedRows: job.failedRows,
    duplicateRows: rows.filter((r) => r.status === "duplicate").length,
    okRows: rows.filter((r) => r.status === "ok").length,
    errors: job.errors,
  };
}
