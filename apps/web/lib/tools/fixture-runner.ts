import type { ToolRunner } from "./types";

/**
 * A runner with no provider behind it: the example input returns its prepared
 * result (labelled `fixture`); anything else reports live generation as
 * unavailable. It never fabricates a result for the visitor's own text.
 *
 * #673 replaces this for live tools with a server-backed runner that falls
 * back to the same behaviour when providers are disabled.
 */
export function createFixtureRunner<TResult>(
  example: { input: string; output: TResult },
  options: { delayMs?: number } = {}
): ToolRunner<TResult> {
  const delayMs = options.delayMs ?? 350;
  return async (input, signal) => {
    await wait(delayMs, signal);
    if (input.trim() === example.input.trim()) {
      return { kind: "success", mode: "fixture", result: example.output };
    }
    return { kind: "provider-disabled", reason: "unavailable" };
  };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}
