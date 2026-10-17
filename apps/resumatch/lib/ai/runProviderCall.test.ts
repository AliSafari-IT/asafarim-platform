import { beforeEach, describe, expect, it, vi } from "vitest";

const assertCanRunProviderCall = vi.fn();
vi.mock("../tailoring/ai/quota", () => ({
  assertCanRunProviderCall: (...args: unknown[]) => assertCanRunProviderCall(...args),
}));

import { MAX_ATTEMPTS, backoffMs, runProviderCallWithBudget } from "./runProviderCall";

class FakeError extends Error {
  constructor(readonly retryable: boolean) {
    super(retryable ? "retryable" : "fatal");
  }
}

function setup(call: (attempt: number) => Promise<string>) {
  const sleeps: number[] = [];
  const failures: number[] = [];
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
    });
  return { run, sleeps, failures, prepare };
}

beforeEach(() => {
  assertCanRunProviderCall.mockReset();
  assertCanRunProviderCall.mockResolvedValue(undefined);
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
