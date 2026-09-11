import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ProvisionTestsRequest,
  ProvisionTestsResponse,
  type AcceptanceCriterion,
} from "@asafarim/testora-tasksai-contract";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { getEnv } from "../env";
import { getTaskOr404 } from "../repositories/tasks";

/**
 * Closes the TDD direction from the TasksAI side (issue #266): turns an
 * applied decomposition's acceptance criteria into Testora pending scenarios
 * + a required check, in one human-triggered action. Nothing is
 * auto-provisioned — the developer decides when the criteria are stable
 * enough to scaffold.
 */

// ── acceptance-criteria extraction (pure) ──────────────────────────────────

const CHECKLIST_LINE = /^\s*[-*]\s*\[[ xX]\]\s+(.+)$/;

/**
 * Reads a markdown checklist ("- [ ] ..." / "- [x] ...") out of a task
 * description — the fallback source when the caller doesn't supply explicit
 * criteria (e.g. straight from an applied `acceptance_criteria` proposal,
 * which appends exactly this shape — see lib/ai/providers/fixture.ts).
 */
export function parseChecklistCriteria(description: string | null | undefined): AcceptanceCriterion[] {
  if (!description) return [];
  const criteria: AcceptanceCriterion[] = [];
  let i = 0;
  for (const line of description.split(/\r?\n/)) {
    const match = CHECKLIST_LINE.exec(line);
    if (!match?.[1]) continue;
    const text = match[1].trim();
    if (!text) continue;
    i += 1;
    criteria.push({ ref: `ac_${i}`, text: text.slice(0, 2000) });
  }
  return criteria;
}

/** Deterministic across re-provisions of the same task — see #262: Testora
 *  is idempotent on `taskRef`; this is idempotent on the TasksAI side. */
export function provisionCheckRef(taskId: string): string {
  return `tasksai-check:${taskId}`;
}

// ── the action ──────────────────────────────────────────────────────────

export const provisionTestsSchema = z.object({
  /** overrides the checklist parsed from the description, when provided */
  acceptanceCriteria: z
    .array(z.object({ ref: z.string().min(1).max(40), text: z.string().min(1).max(2000) }))
    .max(100)
    .optional(),
  featureTitle: z.string().min(1).max(500).optional(),
  requiredRuns: z.number().int().min(1).max(20).optional(),
});

export interface ProvisionTestsResult {
  checkId: string;
  provisionId: string;
  scenarios: ProvisionTestsResponse["scenarios"];
}

async function postProvisionRequest(
  baseUrl: string,
  token: string,
  body: ProvisionTestsRequest,
): Promise<ProvisionTestsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/provisions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError("internal", {
      reason: `could not reach Testora: ${err instanceof Error ? err.message : "network error"}`,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new ApiError("internal", { reason: `Testora returned HTTP ${res.status}` });
  }
  return ProvisionTestsResponse.parse(await res.json());
}

/**
 * The "Provision tests in Testora" action. Gated on the workspace having a
 * `testora` integration connected — workspaces without one never see this
 * succeed (the caller/UI should hide the action entirely when
 * `GET .../integrations/testora` — reusing lib/integrations/github.ts's
 * listIntegrations pattern — is empty).
 */
export async function provisionTestsForTask(
  ctx: RequestContext,
  taskId: string,
  input: unknown,
): Promise<ProvisionTestsResult> {
  authorize(ctx.actor, "task.check_manage");
  const task = await getTaskOr404(ctx, taskId);
  const data = provisionTestsSchema.parse(input);

  const integration = await ctx.db.integration.findFirst({
    where: { workspaceId: ctx.workspaceId, provider: "testora" },
  });
  if (!integration) {
    throw new ApiError("not_found", { reason: "Testora is not connected for this workspace" });
  }
  const config = integration.config as { projectId?: string; appId?: string };
  if (!config.projectId) {
    throw new ApiError("validation_failed", { reason: "Testora integration has no project configured" });
  }

  const acceptanceCriteria = data.acceptanceCriteria?.length
    ? data.acceptanceCriteria
    : parseChecklistCriteria(task.description);
  if (acceptanceCriteria.length === 0) {
    throw new ApiError("validation_failed", {
      reason: "No acceptance criteria: pass them explicitly, or add a markdown checklist to the task description",
    });
  }

  const env = getEnv();
  if (!env.testoraProvisionToken) {
    throw new ApiError("internal", { reason: "TESTORA_PROVISION_TOKEN is not configured" });
  }

  const checkRef = provisionCheckRef(task.id);
  const request = ProvisionTestsRequest.parse({
    v: 1,
    provisionId: randomUUID(),
    taskRef: task.id,
    checkRef,
    featureTitle: data.featureTitle ?? task.title,
    acceptanceCriteria,
    appId: config.appId ?? integration.externalRef,
    callbackUrl: `${env.appUrl.replace(/\/+$/, "")}/api/inbound/testora`,
    ...(data.requiredRuns !== undefined ? { requiredRuns: data.requiredRuns } : {}),
  });

  const response = await postProvisionRequest(env.testoraAppUrl, env.testoraProvisionToken, request);

  return ctx.db.$transaction(async (tx) => {
    const existing = await tx.taskCheck.findUnique({ where: { externalRef: checkRef } });
    const check = existing
      ? await tx.taskCheck.update({
          where: { id: existing.id },
          // Never downgrade an already-satisfied/failed check's state just
          // because the action was re-run — that's Testora's job via the
          // green-light callback, not a re-provision.
          data: { key: request.featureTitle, updatedAt: new Date() },
        })
      : await tx.taskCheck.create({
          data: {
            workspaceId: ctx.workspaceId,
            taskId: task.id,
            source: "testora",
            key: request.featureTitle,
            state: "pending",
            externalRef: checkRef,
          },
        });

    await emitActivity(tx, ctx.workspaceId, `${ctx.correlationId}:${response.provisionId}`, {
      name: existing ? EVENT.checkUpdated : EVENT.checkAdded,
      targetType: "task",
      targetId: task.id,
      actorId: ctx.actor.membershipId,
      data: {
        checkId: check.id,
        provisionId: response.provisionId,
        scenarioCount: response.scenarios.length,
        resynced: Boolean(existing),
      },
    });

    return { checkId: check.id, provisionId: response.provisionId, scenarios: response.scenarios };
  });
}
