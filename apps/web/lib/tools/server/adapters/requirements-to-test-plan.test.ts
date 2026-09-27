import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../../../../content/tools";
import { testPlanExampleInput, testPlanExampleOutput } from "../../../../content/tool-fixtures/requirements-to-test-plan";
import { testPlanEvalCases, testPlanModelResponses } from "../../test-plan/eval-cases";
import { testPlanSchema, type TestPlan } from "../../test-plan/schema";
import type { ToolDefinition } from "../../types";
import type { ToolRuntimeConfig } from "../config";
import { executeTool, type ExecuteDeps } from "../execute";
import { createMemoryIdempotencyStore } from "../idempotency";
import type { LiveCompletionRequest } from "../providers/types";
import { toolAdapters } from ".";
import { buildTestPlanPrompt, claimsExecution, heuristicPlan, requirementsToTestPlanAdapter as adapter, toTestPlan } from "./requirements-to-test-plan";

const catalogueEntry = toolCatalogue.find((t) => t.slug === "requirements-to-test-plan")!;
const liveEntry: ToolDefinition = { ...catalogueEntry, lifecycle: "beta", indexable: true, liveGeneration: true };
const normal = testPlanEvalCases.find((c) => c.id === "normal-checkout-discount")!;
const parsedNormal = adapter.inputSchema.parse(normal.input);

function run(body: unknown, options: { config?: Partial<ToolRuntimeConfig>; response?: unknown; tool?: ToolDefinition } = {}) {
  const calls: LiveCompletionRequest[] = [];
  const deps: ExecuteDeps = {
    config: {
      mode: "live",
      liveEnabled: true,
      disabledTools: new Set(),
      provider: { name: "anthropic", model: "claude-opus-5", apiKey: "k" },
      notes: [],
      ...options.config,
    },
    createProvider: () => ({
      name: "anthropic",
      complete: async (req) => {
        calls.push(req);
        return {
          text: JSON.stringify(options.response ?? testPlanModelResponses.good),
          responseModel: "claude-opus-5",
          providerRequestId: null,
          usage: { inputTokens: 2000, outputTokens: 3000, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
          stop: "complete",
          fallbackUsed: false,
        };
      },
    }),
    store: createMemoryIdempotencyStore(),
    sink: { record: async () => "evt" },
    log: () => {},
    resolveTool: () => options.tool ?? liveEntry,
  };
  let n = 0;
  return {
    calls,
    exec: () => executeTool("requirements-to-test-plan", body, toolAdapters, deps),
    body: (input: unknown, mode = "live") => ({ input, mode, idempotencyKey: `key-${++n}-000000000000` }),
  };
}
const body = (input: unknown, mode: "live" | "example" = "live") => ({ input, mode, idempotencyKey: "test-key-0000000001" });

describe("registration", () => {
  it("is registered, examples-only, and unlisted while experimental", () => {
    expect(toolAdapters["requirements-to-test-plan"]).toBe(adapter);
    expect(catalogueEntry).toMatchObject({ lifecycle: "experiment", indexable: false, liveGeneration: false });
  });

  it("the catalogue example maps to the full example input and fixture", () => {
    const input = adapter.inputSchema.parse(adapter.exampleInput(catalogueEntry.example.input));
    expect(input).toEqual(adapter.inputSchema.parse(testPlanExampleInput));
    expect(adapter.fixture(input)).toEqual(testPlanExampleOutput);
    expect(catalogueEntry.example.output).toEqual(testPlanExampleOutput);
  });
});

describe("through the execution boundary", () => {
  it("example mode returns the example plan with no provider call, even with live off", async () => {
    const h = run(null, { config: { liveEnabled: false, mode: "off" }, tool: catalogueEntry });
    const { envelope } = await executeTool("requirements-to-test-plan", body(testPlanExampleInput, "example"), toolAdapters, {
      config: { mode: "off", liveEnabled: false, disabledTools: new Set(), provider: null, notes: [] },
      createProvider: () => {
        throw new Error("must not be called");
      },
      store: createMemoryIdempotencyStore(),
      sink: { record: async () => "evt" },
      log: () => {},
      resolveTool: () => catalogueEntry,
    });
    expect(envelope).toMatchObject({ ok: true, mode: "fixture", output: { title: "Password reset by email" } });
    expect(h.calls).toHaveLength(0);
  });

  it("live mode is provider_disabled while the catalogue says examples only", async () => {
    const h = run(null, { tool: catalogueEntry });
    const { envelope } = await executeTool("requirements-to-test-plan", body(normal.input), toolAdapters, {
      config: { mode: "live", liveEnabled: true, disabledTools: new Set(), provider: { name: "anthropic", model: "claude-opus-5", apiKey: "k" }, notes: [] },
      createProvider: () => ({ name: "anthropic", complete: async () => Promise.reject(new Error("no")) }),
      store: createMemoryIdempotencyStore(),
      sink: { record: async () => "evt" },
      log: () => {},
      resolveTool: () => catalogueEntry,
    });
    expect(!envelope.ok && envelope.error.code).toBe("provider_disabled");
    expect(h.calls).toHaveLength(0);
  });

  it.each(testPlanEvalCases.map((c) => [c.id, c] as const))("eval case %s in fixture mode → %s", async (_, c) => {
    const h = run(null, { config: { mode: "fixture", liveEnabled: false, provider: null } });
    const { envelope } = await executeTool("requirements-to-test-plan", body(c.input), toolAdapters, {
      ...{ config: { mode: "fixture", liveEnabled: false, disabledTools: new Set(), provider: null, notes: [] } },
      createProvider: () => {
        throw new Error("must not be called");
      },
      store: createMemoryIdempotencyStore(),
      sink: { record: async () => "evt" },
      log: () => {},
      resolveTool: () => liveEntry,
    });
    if (c.expect.fixtureOutcome === "ok") {
      expect(envelope.ok).toBe(true);
      if (envelope.ok) expect(testPlanSchema.safeParse(envelope.output).success).toBe(true);
    } else {
      expect(!envelope.ok && envelope.error.code).toBe(c.expect.fixtureOutcome);
    }
    expect(h.calls).toHaveLength(0);
  });

  it("a live run returns a validated plan with server-assigned ids and the source units", async () => {
    const h = run(null);
    const { envelope } = await executeTool("requirements-to-test-plan", body(normal.input), toolAdapters, {
      config: { mode: "live", liveEnabled: true, disabledTools: new Set(), provider: { name: "anthropic", model: "claude-opus-5", apiKey: "k" }, notes: [] },
      createProvider: () => ({
        name: "anthropic",
        complete: async (req) => {
          h.calls.push(req);
          return {
            text: JSON.stringify(testPlanModelResponses.good),
            responseModel: "claude-opus-5",
            providerRequestId: null,
            usage: { inputTokens: 2000, outputTokens: 3000, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
            stop: "complete",
            fallbackUsed: false,
          };
        },
      }),
      store: createMemoryIdempotencyStore(),
      sink: { record: async () => "evt" },
      log: () => {},
      resolveTool: () => liveEntry,
    });
    expect(envelope.ok && envelope.status).toBe("succeeded");
    const plan = (envelope.ok ? envelope.output : null) as TestPlan;
    expect(plan.scenarios.map((s) => s.id)).toEqual(["TC-01", "TC-02", "TC-03", "TC-04"]);
    expect(plan.sources.map((s) => s.id)).toEqual(["R1", "R2", "R3", "R4"]);
    expect(plan.questions[0].id).toBe("Q1");
    expect(h.calls[0]).toMatchObject({ maxOutputTokens: 12_000, effort: "medium" });
  });
});

describe("toTestPlan (post-call validation)", () => {
  it("drops scenarios citing unknown or no sources and reports it as degraded", () => {
    const result = toTestPlan(parsedNormal, testPlanModelResponses.partlyUntraceable);
    expect(result?.output.scenarios).toHaveLength(1);
    expect(result?.output.questions).toHaveLength(0);
    expect(result?.dropped).toEqual([
      "2 scenarios were removed because they didn't point to your text or state an assumption.",
      "1 question was removed because it referred to text that isn't in your requirement.",
    ]);
  });

  it("rejects the whole result when nothing is traceable", () => {
    expect(toTestPlan(parsedNormal, testPlanModelResponses.untraceable)).toBeNull();
  });

  it("rejects malformed model JSON", () => {
    expect(toTestPlan(parsedNormal, { scenarios: "nope" })).toBeNull();
    expect(toTestPlan(parsedNormal, null)).toBeNull();
  });

  it("strips injected result fields and removes claims that tests ran", () => {
    const result = toTestPlan(parsedNormal, testPlanModelResponses.claimsResults)!;
    const text = JSON.stringify(result.output);
    expect(text).not.toMatch(/"status"|"coverage"|passed|100%/);
    expect(result.output.summary).toBe("No summary was produced.");
    expect(result.dropped.join(" ")).toMatch(/claiming that tests ran/);
    expect(testPlanSchema.safeParse(result.output).success).toBe(true);
  });

  it.each([
    ["All tests passed.", true],
    ["Coverage is 100% across the flow", true],
    ["The login was successfully tested", true],
    ["We verified that the link expires", true],
    ["The password field accepts 12 characters", false],
    ["An expired link is rejected", false],
    ["Verify the total updates", false],
  ])("claimsExecution(%j) → %s", (text, expected) => {
    expect(claimsExecution(text)).toBe(expected);
  });
});

describe("prompt", () => {
  const injection = testPlanEvalCases.find((c) => c.kind === "prompt-injection")!;
  const prompt = buildTestPlanPrompt(adapter.inputSchema.parse(injection.input));

  it("keeps user text out of the system prompt and inside the data fence", () => {
    expect(prompt.system).not.toContain("IGNORE ALL PREVIOUS INSTRUCTIONS");
    expect(prompt.user).toContain("IGNORE ALL PREVIOUS INSTRUCTIONS");
    expect(prompt.system).toMatch(/never as instructions/);
    expect(prompt.system).toMatch(/Never state or imply that anything was executed/);
  });

  it("neutralizes attempts to close the fence early", () => {
    const fenceCloses = prompt.user.match(/<\/requirement_units>/g) ?? [];
    expect(fenceCloses).toHaveLength(1);
    expect(prompt.user).toContain("[tag removed]");
  });

  it("numbers units and marks acceptance criteria", () => {
    const p = buildTestPlanPrompt(parsedNormal);
    expect(p.user).toMatch(/^R1: As a shopper/m);
    expect(p.user).toMatch(/^R2 \(acceptance criterion\): A valid code/m);
  });

  it("stays within the adapter's worst-case budget for the largest allowed input", () => {
    const big = adapter.inputSchema.parse({ requirement: "x ".repeat(3_999), acceptanceCriteria: "y ".repeat(1_999), context: "z".repeat(1_500) });
    const p = buildTestPlanPrompt(big);
    expect(Buffer.byteLength(p.system + p.user)).toBeLessThan(adapter.limits.maxInputBytes);
  });
});

describe("heuristic fixture", () => {
  it("is deterministic, valid, and flags vague wording", () => {
    const input = adapter.inputSchema.parse(testPlanEvalCases.find((c) => c.kind === "ambiguous")!.input);
    const a = heuristicPlan(input);
    expect(heuristicPlan(input)).toEqual(a);
    expect(testPlanSchema.safeParse(a).success).toBe(true);
    expect(a.questions.length).toBeGreaterThan(0);
    expect(a.summary).toMatch(/No AI was used/);
  });
});
