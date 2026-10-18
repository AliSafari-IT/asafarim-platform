/**
 * Issue #540: the EduMatch AI cost ledger — pricing, event building,
 * idempotent recording and the spend query.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCostEventWrite } from "@asafarim/ai-cost-ledger";

const prismaMock = vi.hoisted(() => ({
  eduAiCostEvent: { createMany: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@asafarim/db", () => ({ prisma: prismaMock }));

import {
  EDUMATCH_PRICING_VERSION,
  attemptCostMicros,
  attemptWorkflowId,
  buildEduCostEvent,
  edumatchPricing,
  getEduAiSpend,
  recordEduAiCost,
  safeAnthropicUsage,
  safeOpenAiUsage,
  transcriptionUsage,
  utcMonthRange,
  type EduAiAttempt,
} from "@/lib/server/ai-cost";

const attempt: EduAiAttempt = {
  inquiryId: "inq-1",
  studentId: "stu-1",
  claimedAt: new Date("2026-10-18T10:00:00.000Z"),
};

beforeEach(() => {
  prismaMock.eduAiCostEvent.createMany.mockReset().mockResolvedValue({ count: 1 });
  prismaMock.eduAiCostEvent.findMany.mockReset();
});

describe("edumatchPricing", () => {
  it("prices OpenAI's dated model ids through the prefix entries", () => {
    expect(edumatchPricing.lookup("openai", "gpt-4o-2024-08-06")?.model).toBe("gpt-4o*");
    expect(edumatchPricing.lookup("openai", "gpt-4o-mini-2024-07-18")?.model).toBe("gpt-4o-mini*");
    expect(edumatchPricing.lookup("openai", "gpt-4o-mini")?.model).toBe("gpt-4o-mini*");
    expect(edumatchPricing.lookup("anthropic", "claude-haiku-4-5-20251001")?.model).toBe("claude-haiku-4-5*");
    expect(edumatchPricing.lookup("openai", "whisper-1")?.model).toBe("whisper-1");
  });

  it("returns null for a model it has no price for", () => {
    expect(edumatchPricing.lookup("openai", "gpt-5-turbo")).toBeNull();
    expect(edumatchPricing.lookup("anthropic", "gpt-4o")).toBeNull();
  });

  it("stamps snapshots with the table version", () => {
    expect(edumatchPricing.lookup("openai", "gpt-4o")?.pricingVersion).toBe(EDUMATCH_PRICING_VERSION);
  });
});

describe("usage helpers", () => {
  it("bills Whisper per started second", () => {
    expect(transcriptionUsage(89.2)).toEqual([{ bucket: "audio_input", unit: "seconds", quantity: 90 }]);
  });

  it("splits OpenAI cached prompt tokens out of the input count", () => {
    const usage = safeOpenAiUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 400 },
    });
    expect(usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: "input", quantity: 600 }),
        expect.objectContaining({ bucket: "cached_input", quantity: 400 }),
        expect.objectContaining({ bucket: "output", quantity: 200 }),
      ]),
    );
  });

  it("treats missing or impossible usage as unknown", () => {
    expect(safeOpenAiUsage(undefined)).toBeNull();
    expect(safeAnthropicUsage(null)).toBeNull();
    // cached > prompt can't be normalised.
    expect(safeOpenAiUsage({ prompt_tokens: 1, prompt_tokens_details: { cached_tokens: 5 } })).toBeNull();
  });
});

describe("buildEduCostEvent", () => {
  it("estimates a gpt-4o-mini answer from list prices", () => {
    const event = parseCostEventWrite(
      buildEduCostEvent({
        attempt,
        operation: "tutor_answer",
        provider: "openai",
        requestModel: "gpt-4o-mini",
        responseModel: "gpt-4o-mini-2024-07-18",
        usage: safeOpenAiUsage({ prompt_tokens: 1000, completion_tokens: 500 }),
      }),
    );
    // 1000 × $0.15/M + 500 × $0.60/M = 150 + 300 micros.
    expect(event.estimatedCostMicros).toBe(BigInt(450));
    expect(event.costSource).toBe("registry_estimate");
    expect(event.pricingSnapshot?.model).toBe("gpt-4o-mini*");
    expect(event.ownerType).toBe("user");
    expect(event.ownerId).toBe("stu-1");
    expect(event.subjectType).toBe("inquiry");
    expect(event.subjectId).toBe("inq-1");
    expect(event.credentialSource).toBe("platform");
  });

  it("estimates Whisper from the audio duration", () => {
    const event = parseCostEventWrite(
      buildEduCostEvent({
        attempt,
        operation: "transcription",
        provider: "openai",
        requestModel: "whisper-1",
        usage: transcriptionUsage(90),
      }),
    );
    // 90 s × $0.006/60 s = $0.009.
    expect(event.estimatedCostMicros).toBe(BigInt(9000));
  });

  it("records an unknown cost, never zero, without usage", () => {
    const event = parseCostEventWrite(
      buildEduCostEvent({
        attempt,
        operation: "tutor_answer_stream",
        provider: "openai",
        requestModel: "gpt-4o",
        usage: null,
        outcome: "cancelled",
      }),
    );
    expect(event.costSource).toBe("unknown");
    expect(event.estimatedCostMicros).toBeNull();
    expect(event.metadata).toMatchObject({ usage_known: false });
  });

  it("records an unknown cost for an unpriced model", () => {
    const event = parseCostEventWrite(
      buildEduCostEvent({
        attempt,
        operation: "tutor_answer",
        provider: "openai",
        requestModel: "gpt-5-turbo",
        usage: safeOpenAiUsage({ prompt_tokens: 10, completion_tokens: 10 }),
      }),
    );
    expect(event.costSource).toBe("unknown");
    expect(event.estimatedCostMicros).toBeNull();
  });

  it("keys events by operation, inquiry, attempt and seq", () => {
    const base = {
      attempt,
      provider: "openai" as const,
      requestModel: "gpt-4o",
      usage: null,
    };
    const a = buildEduCostEvent({ ...base, operation: "tutor_answer" });
    const b = buildEduCostEvent({ ...base, operation: "tutor_answer", seq: 1 });
    const c = buildEduCostEvent({
      ...base,
      operation: "tutor_answer",
      attempt: { ...attempt, claimedAt: new Date(attempt.claimedAt.getTime() + 1) },
    });
    expect(a.idempotencyKey).toBe(`edumatch:tutor_answer:inq-1:${attempt.claimedAt.getTime()}:0`);
    expect(new Set([a.idempotencyKey, b.idempotencyKey, c.idempotencyKey]).size).toBe(3);
    expect(a.workflowId).toBe(attemptWorkflowId(attempt));
    expect(a.workflowId).toBe(b.workflowId);
  });
});

describe("recordEduAiCost", () => {
  const input = {
    attempt,
    operation: "tutor_answer" as const,
    provider: "openai" as const,
    requestModel: "gpt-4o-mini",
    usage: safeOpenAiUsage({ prompt_tokens: 1000, completion_tokens: 500 }),
  };

  it("inserts once, skipping duplicates, and returns the estimate", async () => {
    const result = await recordEduAiCost(input);
    expect(result).toMatchObject({ written: true, estimatedCostMicros: BigInt(450) });
    const [arg] = prismaMock.eduAiCostEvent.createMany.mock.calls[0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data[0]).toMatchObject({
      userId: "stu-1",
      operation: "tutor_answer",
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCostMicros: BigInt(450),
      costSource: "registry_estimate",
    });
  });

  it("reports a duplicate as not written", async () => {
    prismaMock.eduAiCostEvent.createMany.mockResolvedValue({ count: 0 });
    await expect(recordEduAiCost(input)).resolves.toMatchObject({ written: false });
  });

  it("never throws when the database keeps failing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.eduAiCostEvent.createMany.mockRejectedValue(new Error("db down"));
    const result = await recordEduAiCost(input);
    expect(result).toMatchObject({ written: false, estimatedCostMicros: BigInt(450) });
    expect(prismaMock.eduAiCostEvent.createMany).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledWith("[ai-cost] record_failed", expect.anything());
    error.mockRestore();
  });
});

describe("attemptCostMicros", () => {
  it("sums known parts", () => {
    expect(attemptCostMicros([BigInt(450), BigInt(9000)])).toBe(9450);
  });

  it("is unknown when any part is unknown, or nothing was paid for", () => {
    expect(attemptCostMicros([BigInt(450), null])).toBeNull();
    expect(attemptCostMicros([])).toBeNull();
  });
});

describe("getEduAiSpend", () => {
  it("sums known costs in the range and counts unknown calls", async () => {
    prismaMock.eduAiCostEvent.findMany.mockResolvedValue([
      {
        entryType: "usage",
        estimatedCostMicros: BigInt(450),
        actualCostMicros: null,
        adjustmentDeltaMicros: null,
        costSource: "registry_estimate",
        credentialSource: "platform",
        fixture: false,
        inputTokens: 1000,
        outputTokens: 500,
      },
      {
        entryType: "usage",
        estimatedCostMicros: BigInt(9000),
        actualCostMicros: null,
        adjustmentDeltaMicros: null,
        costSource: "registry_estimate",
        credentialSource: "platform",
        fixture: false,
        inputTokens: 0,
        outputTokens: 0,
      },
      {
        entryType: "usage",
        estimatedCostMicros: null,
        actualCostMicros: null,
        adjustmentDeltaMicros: null,
        costSource: "unknown",
        credentialSource: "platform",
        fixture: false,
        inputTokens: 0,
        outputTokens: 0,
      },
    ]);
    const range = utcMonthRange(new Date("2026-10-18T10:00:00Z"));
    const totals = await getEduAiSpend(range);

    expect(prismaMock.eduAiCostEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { occurredAt: { gte: range.from, lt: range.to } } }),
    );
    expect(totals.effectiveKnownMicros).toBe(BigInt(9450));
    expect(totals.eventCount).toBe(3);
    expect(totals.unknownCount).toBe(1);
  });

  it("uses whole UTC months", () => {
    expect(utcMonthRange(new Date("2026-12-31T23:59:59Z"))).toEqual({
      from: new Date("2026-12-01T00:00:00Z"),
      to: new Date("2027-01-01T00:00:00Z"),
    });
  });
});
