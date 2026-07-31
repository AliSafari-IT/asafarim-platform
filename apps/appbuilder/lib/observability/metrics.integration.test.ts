import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { commitAttachmentContent, deleteAttachment, initAttachment } from "../repositories/attachments";
import { importConversationReference } from "../repositories/references";
import { appendUserMessage } from "../repositories/conversations";
import {
  collectAttachmentMetrics,
  collectM13Metrics,
  collectReferenceMetrics,
  collectStorageMetrics,
  countQuotaRejections,
  estimateCost,
  metricsWindow,
  type TokenMetrics,
} from "./metrics";

/**
 * M13 slice G metrics, against a real database.
 *
 * The three properties worth guarding, in order of how badly they fail if
 * wrong:
 *
 *  1. no metric ever exposes user content;
 *  2. a metric with no data reports `null`, never `0` — a dashboard reading
 *     "0% failures" because nothing ran is a lie that looks like health;
 *  3. metrics are app-scoped, so one app's numbers never include another's.
 */

const db = getTestDb();
const owner = { principalId: "metrics-owner", roles: [] };

const SECRET_TEXT = "internal-codename-albatross";
const FILE_BYTES = Buffer.from(SECRET_TEXT, "utf8");

const resolveHost = async () => ["93.184.216.34"];
const constantFetch = {
  fetchImpl: (async () =>
    new Response("<body><p>remote-secret-body</p></body>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })) as unknown as typeof fetch,
  resolveHost,
};

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  process.env.APPBUILDER_URL_IMPORTS_ENABLED = "true";
});

afterEach(() => {
  delete process.env.APPBUILDER_URL_IMPORTS_ENABLED;
  delete process.env.APPBUILDER_MODEL_COST_RATES;
});

afterAll(async () => {
  await closeTestDb();
});

async function makeApp(suffix: string) {
  return createApp(
    db,
    owner,
    { name: `Metrics App ${suffix}`, slug: `metrics-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `metrics-create-${suffix}`,
  );
}

async function uploadReady(appId: string, suffix: string) {
  const attachment = await initAttachment(db, owner, appId, {
    originalFilename: `${suffix}.txt`,
    declaredMimeType: "text/plain",
    declaredSizeBytes: FILE_BYTES.length,
    idempotencyKey: `metrics-init-${suffix}`,
  });
  return commitAttachmentContent(db, owner, appId, attachment.id, FILE_BYTES);
}

describe("attachment metrics", () => {
  it("counts by status, bytes, and extracted characters without exposing the text", async () => {
    const app = await makeApp("attachments");
    await uploadReady(app.id, "one");

    const metrics = await collectAttachmentMetrics(db, app.id, metricsWindow());
    expect(metrics.byStatus.ready).toBe(1);
    expect(metrics.totalBytes).toBe(FILE_BYTES.length);
    expect(metrics.readyBytes).toBe(FILE_BYTES.length);
    expect(metrics.extractedTextChars).toBe(SECRET_TEXT.length);
    // The LENGTH is a measurement; the text is user content.
    expect(JSON.stringify(metrics)).not.toContain(SECRET_TEXT);
  });

  it("reports processing percentiles as null when nothing has been processed", async () => {
    const app = await makeApp("no-processing");
    const metrics = await collectAttachmentMetrics(db, app.id, metricsWindow());
    expect(metrics.processingSecondsP50).toBeNull();
    expect(metrics.processingSecondsP95).toBeNull();
    expect(metrics.byStatus).toEqual({});
  });

  it("counts commits that landed with no scanner configured", async () => {
    const app = await makeApp("unscanned");
    await uploadReady(app.id, "unscanned");
    const metrics = await collectAttachmentMetrics(db, app.id, metricsWindow());
    // The number that must be 0 in production; the dev no-op adapter makes
    // it 1 here, which is the honest reading.
    expect(metrics.unscannedCommits).toBe(1);
  });

  it("counts unclaimed uploads past 24h regardless of the metrics window", async () => {
    const app = await makeApp("overdue");
    await initAttachment(db, owner, app.id, {
      originalFilename: "orphan.txt",
      declaredMimeType: "text/plain",
      declaredSizeBytes: FILE_BYTES.length,
      idempotencyKey: "metrics-orphan",
    });

    const later = new Date(Date.now() + 48 * 3_600_000);
    const metrics = await collectAttachmentMetrics(db, app.id, metricsWindow(30, later), later);
    // Deliberately un-windowed: an upload overdue for six weeks is the most
    // important one to see, and a 30-day window would hide exactly that.
    expect(metrics.overdueUnclaimed).toBe(1);
  });

  it("stops counting the extracted text of a deleted attachment", async () => {
    const app = await makeApp("deleted");
    const ready = await uploadReady(app.id, "deleted");
    await deleteAttachment(db, owner, app.id, ready.id);

    const metrics = await collectAttachmentMetrics(db, app.id, metricsWindow());
    expect(metrics.byStatus.deleted).toBe(1);
    expect(metrics.extractedTextChars).toBe(0);
  });
});

describe("reference metrics", () => {
  it("reports adapter breakdown and import counts without the fetched body or URL path", async () => {
    const app = await makeApp("references");
    await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/secret-path/page" },
      constantFetch,
    );

    const metrics = await collectReferenceMetrics(db, app.id, metricsWindow());
    expect(metrics.totalReferences).toBe(1);
    expect(metrics.byAdapter.generic_https).toBe(1);
    expect(metrics.imported).toBe(1);
    expect(metrics.storedTextChars).toBeGreaterThan(0);

    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toContain("remote-secret-body");
    expect(serialized).not.toContain("secret-path");
  });
});

describe("storage metrics", () => {
  it("separates claimed from unclaimed bytes", async () => {
    const app = await makeApp("storage");
    const claimed = await uploadReady(app.id, "claimed");
    await appendUserMessage(db, owner, app.id, {
      content: "here it is",
      selectionContext: null,
      baseVersionNumber: 1,
      attachmentIds: [claimed.id],
    });
    await initAttachment(db, owner, app.id, {
      originalFilename: "loose.txt",
      declaredMimeType: "text/plain",
      declaredSizeBytes: FILE_BYTES.length,
      idempotencyKey: "metrics-loose",
    });

    const metrics = await collectStorageMetrics(db, app.id);
    expect(metrics.attachmentBytes).toBe(FILE_BYTES.length * 2);
    expect(metrics.unclaimedAttachmentBytes).toBe(FILE_BYTES.length);
  });
});

describe("app scoping", () => {
  it("never counts another app's rows", async () => {
    const a = await makeApp("scope-a");
    const b = await makeApp("scope-b");
    await uploadReady(a.id, "a-file");
    await uploadReady(b.id, "b-file");
    await uploadReady(b.id, "b-file-2");

    const metricsA = await collectAttachmentMetrics(db, a.id, metricsWindow());
    expect(metricsA.byStatus.ready).toBe(1);
  });
});

describe("cost estimation", () => {
  const tokens = (byModel: TokenMetrics["byModel"]): TokenMetrics => ({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    providerCalls: 0,
    byModel,
  });

  it("names a model it has no rate for instead of implying zero spend", async () => {
    const cost = estimateCost(
      tokens({ "some-unlisted-model": { promptTokens: 1_000_000, completionTokens: 500_000, calls: 3 } }),
    );
    expect(cost.unratedModels).toEqual(["some-unlisted-model"]);
    expect(cost.byModel["some-unlisted-model"].rateKnown).toBe(false);
    expect(cost.totalUsd).toBe(0);
  });

  it("applies an env rate override", async () => {
    process.env.APPBUILDER_MODEL_COST_RATES = JSON.stringify({
      "negotiated-model": { inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
    });
    const cost = estimateCost(
      tokens({ "negotiated-model": { promptTokens: 1_000_000, completionTokens: 1_000_000, calls: 1 } }),
    );
    expect(cost.totalUsd).toBeCloseTo(12, 6);
    expect(cost.unratedModels).toEqual([]);
  });

  it("degrades a malformed override to 'unrated' rather than throwing inside a metrics read", async () => {
    // A bad pricing env var must never take down the dashboard an operator
    // is using to diagnose something else.
    process.env.APPBUILDER_MODEL_COST_RATES = "{not json";
    const cost = estimateCost(tokens({ "negotiated-model": { promptTokens: 100, completionTokens: 100, calls: 1 } }));
    expect(cost.unratedModels).toEqual(["negotiated-model"]);
  });

  it("always marks itself as an estimate", async () => {
    expect(estimateCost(tokens({})).estimated).toBe(true);
  });
});

describe("the full snapshot", () => {
  it("assembles every section and reports empty rates as null, not zero", async () => {
    const app = await makeApp("snapshot");
    const snapshot = await collectM13Metrics(db, app.id);

    expect(snapshot.appId).toBe(app.id);
    expect(snapshot.context.meanEstimatedTokens).toBeNull();
    expect(snapshot.resolver.resolutionRate).toBeNull();
    expect(snapshot.clarification.answerRate).toBeNull();
    expect(snapshot.plans.completionRate).toBeNull();
    expect(snapshot.cost.estimated).toBe(true);
  });

  it("counts quota rejections by metric — M12 referenced this function before it existed", async () => {
    const app = await makeApp("quota-rejections");
    const result = await countQuotaRejections(db, app.id);
    expect(result.total).toBe(0);
    expect(result.byMetric).toEqual({});
  });
});
