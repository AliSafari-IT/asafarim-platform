import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { DefaultFakeProvider, type AiProvider } from "@asafarim/appbuilder-ai";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { applyOperation } from "../repositories/operations";
import { appendUserMessage } from "../repositories/conversations";
import { enqueueModificationJob } from "../repositories/modificationJobs";
import {
  conversationMessages,
  modificationOperationBatches,
  modificationPlans,
  operationalEvents,
  specificationVersions,
  specifications,
} from "../db/schema";
import { runShadowEvaluation } from "./shadow";

/**
 * M13 slice G dark launch.
 *
 * The contract under test is a negative one — "produces a decision and
 * applies nothing" — so most of these assertions are about what did NOT
 * change. The strongest guarantee lives in the module's import list rather
 * than here (shadow.ts cannot reach any write path), but these confirm the
 * observable half: the specification version does not move, no batch, plan,
 * or message appears, and a failing shadow never surfaces to its caller.
 */

const db = getTestDb();
const owner = { principalId: "shadow-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function setupJob(suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name: `Shadow App ${suffix}`, slug: `shadow-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `shadow-create-${suffix}`,
  );
  await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "home", name: "Home", path: "home" } },
    baseVersionNumber: 1,
    idempotencyKey: `${suffix}-create-page`,
  });

  const { message } = await appendUserMessage(db, owner, app.id, {
    content: "replace the title Home to Experiences",
    selectionContext: null,
    baseVersionNumber: 2,
  });
  const job = await enqueueModificationJob(db, owner, app.id, {
    conversationId: message.conversationId,
    triggeringMessageId: message.id,
    userRequestText: "replace the title Home to Experiences",
    selectionContext: null,
    idempotencyKey: `${suffix}-enqueue`,
    correlationId: `shadowtrace${suffix}`.slice(0, 60),
  });

  const [specRow] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(
      and(
        eq(specificationVersions.specificationId, specRow.id),
        eq(specificationVersions.versionNumber, specRow.currentVersionNumber),
      ),
    );

  return {
    app,
    job,
    specRow,
    currentSpec: version.payload as unknown as ApplicationSpecificationType,
  };
}

const controller = () => new AbortController().signal;

describe("runShadowEvaluation", () => {
  it("does nothing at all when disabled", async () => {
    const { app, job, currentSpec } = await setupJob("disabled");

    const outcome = await runShadowEvaluation(
      { db, provider: new DefaultFakeProvider(), job, currentSpec, selection: null, signal: controller() },
      false,
    );

    expect(outcome).toEqual({ evaluated: false, skippedReason: "disabled" });
    const events = await db.select().from(operationalEvents).where(eq(operationalEvents.appId, app.id));
    expect(events.filter((e) => e.kind.startsWith("shadow."))).toHaveLength(0);
  });

  it("produces a decision and applies nothing", async () => {
    const { app, job, specRow, currentSpec } = await setupJob("applies-nothing");
    const versionBefore = specRow.currentVersionNumber;
    const messagesBefore = await db.select().from(conversationMessages).where(eq(conversationMessages.appId, app.id));

    const outcome = await runShadowEvaluation(
      { db, provider: new DefaultFakeProvider(), job, currentSpec, selection: null, signal: controller() },
      true,
    );
    expect(outcome.evaluated).toBe(true);

    const [specAfter] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(specAfter.currentVersionNumber).toBe(versionBefore);

    expect(
      await db.select().from(modificationOperationBatches).where(eq(modificationOperationBatches.appId, app.id)),
    ).toHaveLength(0);
    expect(await db.select().from(modificationPlans).where(eq(modificationPlans.appId, app.id))).toHaveLength(0);

    const messagesAfter = await db.select().from(conversationMessages).where(eq(conversationMessages.appId, app.id));
    expect(messagesAfter).toHaveLength(messagesBefore.length);
  });

  it("records scores and shapes, never the decision's text or its operations", async () => {
    const { app, job, currentSpec } = await setupJob("redacted");
    await runShadowEvaluation(
      { db, provider: new DefaultFakeProvider(), job, currentSpec, selection: null, signal: controller() },
      true,
    );

    const [event] = await db
      .select()
      .from(operationalEvents)
      .where(and(eq(operationalEvents.appId, app.id), eq(operationalEvents.kind, "shadow.evaluated")));
    expect(event).toBeTruthy();

    const detail = event.detail as Record<string, unknown>;
    expect(detail.applied).toBe(false);
    expect(detail.outcome).toBeTruthy();
    expect(typeof detail.proposedOperations).toBe("number");
    expect(detail.resolutionOutcome).toBeTruthy();

    // Counts and enums only: no summary, no question, no operation payload,
    // and nothing that could be replayed into an apply.
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("Experiences");
    expect(serialized).not.toContain("SET_");
    expect(detail).not.toHaveProperty("operations");
    expect(detail).not.toHaveProperty("summary");
  });

  it("joins the job's correlation id so a shadow run reads as part of the same request", async () => {
    const { app, job, currentSpec } = await setupJob("correlated");
    await runShadowEvaluation(
      { db, provider: new DefaultFakeProvider(), job, currentSpec, selection: null, signal: controller() },
      true,
    );

    const [event] = await db
      .select()
      .from(operationalEvents)
      .where(and(eq(operationalEvents.appId, app.id), eq(operationalEvents.kind, "shadow.evaluated")));
    expect(event.correlationId).toBe(job.correlationId);
  });

  it("records which flags it overrode — the gap from live configuration is the whole signal", async () => {
    const { app, job, currentSpec } = await setupJob("overrides");
    process.env.APPBUILDER_VISION_ENABLED = "false";
    try {
      await runShadowEvaluation(
        { db, provider: new DefaultFakeProvider(), job, currentSpec, selection: null, signal: controller() },
        true,
      );
    } finally {
      delete process.env.APPBUILDER_VISION_ENABLED;
    }

    const [event] = await db
      .select()
      .from(operationalEvents)
      .where(and(eq(operationalEvents.appId, app.id), eq(operationalEvents.kind, "shadow.evaluated")));
    expect((event.detail as Record<string, unknown>).overrodeFlags).toContain("vision");
  });

  it("never throws into its caller when the provider fails", async () => {
    const { app, job, currentSpec } = await setupJob("provider-fails");
    const brokenProvider = {
      name: "broken",
      async proposeModification() {
        throw new Error("provider exploded");
      },
    } as unknown as AiProvider;

    // An observation-only feature must not become a new outage source.
    const outcome = await runShadowEvaluation(
      { db, provider: brokenProvider, job, currentSpec, selection: null, signal: controller() },
      true,
    );
    expect(outcome).toEqual({ evaluated: false, skippedReason: "failed" });

    const [event] = await db
      .select()
      .from(operationalEvents)
      .where(and(eq(operationalEvents.appId, app.id), eq(operationalEvents.kind, "shadow.failed")));
    expect(event.severity).toBe("warning");
    // The raw provider message is never persisted.
    expect(JSON.stringify(event.detail)).not.toContain("exploded");
  });
});
