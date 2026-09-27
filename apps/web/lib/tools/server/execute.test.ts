import { parseCostEventWrite, type CostEventWrite } from "@asafarim/ai-cost-ledger";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toolCatalogue } from "../../../content/tools";
const referenceTool = toolCatalogue.find((t) => t.slug === "shell-reference")!;
import type { ToolDefinition } from "../types";
import type { ToolAdapter } from "./adapter";
import { toolAdapters } from "./adapters";
import type { ToolRuntimeConfig } from "./config";
import { executeTool, type ExecuteDeps } from "./execute";
import { createMemoryIdempotencyStore } from "./idempotency";
import type { ToolConfigLog, ToolRunLog } from "./log";
import { ProviderError, type LiveCompletionRequest, type LiveCompletionResult, type LiveProvider } from "./providers/types";

// ── Test tool: live-capable, tiny schemas ───────────────────────────────────
const SECRET_INPUT = "Confidential roadmap: launch Project Nightjar on 3 March, owner Dana.";
const EXAMPLE = "Example notes: ship the release and email the team today.";

const liveTool: ToolDefinition = {
  ...referenceTool,
  slug: "shell-reference",
  internal: false,
  lifecycle: "beta",
  indexable: true,
  liveGeneration: true,
  example: { label: "Load", input: EXAMPLE, output: { items: ["example"] } },
};

type In = { text: string };
type Out = { items: string[] };
const adapter: ToolAdapter<In, Out> = {
  slug: "shell-reference",
  version: "9.9.9",
  schemaVersion: "3",
  inputSchema: z.object({ text: z.string().trim().min(10, "Too short.").max(500) }),
  outputSchema: z.object({ items: z.array(z.string().max(100)).max(10) }),
  limits: {
    maxInputBytes: 1_000,
    maxOutputBytes: 2_000,
    timeoutMs: 50,
    maxOutputTokens: 1_000,
    maxEstimatedCostMicros: BigInt(1_000_000), // $1
  },
  exampleInput: (text) => ({ text }),
  fixture: ({ text }) => ({ items: text === EXAMPLE ? ["example"] : text.split(/\s+/).slice(0, 3) }),
  live: {
    promptVersion: "test@1",
    outputJsonSchema: { type: "object" },
    buildPrompt: ({ text }) => ({ system: "Extract items.", user: `<notes>${text}</notes>` }),
  },
};
const adapters = { "shell-reference": adapter as ToolAdapter<unknown, unknown> };

const okResult = (overrides: Partial<LiveCompletionResult> = {}): LiveCompletionResult => ({
  text: JSON.stringify({ items: ["a", "b"] }),
  responseModel: "claude-opus-5",
  providerRequestId: "req_123",
  usage: { inputTokens: 1000, outputTokens: 200, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
  stop: "complete",
  fallbackUsed: false,
  ...overrides,
});

function harness(options: {
  config?: Partial<ToolRuntimeConfig>;
  provider?: (req: LiveCompletionRequest) => Promise<LiveCompletionResult>;
  tool?: ToolDefinition;
} = {}) {
  const calls: LiveCompletionRequest[] = [];
  const events: CostEventWrite[] = [];
  const logs: (ToolRunLog | ToolConfigLog)[] = [];
  const provider: LiveProvider = {
    name: "anthropic",
    complete: async (req) => {
      calls.push(req);
      return (options.provider ?? (async () => okResult()))(req);
    },
  };
  let run = 0;
  const deps: ExecuteDeps = {
    config: {
      mode: "live",
      liveEnabled: true,
      disabledTools: new Set(),
      provider: { name: "anthropic", model: "claude-opus-5", apiKey: "test-key" },
      notes: [],
      ...options.config,
    },
    createProvider: () => provider,
    store: createMemoryIdempotencyStore(),
    sink: {
      record: async (event) => {
        events.push(parseCostEventWrite(event)); // re-validate against the contract
        return `evt_${events.length}`;
      },
    },
    log: (entry) => logs.push(entry),
    resolveTool: (slug) => (slug === "shell-reference" ? (options.tool ?? liveTool) : undefined),
    newRunId: () => `run-${++run}`,
  };
  const exec = (body: unknown, slug = "shell-reference") => executeTool(slug, body, adapters, deps);
  return { exec, calls, events, logs, deps };
}

const live = (text: string, key = "k".repeat(20)) => ({ input: { text }, idempotencyKey: key, mode: "live" });

describe("request and input validation (before any spend)", () => {
  it.each([
    [{}, "invalid_request"],
    [{ input: { text: "hello world!" }, idempotencyKey: "short", mode: "live" }, "invalid_request"],
    [{ input: { text: "hello world!" }, idempotencyKey: "k".repeat(20), mode: "turbo" }, "invalid_request"],
    [live("tiny"), "invalid_input"],
    [live("x".repeat(2_000)), "input_too_large"],
  ])("rejects %j with %s and never calls the provider", async (body, code) => {
    const h = harness();
    const { envelope } = await h.exec(body);
    expect(envelope.ok).toBe(false);
    if (!envelope.ok) expect(envelope.error.code).toBe(code);
    expect(h.calls).toHaveLength(0);
    expect(h.events).toHaveLength(0);
  });

  it("returns tool_not_found for unknown slugs", async () => {
    const { envelope, status } = await harness().exec(live("some valid notes"), "nope");
    expect(status).toBe(404);
    expect(!envelope.ok && envelope.error.code).toBe("tool_not_found");
  });

  it("returns UI-safe field issues for invalid input", async () => {
    const { envelope } = await harness().exec(live("tiny"));
    expect(!envelope.ok && envelope.error.issues).toEqual(["Too short."]);
  });
});

describe("examples and fixture mode", () => {
  it("serves the catalogue example from the fixture, with no spend, even when live is off", async () => {
    const h = harness({ config: { liveEnabled: false, mode: "off" } });
    const { envelope } = await h.exec({ input: { text: EXAMPLE }, idempotencyKey: "k".repeat(20), mode: "example" });
    expect(envelope).toMatchObject({ ok: true, mode: "fixture", output: { items: ["example"] }, model: null, costEventRef: null });
    expect(h.calls).toHaveLength(0);
  });

  it("matches the example regardless of line endings and serves the canonical fixture", async () => {
    const multiline = { ...liveTool, example: { ...liveTool.example, input: "Line one of the notes\nLine two" } };
    const h = harness({ tool: multiline });
    const { envelope } = await h.exec({ input: { text: "Line one of the notes\r\nLine two" }, idempotencyKey: "k".repeat(20), mode: "example" });
    expect(envelope).toMatchObject({ ok: true, mode: "fixture", output: { items: ["Line", "one", "of"] } });
    expect(JSON.stringify(envelope)).not.toContain("\\r");
  });

  it("refuses example mode for anything but the catalogue example", async () => {
    const { envelope } = await harness().exec({ input: { text: "my own private notes" }, idempotencyKey: "k".repeat(20), mode: "example" });
    expect(!envelope.ok && envelope.error.code).toBe("invalid_request");
  });

  it("fixture mode answers live requests deterministically without a provider or key", async () => {
    const h = harness({ config: { mode: "fixture", liveEnabled: false, provider: null } });
    const a = await h.exec(live("alpha beta gamma delta", "a".repeat(20)));
    const b = await h.exec(live("alpha beta gamma delta", "b".repeat(20)));
    expect(a.envelope).toMatchObject({ ok: true, mode: "fixture", output: { items: ["alpha", "beta", "gamma"] } });
    expect(b.envelope.ok && b.envelope.output).toEqual(a.envelope.ok && a.envelope.output);
    expect(h.calls).toHaveLength(0);
    expect(h.events).toHaveLength(0);
  });

  it("the real reference adapter is deterministic and validates its own fixture", () => {
    const ref = toolAdapters["shell-reference"];
    const input = ref.inputSchema.parse({ text: "Line one here\nLine two here" });
    expect(ref.outputSchema.parse(ref.fixture(input))).toEqual(ref.outputSchema.parse(ref.fixture(input)));
    const example = ref.inputSchema.parse(ref.exampleInput(referenceTool.example.input));
    expect(ref.fixture(example)).toEqual(referenceTool.example.output);
  });
});

describe("kill switches and fail-closed config", () => {
  it.each<[string, Partial<ToolRuntimeConfig>, ToolDefinition | undefined, string]>([
    ["global live off", { liveEnabled: false }, undefined, "provider_disabled"],
    ["mode off", { mode: "off", liveEnabled: false }, undefined, "provider_disabled"],
    ["no provider key", { provider: null }, undefined, "provider_disabled"],
    ["tool in disabled list", { disabledTools: new Set(["shell-reference"]) }, undefined, "tool_paused"],
    ["tool lifecycle paused", {}, { ...liveTool, lifecycle: "paused", liveGeneration: false }, "tool_paused"],
    ["catalogue says examples only", {}, { ...liveTool, liveGeneration: false }, "provider_disabled"],
  ])("%s → %s, no provider call", async (_, config, tool, code) => {
    const h = harness({ config, tool });
    const { envelope } = await h.exec(live("some valid notes"));
    expect(!envelope.ok && envelope.error.code).toBe(code);
    expect(h.calls).toHaveLength(0);
  });

  it("refuses when the worst-case estimate exceeds the tool's ceiling", async () => {
    const h = harness();
    const tight = { ...adapter, limits: { ...adapter.limits, maxEstimatedCostMicros: BigInt(1) } };
    const { envelope } = await executeTool("shell-reference", live("some valid notes"), { "shell-reference": tight as ToolAdapter<unknown, unknown> }, h.deps);
    expect(!envelope.ok && envelope.error.code).toBe("provider_disabled");
    expect(h.calls).toHaveLength(0);
  });

  it("refuses an unpriced model rather than treating it as free", async () => {
    const h = harness({ config: { provider: { name: "anthropic", model: "claude-unknown-9", apiKey: "k" } } });
    const { envelope } = await h.exec(live("some valid notes"));
    expect(!envelope.ok && envelope.error.code).toBe("provider_disabled");
    expect(h.calls).toHaveLength(0);
  });

  it("honours the admission hook (rate limit / quota) before spending", async () => {
    const h = harness();
    h.deps.admit = async () => ({ ok: false, code: "rate_limited", retryAfterSeconds: 30 });
    const { envelope, status } = await h.exec(live("some valid notes"));
    expect(status).toBe(429);
    expect(!envelope.ok && envelope.error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 30, retryable: true });
    expect(h.calls).toHaveLength(0);
  });
});

describe("live success and cost events", () => {
  it("returns a validated envelope and one reconcilable cost event", async () => {
    const h = harness();
    const { envelope, status } = await h.exec(live(SECRET_INPUT));
    expect(status).toBe(200);
    expect(envelope).toMatchObject({
      ok: true,
      mode: "live",
      output: { items: ["a", "b"] },
      model: "claude-opus-5",
      promptVersion: "test@1",
      tool: { slug: "shell-reference", version: "9.9.9", schemaVersion: "3" },
      costEventRef: "evt_1",
    });
    expect(h.events).toHaveLength(1);
    const [event] = h.events;
    expect(event).toMatchObject({
      idempotencyKey: "web:shell-reference:run-1",
      app: "web",
      ownerType: "workspace",
      ownerId: "web-public-tools",
      actorId: null,
      operation: "shell-reference",
      outcome: "succeeded",
      provider: "anthropic",
      responseModel: "claude-opus-5",
      providerRequestId: "req_123",
      promptVersion: "test@1",
      costSource: "registry_estimate",
      credentialSource: "platform",
      fixture: false,
    });
    // $5/M input × 1000 + $25/M output × 200 = 5000 + 5000 micros.
    expect(event.estimatedCostMicros).toBe(BigInt(10_000));
    expect(event.pricingSnapshot?.pricingVersion).toMatch(/^web-tools-/);
  });

  it("fences user text in the user turn, never the system prompt", async () => {
    const h = harness();
    await h.exec(live(SECRET_INPUT));
    expect(h.calls[0].system).not.toContain("Nightjar");
    expect(h.calls[0].user).toContain(`<notes>${SECRET_INPUT}</notes>`);
  });

  it("prices the model that actually answered after a fallback", async () => {
    const h = harness({ provider: async () => okResult({ responseModel: "claude-opus-4-8", fallbackUsed: true }) });
    await h.exec(live("some valid notes"));
    expect(h.events[0]).toMatchObject({ requestModel: "claude-opus-5", responseModel: "claude-opus-4-8" });
    expect(h.events[0].metadata).toMatchObject({ fallback_used: true });
  });

  it("still returns the result if the cost write fails", async () => {
    const h = harness();
    h.deps.sink = { record: async () => Promise.reject(new Error("db down")) };
    const { envelope } = await h.exec(live("some valid notes"));
    expect(envelope).toMatchObject({ ok: true, costEventRef: null });
    expect(h.logs.some((l) => l.event === "tool_config" && l.notes.includes("cost event write failed"))).toBe(true);
  });
});

describe("invalid output, refusals, and failures", () => {
  it.each([
    ["non-JSON text", okResult({ text: "Sure! Here are your items: a, b" })],
    ["schema mismatch", okResult({ text: JSON.stringify({ items: [1, 2] }) })],
    ["oversized output", okResult({ text: JSON.stringify({ items: ["x".repeat(3_000)] }) })],
    ["truncated at max_tokens", okResult({ stop: "max_tokens" })],
  ])("rejects %s before display and records the billed attempt as failed", async (_, result) => {
    const h = harness({ provider: async () => result });
    const { envelope, status } = await h.exec(live("some valid notes"));
    expect(status).toBe(502);
    expect(!envelope.ok && envelope.error).toMatchObject({ code: "invalid_output", retryable: false });
    expect(JSON.stringify(envelope)).not.toContain("Sure!");
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ outcome: "failed", costSource: "registry_estimate" });
  });

  it("maps a refusal to declined and records its usage", async () => {
    const h = harness({ provider: async () => okResult({ stop: "refusal", text: "" }) });
    const { envelope } = await h.exec(live("some valid notes"));
    expect(!envelope.ok && envelope.error.code).toBe("declined");
    expect(h.events[0].outcome).toBe("failed");
  });

  it("times out, aborts the provider call, and records an unknown-cost attempt", async () => {
    let aborted = false;
    const h = harness({
      provider: (req) =>
        new Promise((_, reject) => {
          req.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new ProviderError("cancelled", "aborted"));
          });
        }),
    });
    const { envelope, status } = await h.exec(live("some valid notes"));
    expect(aborted).toBe(true);
    expect(status).toBe(504);
    expect(!envelope.ok && envelope.error).toMatchObject({ code: "timeout", retryable: true });
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ outcome: "cancelled", costSource: "unknown", estimatedCostMicros: null, usage: [] });
  });

  it.each([
    ["rate_limited", "provider_error", true],
    ["unavailable", "provider_error", true],
    ["auth", "internal", false],
    ["bad_request", "internal", false],
  ] as const)("provider %s → %s (retryable %s), no cost event", async (kind, code, retryable) => {
    const h = harness({ provider: async () => Promise.reject(new ProviderError(kind, "detail that must not leak")) });
    const { envelope } = await h.exec(live("some valid notes"));
    expect(!envelope.ok && envelope.error).toMatchObject({ code, retryable });
    expect(JSON.stringify(envelope)).not.toContain("detail that must not leak");
    expect(h.events).toHaveLength(0);
  });
});

describe("idempotency", () => {
  it("concurrent duplicates share one provider call and one cost event", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = harness({ provider: async () => (await gate, okResult()) });
    const first = h.exec(live("some valid notes", "same-key-000000000"));
    const second = h.exec(live("some valid notes", "same-key-000000000"));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(h.calls).toHaveLength(1);
    expect(h.events).toHaveLength(1);
    expect(b.envelope).toEqual(a.envelope);
  });

  it("a later retry with the same key replays without spending again", async () => {
    const h = harness();
    await h.exec(live("some valid notes", "retry-key-00000000"));
    const again = await h.exec(live("some valid notes", "retry-key-00000000"));
    expect(again.envelope.ok).toBe(true);
    expect(h.calls).toHaveLength(1);
    expect(h.events).toHaveLength(1);
    expect(h.logs.filter((l) => l.event === "tool_run").at(-1)).toMatchObject({ replayed: true });
  });

  it("the same key with different input is a conflict", async () => {
    const h = harness();
    await h.exec(live("some valid notes", "conflict-key-00000"));
    const { envelope } = await h.exec(live("different valid notes", "conflict-key-00000"));
    expect(!envelope.ok && envelope.error.code).toBe("idempotency_conflict");
    expect(h.calls).toHaveLength(1);
  });

  it("a retryable failure frees the key so the retry really retries", async () => {
    let n = 0;
    const h = harness({ provider: async () => (++n === 1 ? Promise.reject(new ProviderError("unavailable", "x")) : okResult()) });
    const first = await h.exec(live("some valid notes", "flaky-key-00000000"));
    const second = await h.exec(live("some valid notes", "flaky-key-00000000"));
    expect(first.envelope.ok).toBe(false);
    expect(second.envelope.ok).toBe(true);
    expect(h.calls).toHaveLength(2);
  });

  it("different keys are independent runs", async () => {
    const h = harness();
    await h.exec(live("some valid notes", "key-one-0000000000"));
    await h.exec(live("some valid notes", "key-two-0000000000"));
    expect(h.calls).toHaveLength(2);
    expect(new Set(h.events.map((e) => e.idempotencyKey)).size).toBe(2);
  });
});

describe("logging", () => {
  it("never logs input, output, prompts, or keys", async () => {
    const h = harness();
    await h.exec(live(SECRET_INPUT));
    await h.exec(live("tiny"));
    const bigints = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
    const serialized = JSON.stringify(h.logs) + JSON.stringify(h.events, bigints);
    for (const secret of ["Nightjar", "Dana", "Confidential", "<notes>", "Extract items.", "test-key", '"a","b"']) {
      expect(serialized).not.toContain(secret);
    }
    expect(h.logs.find((l) => l.event === "tool_run")).toMatchObject({
      slug: "shell-reference",
      servedMode: "live",
      outcome: "succeeded",
      costRecorded: true,
    });
  });
});
