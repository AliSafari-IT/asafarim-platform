import "server-only";
import { z } from "zod";
import {
  DELIVERY_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  parseWebhookEvent,
  verifySignature,
  type FlakeDetectedData,
  type RegressionDetectedData,
  type WebhookEnvelope,
} from "@asafarim/testora-tasksai-contract";
import type { RequestContext } from "../context";
import type { PrismaClient } from "../db/generated";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { getTasksAiDb } from "../db/client";
import { OUTBOX_TYPE } from "../events/names";

/**
 * Testora integration (issue #264). Inbound-only, like the GitHub one:
 * Testora emits HMAC-signed `regression.detected` / `flake.detected`
 * webhooks; TasksAI turns each into an **audited draft proposal** on the
 * mapped project (never a silently auto-created task). No writes back to
 * Testora.
 *
 * Trust boundary + payload shapes: `@asafarim/testora-tasksai-contract`
 * (docs/adr/0002 in the platform repo).
 */

const connectSchema = z.object({
  /** the opaque Testora app id these deliveries carry (`data.appId`) */
  appId: z.string().min(1).max(200),
  /** the HMAC secret shared with Testora's webhook dispatcher */
  secret: z.string().min(16).max(200),
  /** project to drop diagnosis proposals into */
  projectId: z.string(),
});

export async function connectTestora(ctx: RequestContext, input: unknown) {
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
        provider: "testora",
        externalRef: data.appId,
      },
    },
    create: {
      workspaceId: ctx.workspaceId,
      provider: "testora",
      externalRef: data.appId,
      secret: data.secret,
      config: { projectId: project.id, appId: data.appId },
    },
    update: { secret: data.secret, config: { projectId: project.id, appId: data.appId } },
  });
}

export interface TestoraWebhookHeaders {
  signature: string | null;
  delivery: string | null;
  timestamp: string | null;
}

export function readTestoraHeaders(h: Headers): TestoraWebhookHeaders {
  return {
    signature: h.get(SIGNATURE_HEADER),
    delivery: h.get(DELIVERY_HEADER),
    timestamp: h.get(TIMESTAMP_HEADER),
  };
}

type DiagnosableData = RegressionDetectedData | FlakeDetectedData;

/**
 * Machine entrypoint for the Testora webhook (the route carries no session).
 * Verifies the per-integration HMAC over `timestamp.deliveryId.rawBody`,
 * rejects replays, dedupes by delivery id, and — for a diagnosable event —
 * enqueues the `test_diagnosis` pipeline on the outbox (worker-run).
 */
export async function receiveTestoraWebhook(args: {
  rawBody: string;
  headers: TestoraWebhookHeaders;
  /** injected in tests; defaults to the singleton */
  db?: PrismaClient;
}): Promise<{ enqueued?: boolean; deliveryId?: string; ignored?: string }> {
  const parsedBody: unknown = JSON.parse(args.rawBody);
  const parsed = parseWebhookEvent(parsedBody);
  if (!parsed.ok) {
    throw new ApiError("validation_failed", { reason: "unrecognised webhook payload" });
  }
  const { envelope, eventType } = parsed;

  const appId = extractAppId(envelope);
  if (!appId) return { ignored: "no appId on payload" };

  const db = args.db ?? getTasksAiDb();
  // The same Testora appId can be connected in more than one workspace
  // (the Integration unique key includes workspaceId). The delivery belongs
  // to whichever integration's shared secret actually verifies the HMAC —
  // this is both the routing key and the auth check.
  const candidates = await db.integration.findMany({
    where: { provider: "testora", externalRef: appId },
  });
  if (candidates.length === 0) {
    throw new ApiError("not_found", { reason: "no testora integration for appId" });
  }

  let integration: (typeof candidates)[number] | undefined;
  let lastReason = "missing_fields";
  for (const candidate of candidates) {
    const verdict = verifySignature({
      secret: candidate.secret,
      rawBody: args.rawBody,
      signature: args.headers.signature,
      timestamp: args.headers.timestamp,
      deliveryId: args.headers.delivery,
    });
    if (verdict.ok) {
      integration = candidate;
      break;
    }
    lastReason = verdict.reason;
  }
  if (!integration) {
    throw new ApiError("forbidden", { reason: `signature ${lastReason}` });
  }

  const deliveryId = args.headers.delivery ?? envelope.deliveryId;

  if (eventType !== "regression.detected" && eventType !== "flake.detected") {
    return { ignored: `event ${eventType}`, deliveryId };
  }

  const projectId = (integration.config as { projectId?: string }).projectId;
  if (!projectId) return { ignored: "integration has no project configured", deliveryId };

  const externalId = `testora:${deliveryId}`;
  try {
    await db.$transaction(async (tx) => {
      const seen = await tx.integrationEvent.findUnique({
        where: { provider_externalId: { provider: "testora", externalId } },
      });
      if (seen) {
        // idempotent: a retry of an already-accepted delivery
        throw new DuplicateDelivery();
      }
      await tx.integrationEvent.create({
        data: {
          workspaceId: integration.workspaceId,
          provider: "testora",
          externalId,
          kind: eventType,
        },
      });
      await tx.outboxEvent.create({
        data: {
          workspaceId: integration.workspaceId,
          type: OUTBOX_TYPE.testoraDiagnose,
          payload: {
            deliveryId,
            eventType,
            workspaceId: integration.workspaceId,
            projectId,
            appId,
            causationId: envelope.causationId ?? null,
            data: parsed.data as DiagnosableData,
          },
          dedupeKey: `${OUTBOX_TYPE.testoraDiagnose}:${deliveryId}`,
        },
      });
    });
  } catch (err) {
    if (err instanceof DuplicateDelivery) return { ignored: "duplicate delivery", deliveryId };
    if (isUniqueViolation(err)) return { ignored: "duplicate delivery", deliveryId };
    throw err;
  }

  return { enqueued: true, deliveryId };
}

class DuplicateDelivery extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function extractAppId(envelope: WebhookEnvelope): string | null {
  const data = envelope.data;
  if (data && typeof data === "object" && "appId" in data) {
    const appId = (data as { appId?: unknown }).appId;
    return typeof appId === "string" && appId.length > 0 ? appId : null;
  }
  return null;
}
