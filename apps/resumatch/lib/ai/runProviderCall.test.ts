import { beforeEach, describe, expect, it, vi } from "vitest";

const assertCanRunProviderCall = vi.fn();
vi.mock("../tailoring/ai/quota", () => ({
  assertCanRunProviderCall: (...args: unknown[]) => assertCanRunProviderCall(...args),
}));

const outcomeCreate = vi.fn();
vi.mock("../db/client", () => ({
  getJobmatchDb: () => ({ aiCallOutcome: { create: (...args: unknown[]) => outcomeCreate(...args) } }),
}));

import type { CallOutcomeRecord } from "./callOutcome";
import { MAX_ATTEMPTS, backoffMs, runProviderCallWithBudget } from "./runProviderCall";

class FakeError extends Error {
  constructor(readonly retryable: boolean) {
    super(retryable ? "retryable" : "fatal");
  }
}

function setup(call: (attempt: number) => Promise<string>) {
  const sleeps: number[] = [];
  const failures: number[] = [];
  const outcomes: CallOutcomeRecord[] = [];
  const prepare = vi.fn(async () => ({ provider: "p" }));
  const run = () =>
    runProviderCallWithBudget({
      workspaceId: "ws-1",
      kind: "tailor",
      prepare,
      call: (_ctx, attempt) => call(attempt),
      onAttemptFailed: (_err, ctx, attempt) => {
        expect(ctx).toEqual({ provider: "p" });
        failures.push(attempt);
      },
      isRetryable: (err) => (err instanceof FakeError ? err.retryable : true),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      recordOutcome: async (record) => {
        outcomes.push(record);
      },
    });
  return { run, sleeps, failures, prepare, outcomes };
}

beforeEach(() => {
  assertCanRunProviderCall.mockReset();
  assertCanRunProviderCall.mockResolvedValue(undefined);
  outcomeCreate.mockReset();
  outcomeCreate.mockResolvedValue({});
});

describe("runProviderCallWithBudget", () => {
  it("returns the value of a first-try success with no retry", async () => {
    const call = vi.fn(async () => "ok");
    const { run, sleeps, failures } = setup(call);
    await expect(run()).resolves.toEqual({ ok: true, value: "ok" });
    expect(assertCanRunProviderCall).toHaveBeenCalledWith("ws-1", "tailor");
    expect(call).toHaveBeenCalledTimes(1);
    expect(failures).toEqual([]);
    expect(sleeps).toEqual([]);
  });

  it("retries a retryable failure and returns the later success", async () => {
    const call = vi.fn(async (attempt: number) => {
      if (attempt === 1) throw new FakeError(true);
      return "second";
    });
    const { run, sleeps, failures } = setup(call);
    await expect(run()).resolves.toEqual({ ok: true, value: "second" });
    expect(call).toHaveBeenCalledTimes(2);
    expect(failures).toEqual([1]);
    expect(sleeps).toEqual([250]);
  });

  it("stops at once on a non-retryable failure", async () => {
    const fatal = new FakeError(false);
    const { run, sleeps, failures } = setup(async () => {
      throw fatal;
    });
    await expect(run()).resolves.toEqual({ ok: false, error: fatal });
    expect(failures).toEqual([1]);
    expect(sleeps).toEqual([]);
  });

  it("gives up after MAX_ATTEMPTS with linear backoff in between", async () => {
    const errors = [new FakeError(true), new FakeError(true), new FakeError(true)];
    const call = vi.fn(async (attempt: number) => {
      throw errors[attempt - 1];
    });
    const { run, sleeps, failures } = setup(call);
    await expect(run()).resolves.toEqual({ ok: false, error: errors[2] });
    expect(MAX_ATTEMPTS).toBe(3);
    expect(call).toHaveBeenCalledTimes(3);
    expect(failures).toEqual([1, 2, 3]);
    expect(sleeps).toEqual([250, 500]);
    expect([1, 2].map(backoffMs)).toEqual([250, 500]);
  });

  it("makes no attempt when the budget check refuses", async () => {
    const refusal = new Error("budget_exhausted");
    assertCanRunProviderCall.mockRejectedValue(refusal);
    const call = vi.fn(async () => "never");
    const { run, prepare, failures } = setup(call);
    await expect(run()).resolves.toEqual({ ok: false, error: refusal });
    expect(prepare).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(failures).toEqual([]);
  });

  it("makes no attempt when prepare fails", async () => {
    const call = vi.fn(async () => "never");
    const { run, prepare } = setup(call);
    const boom = new Error("no provider");
    prepare.mockRejectedValueOnce(boom);
    await expect(run()).resolves.toEqual({ ok: false, error: boom });
    expect(call).not.toHaveBeenCalled();
  });

  it("ends the call when onAttemptFailed itself throws", async () => {
    const recordError = new Error("ledger down");
    const call = vi.fn(async () => {
      throw new FakeError(true);
    });
    const result = await runProviderCallWithBudget({
      workspaceId: "ws-1",
      kind: "extract",
      prepare: () => null,
      call,
      onAttemptFailed: () => {
        throw recordError;
      },
      isRetryable: () => true,
      sleep: async () => {},
    });
    expect(result).toEqual({ ok: false, error: recordError });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

class QuotaExceededError extends Error {
  readonly reason = "monthly_budget_exceeded";
  constructor() {
    super("monthly_budget_exceeded");
    this.name = "QuotaExceededError";
  }
}

describe("runProviderCallWithBudget outcome records (#512)", () => {
  const base = { workspaceId: "ws-1", kind: "tailor", usedFallback: false } as const;

  it("records a first-try success with one attempt and no error code", async () => {
    const { run, outcomes } = setup(async () => "ok");
    await run();
    expect(outcomes).toEqual([{ ...base, outcome: "success", attempts: 1, degraded: false, errorCode: null }]);
  });

  it("records a retry-then-success with the attempt count", async () => {
    const { run, outcomes } = setup(async (attempt) => {
      if (attempt < 3) throw new FakeError(true);
      return "third";
    });
    await run();
    expect(outcomes).toEqual([{ ...base, outcome: "success", attempts: 3, degraded: false, errorCode: null }]);
  });

  it("records exhaustion after MAX_ATTEMPTS", async () => {
    const { run, outcomes } = setup(async () => {
      throw new FakeError(true);
    });
    await run();
    expect(outcomes).toEqual([{ ...base, outcome: "exhausted", attempts: 3, degraded: true, errorCode: "Error" }]);
  });

  it("records a non-retryable stop with the error's code, never its message", async () => {
    const fatal = Object.assign(new FakeError(false), { code: "INVALID_SCHEMA" });
    fatal.message = "provider said: secret prompt text";
    const { run, outcomes } = setup(async () => {
      throw fatal;
    });
    await run();
    expect(outcomes).toEqual([
      { ...base, outcome: "non_retryable", attempts: 1, degraded: true, errorCode: "INVALID_SCHEMA" },
    ]);
    expect(JSON.stringify(outcomes)).not.toContain("secret");
  });

  it("records a budget refusal with zero attempts", async () => {
    assertCanRunProviderCall.mockRejectedValue(new QuotaExceededError());
    const { run, outcomes } = setup(async () => "never");
    await run();
    expect(outcomes).toEqual([
      { ...base, outcome: "budget_refused", attempts: 0, degraded: true, errorCode: "monthly_budget_exceeded" },
    ]);
  });

  it("tells a failed budget check apart from a refusal", async () => {
    assertCanRunProviderCall.mockRejectedValue(new TypeError("db down"));
    const { run, outcomes } = setup(async () => "never");
    await run();
    expect(outcomes[0]).toMatchObject({ outcome: "budget_check_failed", attempts: 0, errorCode: "TypeError" });
  });

  it("records a failed prepare with zero attempts", async () => {
    const { run, prepare, outcomes } = setup(async () => "never");
    prepare.mockRejectedValueOnce(new Error("no provider"));
    await run();
    expect(outcomes[0]).toMatchObject({ outcome: "prepare_failed", attempts: 0, degraded: true });
  });

  it("records a throwing onAttemptFailed as attempt_hook_failed", async () => {
    const outcomes: CallOutcomeRecord[] = [];
    await runProviderCallWithBudget({
      workspaceId: "ws-1",
      kind: "extract",
      prepare: () => null,
      call: async () => {
        throw new FakeError(true);
      },
      onAttemptFailed: () => {
        throw new Error("ledger down");
      },
      isRetryable: () => true,
      sleep: async () => {},
      recordOutcome: async (r) => {
        outcomes.push(r);
      },
    });
    expect(outcomes[0]).toMatchObject({ kind: "extract", outcome: "attempt_hook_failed", attempts: 1 });
  });

  it("returns the same result when the outcome write fails", async () => {
    const result = await runProviderCallWithBudget({
      workspaceId: "ws-1",
      kind: "tailor",
      prepare: () => null,
      call: async () => "ok",
      onAttemptFailed: () => {},
      isRetryable: () => true,
      recordOutcome: async () => {
        throw new Error("outcome table missing");
      },
    });
    expect(result).toEqual({ ok: true, value: "ok" });
  });

  it("writes an ai_call_outcomes row by default, and survives that write failing", async () => {
    const run = () =>
      runProviderCallWithBudget({
        workspaceId: "ws-9",
        kind: "job_meta",
        prepare: () => null,
        call: async () => 42,
        onAttemptFailed: () => {},
        isRetryable: () => false,
      });
    await expect(run()).resolves.toEqual({ ok: true, value: 42 });
    expect(outcomeCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "ws-9",
        kind: "job_meta",
        outcome: "success",
        attempts: 1,
        degraded: false,
        usedFallback: false,
        errorCode: null,
      },
    });
    outcomeCreate.mockRejectedValueOnce(new Error("P2021"));
    await expect(run()).resolves.toEqual({ ok: true, value: 42 });
  });
});

describe("runProviderCallWithBudget cross-provider fallback (#511)", () => {
  type Ctx = { name: "openai" | "anthropic" };

  function setupFallback(opts: {
    primary: (attempt: number) => Promise<string>;
    fallback?: () => Promise<string>;
    fallbackPrepare?: () => Promise<Ctx>;
    hasFallback?: boolean;
    isEligible?: (error: unknown) => boolean;
  }) {
    const sleeps: number[] = [];
    const failures: Array<[string, number]> = [];
    const outcomes: CallOutcomeRecord[] = [];
    const fallbackCall = vi.fn(opts.fallback ?? (async () => "from-fallback"));
    const fallbackPrepare = vi.fn(opts.fallbackPrepare ?? (async (): Promise<Ctx> => ({ name: "anthropic" })));
    const run = () =>
      runProviderCallWithBudget<Ctx, string>({
        workspaceId: "ws-1",
        kind: "extract",
        prepare: async () => ({ name: "openai" }),
        fallback: opts.hasFallback === false ? null : { prepare: fallbackPrepare, isEligible: opts.isEligible },
        call: (ctx, attempt) => (ctx.name === "openai" ? opts.primary(attempt) : fallbackCall()),
        onAttemptFailed: (_err, ctx, attempt) => {
          failures.push([ctx.name, attempt]);
        },
        isRetryable: (err) => (err instanceof FakeError ? err.retryable : false),
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        recordOutcome: async (record) => {
          outcomes.push(record);
        },
      });
    return { run, sleeps, failures, outcomes, fallbackCall, fallbackPrepare };
  }

  it("tries the fallback once after the primary is exhausted on a retryable error, and returns its value", async () => {
    const primary = vi.fn(async () => {
      throw new FakeError(true);
    });
    const { run, sleeps, failures, outcomes, fallbackCall } = setupFallback({ primary });
    await expect(run()).resolves.toEqual({ ok: true, value: "from-fallback" });
    expect(primary).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(fallbackCall).toHaveBeenCalledTimes(1);
    // No extra backoff before the fallback: a different provider.
    expect(sleeps).toEqual([250, 500]);
    expect(failures).toEqual([
      ["openai", 1],
      ["openai", 2],
      ["openai", 3],
    ]);
    expect(outcomes).toEqual([
      expect.objectContaining({ outcome: "success", attempts: MAX_ATTEMPTS + 1, degraded: false, usedFallback: true, errorCode: null }),
    ]);
  });

  it("never reaches the fallback on a non-retryable error", async () => {
    const { run, outcomes, fallbackCall, fallbackPrepare } = setupFallback({
      primary: async () => {
        throw new FakeError(false);
      },
    });
    const result = await run();
    expect(result.ok).toBe(false);
    expect(fallbackPrepare).not.toHaveBeenCalled();
    expect(fallbackCall).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome: "non_retryable", attempts: 1, usedFallback: false });
  });

  it("does not use the fallback when the last primary error is non-retryable", async () => {
    const { run, outcomes, fallbackPrepare } = setupFallback({
      primary: async (attempt) => {
        throw new FakeError(attempt < MAX_ATTEMPTS);
      },
    });
    expect((await run()).ok).toBe(false);
    expect(fallbackPrepare).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome: "exhausted", attempts: MAX_ATTEMPTS, usedFallback: false });
  });

  it("never reaches the fallback when the budget refuses", async () => {
    const refusal = Object.assign(new Error("over budget"), { name: "QuotaExceededError" });
    assertCanRunProviderCall.mockRejectedValueOnce(refusal);
    const primary = vi.fn(async () => "never");
    const { run, outcomes, fallbackPrepare } = setupFallback({ primary });
    await expect(run()).resolves.toEqual({ ok: false, error: refusal });
    expect(primary).not.toHaveBeenCalled();
    expect(fallbackPrepare).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome: "budget_refused", usedFallback: false });
  });

  it("degrades with the fallback's error when the fallback fails too, after recording its failure", async () => {
    const fallbackError = new FakeError(true);
    const { run, failures, outcomes } = setupFallback({
      primary: async () => {
        throw new FakeError(true);
      },
      fallback: async () => {
        throw fallbackError;
      },
    });
    await expect(run()).resolves.toEqual({ ok: false, error: fallbackError });
    expect(failures.at(-1)).toEqual(["anthropic", MAX_ATTEMPTS + 1]);
    expect(outcomes[0]).toMatchObject({ outcome: "exhausted", attempts: MAX_ATTEMPTS + 1, degraded: true, usedFallback: true });
  });

  it("degrades as exhausted when the fallback can't load, with no extra attempt", async () => {
    const loadError = Object.assign(new Error("no key"), { code: "missing_key" });
    const { run, outcomes, fallbackCall } = setupFallback({
      primary: async () => {
        throw new FakeError(true);
      },
      fallbackPrepare: async () => {
        throw loadError;
      },
    });
    await expect(run()).resolves.toEqual({ ok: false, error: loadError });
    expect(fallbackCall).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome: "exhausted", attempts: MAX_ATTEMPTS, usedFallback: true, errorCode: "missing_key" });
  });

  it("with no fallback configured, exhaustion behaves exactly as before", async () => {
    const { run, outcomes, fallbackPrepare } = setupFallback({
      primary: async () => {
        throw new FakeError(true);
      },
      hasFallback: false,
    });
    expect((await run()).ok).toBe(false);
    expect(fallbackPrepare).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome: "exhausted", attempts: MAX_ATTEMPTS, usedFallback: false });
  });

  it("skips the fallback when the domain's isEligible rejects the last error", async () => {
    const { run, outcomes, fallbackPrepare } = setupFallback({
      primary: async () => {
        throw new FakeError(true);
      },
      isEligible: () => false,
    });
    expect((await run()).ok).toBe(false);
    expect(fallbackPrepare).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome: "exhausted", attempts: MAX_ATTEMPTS, usedFallback: false });
  });
});
