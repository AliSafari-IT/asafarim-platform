import { describe, it, expect } from "vitest";
import { createFakeProvider, value, errorStep } from "./fake";
import { ProviderError } from "../provider/errors";
import {
  CONSTRUCTION_TASK_MANAGEMENT_SCRIPT,
  MALFORMED_RESPONSE_SCRIPT,
  FORBIDDEN_OPERATION_SCRIPT,
  TIMEOUT_THEN_RETRY_SCRIPT,
  RATE_LIMIT_SCRIPT,
} from "../fixtures";

const opts = { requestId: "test-1" };

describe("FakeAiProvider", () => {
  it("returns the scripted, schema-validated analysis for the construction fixture", async () => {
    const provider = createFakeProvider(CONSTRUCTION_TASK_MANAGEMENT_SCRIPT);
    const result = await provider.analyzeRequirements(
      { prompt: "x", requestedStarterFamily: "task_management", clarificationHistory: [], availableTemplateIds: [] },
      opts,
    );
    expect(result.analysis.confidence).toBe("high");
    expect(result.analysis.entities.length).toBeGreaterThan(0);
    expect(result.usage.provider).toBe("fake");
  });

  it("throws ProviderError(malformed_response) for a fixture missing required fields", async () => {
    const provider = createFakeProvider(MALFORMED_RESPONSE_SCRIPT);
    await expect(
      provider.analyzeRequirements(
        { prompt: "x", requestedStarterFamily: "blank", clarificationHistory: [], availableTemplateIds: [] },
        opts,
      ),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("throws ProviderError(malformed_response) — not a crash — for a forbidden operation type", async () => {
    const provider = createFakeProvider(FORBIDDEN_OPERATION_SCRIPT);
    await provider.analyzeRequirements(
      { prompt: "x", requestedStarterFamily: "task_management", clarificationHistory: [], availableTemplateIds: [] },
      opts,
    );
    await expect(
      provider.proposeOperations(
        {
          analysis: (FORBIDDEN_OPERATION_SCRIPT.analyzeRequirements![0] as any).raw,
          templateId: "task_management",
          currentSpec: {} as any,
          priorBatchSummaries: [],
          remainingOperationBudget: 10,
          iteration: 1,
          maxIterations: 4,
        },
        opts,
      ),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("replays a scripted error step, then succeeds on the next scripted call (timeout-then-retry)", async () => {
    const provider = createFakeProvider(TIMEOUT_THEN_RETRY_SCRIPT);
    const input = { prompt: "x", requestedStarterFamily: "task_management", clarificationHistory: [], availableTemplateIds: [] };
    await expect(provider.analyzeRequirements(input, opts)).rejects.toMatchObject({ code: "timeout" });
    const second = await provider.analyzeRequirements(input, opts);
    expect(second.analysis.confidence).toBe("high");
  });

  it("surfaces a scripted rate_limit error with retryAfterMs", async () => {
    const provider = createFakeProvider(RATE_LIMIT_SCRIPT);
    await expect(
      provider.analyzeRequirements(
        { prompt: "x", requestedStarterFamily: "blank", clarificationHistory: [], availableTemplateIds: [] },
        opts,
      ),
    ).rejects.toMatchObject({ code: "rate_limit", retryAfterMs: 1000 });
  });

  it("throws ProviderError(cancelled) immediately when the AbortSignal is already aborted", async () => {
    const provider = createFakeProvider(CONSTRUCTION_TASK_MANAGEMENT_SCRIPT);
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.analyzeRequirements(
        { prompt: "x", requestedStarterFamily: "task_management", clarificationHistory: [], availableTemplateIds: [] },
        { ...opts, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("repeats the last scripted step when called more times than scripted", async () => {
    const provider = createFakeProvider({ recommendTemplate: [value({ templateId: "blank", reasoningSummary: "only one", confidence: "high" })] });
    const input = { analysis: {} as any, availableTemplates: [], requestedStarterFamily: "blank" };
    const first = await provider.recommendTemplate(input, opts);
    const second = await provider.recommendTemplate(input, opts);
    expect(first.recommendation.templateId).toBe("blank");
    expect(second.recommendation.templateId).toBe("blank");
  });

  it("throws for a method with no scripted steps at all", async () => {
    const provider = createFakeProvider({});
    await expect(
      provider.recommendTemplate({ analysis: {} as any, availableTemplates: [], requestedStarterFamily: "blank" }, opts),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("value()/errorStep() helpers produce the expected discriminated shapes", () => {
    expect(value({ a: 1 })).toEqual({ kind: "value", raw: { a: 1 } });
    const err = new ProviderError({ code: "unknown", message: "x" });
    expect(errorStep(err)).toEqual({ kind: "error", error: err });
  });
});
