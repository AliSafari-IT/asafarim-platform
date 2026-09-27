import "server-only";
import type { z } from "zod";
import type { ToolSlug } from "../types";

/**
 * The contract every public tool implements on the server. One adapter per
 * tool, registered in `adapters/index.ts`. Adapters hold the domain logic
 * (schemas, fixture, prompt); `execute.ts` owns everything operational
 * (validation order, kill switches, idempotency, timeout, cost, logging).
 */
export interface ToolAdapter<TInput, TOutput> {
  slug: ToolSlug;
  /** Bumped on any user-visible behaviour change. */
  version: string;
  /** Bumped on any change to the input or output schema. */
  schemaVersion: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  limits: ToolAdapterLimits;
  /**
   * Deterministic: the same input always yields the same output, with no
   * network, clock, or randomness. Used for examples, CI, and fixture mode.
   */
  fixture(input: TInput): TOutput;
  /** Turns the catalogue's example text into this tool's input shape. */
  exampleInput(exampleText: string): TInput;
  /** Absent = fixture-only tool; live requests report provider_disabled. */
  live?: ToolLiveSpec<TInput>;
}

export interface ToolAdapterLimits {
  /** UTF-8 bytes of the serialized input, checked before parsing. */
  maxInputBytes: number;
  /** UTF-8 bytes of the provider's raw text, checked before parsing. */
  maxOutputBytes: number;
  /** Wall-clock budget for the provider call. */
  timeoutMs: number;
  /** Hard cap on output tokens requested from the provider (includes thinking). */
  maxOutputTokens: number;
  /**
   * Refuse to call the provider when the worst-case estimate (input tokens
   * approximated from bytes + maxOutputTokens, priced from the snapshot)
   * exceeds this. Integer USD micros.
   */
  maxEstimatedCostMicros: bigint;
}

export interface ToolLiveSpec<TInput> {
  /** e.g. `test_plan@1`. Recorded on every cost event and envelope. */
  promptVersion: string;
  /** JSON Schema sent as the provider's structured-output format. */
  outputJsonSchema: Record<string, unknown>;
  /** Reasoning effort; defaults to "medium". */
  effort?: "low" | "medium" | "high";
  /**
   * Build the prompt. The user's text must be fenced as data inside `user`;
   * `system` holds the instructions and must never contain user text.
   */
  buildPrompt(input: TInput): { system: string; user: string };
}
