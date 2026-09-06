import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { getTasksAiDb } from "../db/client";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";

/**
 * First integration (docs: M09, chosen per M00: GitHub). Read-first: an
 * inbound GitHub issue webhook creates or updates a TasksAI task. No writes
 * back to GitHub in this milestone — sync ownership is "GitHub is the
 * source" and is documented before any outbound write is added.
 */
const connectSchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "owner/repo"),
  /** the webhook secret configured in the GitHub repo settings */
  secret: z.string().min(8).max(200),
  /** project to file issues into */
  projectId: z.string(),
});

export async function connectGithub(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "customfield.manage");
  const data = connectSchema.parse(input);
  const project = await ctx.db.project.findFirst({
    where: { id: data.projectId, workspaceId: ctx.workspaceId, archivedAt: null },
    select: { id: true },
  });
  if (!project) throw new ApiError("not_found", { field: "projectId" });

  return ctx.db.integration.upsert({
    where: {
      workspaceId_provider_externalRef: {
        workspaceId: ctx.workspaceId,
        provider: "github",
        externalRef: data.repo,
      },
    },
    create: {
      workspaceId: ctx.workspaceId,
      provider: "github",
      externalRef: data.repo,
      secret: data.secret,
      config: { projectId: project.id },
    },
    update: { secret: data.secret, config: { projectId: project.id } },
  });
}

export async function listIntegrations(ctx: RequestContext) {
  return ctx.db.integration.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, provider: true, externalRef: true, config: true, createdAt: true },
  });
}

function verifyGithubSig(secret: string, body: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/**
 * Machine entrypoint for the GitHub webhook (called by the route, which
 * carries no session). Verifies the per-repo HMAC, dedupes by GitHub
 * delivery id, and maps `issues` events → a task.
 */
export async function receiveGithubWebhook(args: {
  repo: string;
  deliveryId: string;
  eventType: string;
  rawBody: string;
  signatureHeader: string | null;
}): Promise<{ taskId?: string; ignored?: string }> {
  const db = getTasksAiDb();
  const integration = await db.integration.findFirst({
    where: { provider: "github", externalRef: args.repo },
  });
  if (!integration) throw new ApiError("not_found");
  if (!verifyGithubSig(integration.secret, args.rawBody, args.signatureHeader)) {
    throw new ApiError("forbidden", { reason: "signature mismatch" });
  }
  if (args.eventType !== "issues") return { ignored: `event ${args.eventType}` };

  const body = JSON.parse(args.rawBody) as {
    action: string;
    issue: { number: number; title: string; body: string | null; html_url: string; state: string };
  };
  const projectId = (integration.config as { projectId?: string }).projectId;
  if (!projectId) return { ignored: "no project configured" };
  const externalId = `github:${args.repo}#${body.issue.number}`;

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.integrationEvent.findUnique({
        where: { provider_externalId: { provider: "github", externalId } },
      });

      if (existing?.taskId) {
        if (["closed", "reopened", "edited"].includes(body.action)) {
          await tx.task.updateMany({
            where: { id: existing.taskId, workspaceId: integration.workspaceId },
            data: {
              title: body.issue.title.slice(0, 500),
              ...(body.action === "closed" ? { completedAt: new Date() } : {}),
              ...(body.action === "reopened" ? { completedAt: null } : {}),
              version: { increment: 1 },
            },
          });
        }
        return { taskId: existing.taskId };
      }

      const task = await tx.task.create({
        data: {
          workspaceId: integration.workspaceId,
          projectId,
          title: body.issue.title.slice(0, 500),
          description: `From GitHub ${args.repo}#${body.issue.number}\n${body.issue.html_url}\n\n${body.issue.body ?? ""}`.slice(0, 20000),
          source: "import",
        },
      });
      await tx.integrationEvent.upsert({
        where: { provider_externalId: { provider: "github", externalId } },
        create: { workspaceId: integration.workspaceId, provider: "github", externalId, kind: "issue", taskId: task.id },
        update: { taskId: task.id },
      });
      await emitActivity(tx, integration.workspaceId, args.deliveryId, {
        name: EVENT.taskCreated,
        targetType: "task",
        targetId: task.id,
        actorType: "system",
        data: { source: "github", repo: args.repo, issue: body.issue.number },
      });
      return { taskId: task.id };
    });
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && (err as { code?: unknown }).code === "P2002") {
      return { ignored: "duplicate delivery" };
    }
    throw err;
  }
}
