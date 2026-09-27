import "server-only";
import { SHELL_REFERENCE_TOOL_VERSION } from "../../versions";
import { shellReferenceExampleInput, shellReferenceExampleOutput } from "../../../../content/tool-fixtures/shell-reference";
import { referenceInputSchema, referenceResultSchema, type ReferenceInput, type ReferenceResult } from "../../reference/schema";
import type { ToolAdapter } from "../adapter";

/**
 * Reference adapter: fixture-only, no provider, no prompt. It proves the
 * boundary end to end (validation, envelope, idempotency, fixture mode)
 * without a key. Its fixture is deterministic: the catalogue example returns
 * the prepared result; any other text becomes one "from your text" item per
 * non-empty line, quoting that line.
 */
export const shellReferenceAdapter: ToolAdapter<ReferenceInput, ReferenceResult> = {
  slug: "shell-reference",
  version: SHELL_REFERENCE_TOOL_VERSION,
  schemaVersion: "1",
  inputSchema: referenceInputSchema,
  outputSchema: referenceResultSchema,
  limits: {
    maxInputBytes: 16_000,
    maxOutputBytes: 32_000,
    timeoutMs: 20_000,
    maxOutputTokens: 2_000,
    maxEstimatedCostMicros: BigInt(0),
  },
  exampleInput: (text) => ({ text }),
  fixture({ text }) {
    if (text === shellReferenceExampleInput.trim()) return shellReferenceExampleOutput;
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 50)
      .map((line) => line.slice(0, 500));
    return { items: lines.map((line) => ({ text: line, provenance: "extracted" as const, source: line })) };
  },
};
