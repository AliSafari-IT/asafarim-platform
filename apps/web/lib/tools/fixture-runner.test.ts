import { describe, expect, it } from "vitest";
import { createFixtureRunner } from "./fixture-runner";

const runner = createFixtureRunner({ input: "example input", output: { items: 1 } }, { delayMs: 0 });

describe("createFixtureRunner", () => {
  it("returns the prepared result, labelled fixture, for the example input", async () => {
    await expect(runner("  example input\n", new AbortController().signal)).resolves.toEqual({
      kind: "success",
      mode: "fixture",
      result: { items: 1 },
    });
  });

  it("never fabricates a result for other input", async () => {
    await expect(runner("my own text", new AbortController().signal)).resolves.toEqual({
      kind: "provider-disabled",
      reason: "unavailable",
    });
  });

  it("rejects when aborted", async () => {
    const controller = new AbortController();
    const pending = createFixtureRunner({ input: "a", output: 1 }, { delayMs: 1000 })("a", controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });
});
