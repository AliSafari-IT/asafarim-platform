/**
 * OPT-IN live-provider evaluation. Never runs in CI and never blocks a merge.
 *
 *   AI_TOOLS_EVAL_LIVE=1 ANTHROPIC_API_KEY=… \
 *   AI_TOOLS_EVAL_BUDGET_USD=2 AI_TOOLS_EVAL_MODEL=claude-opus-5 \
 *   pnpm --filter @asafarim/ai-tools-benchmark eval:live
 *
 * Runs each valid dataset case once against the real provider through the
 * same execution boundary, scores it with the same scorers, and stops before
 * the worst-case estimate of the next call would exceed the budget. Writes
 * reports/live-<timestamp>.json (git-ignored), labelled as a live run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toolCatalogue } from "../../../apps/web/content/tools";
import { toolAdapters } from "../../../apps/web/lib/tools/server/adapters";
import { worstCaseCostMicros } from "../../../apps/web/lib/tools/server/cost";
import { executeTool } from "../../../apps/web/lib/tools/server/execute";
import { createMemoryIdempotencyStore } from "../../../apps/web/lib/tools/server/idempotency";
import { createAnthropicProvider } from "../../../apps/web/lib/tools/server/providers/anthropic";
import type { ToolDefinition } from "../../../apps/web/lib/tools/types";
import { RUBRIC_VERSION } from "../src/evaluate";
import { REPORT_PATH, serialize } from "../src/paths";
import { SUITES } from "../src/suite";

if (process.env.AI_TOOLS_EVAL_LIVE !== "1") {
  console.error("Live evaluation is opt-in: set AI_TOOLS_EVAL_LIVE=1 (and ANTHROPIC_API_KEY) to run it.");
  process.exit(2);
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(2);
}
const model = process.env.AI_TOOLS_EVAL_MODEL ?? "claude-opus-5";
const budgetMicros = BigInt(Math.round(Number(process.env.AI_TOOLS_EVAL_BUDGET_USD ?? "2") * 1_000_000));
let committedMicros = BigInt(0);
let spentMicros = BigInt(0);
const results: unknown[] = [];

for (const suite of SUITES) {
  const entry = toolCatalogue.find((t) => t.slug === suite.slug)!;
  const tool: ToolDefinition = { ...entry, lifecycle: "beta", indexable: true, liveGeneration: true };
  const adapter = toolAdapters[suite.slug];
  for (const c of suite.cases.filter((x) => x.expect.fixtureOutcome === "ok")) {
    const input = adapter.inputSchema.parse(c.input);
    const prompt = adapter.live!.buildPrompt(input);
    const worst = worstCaseCostMicros("anthropic", model, Buffer.byteLength(prompt.system + prompt.user), adapter.limits.maxOutputTokens);
    if (!worst) throw new Error(`${model} is not priced; refusing to run.`);
    if (committedMicros + worst.micros > budgetMicros) {
      console.warn(`Budget reached; skipping ${suite.slug}/${c.id} and the rest.`);
      break;
    }
    committedMicros += worst.micros;
    const started = Date.now();
    const { envelope } = await executeTool(suite.slug, { input: c.input, mode: "live", idempotencyKey: `live-eval-${suite.slug}-${c.id}`.slice(0, 120) }, toolAdapters, {
      config: { mode: "live", liveEnabled: true, disabledTools: new Set(), provider: { name: "anthropic", model, apiKey }, notes: [] },
      createProvider: (p, timeoutMs) => createAnthropicProvider(p.apiKey, { timeoutMs }),
      store: createMemoryIdempotencyStore(),
      sink: {
        record: async (event) => {
          if (event.estimatedCostMicros !== null) spentMicros += BigInt(event.estimatedCostMicros);
          return "live-eval";
        },
      },
      log: () => {},
      resolveTool: () => tool,
    });
    results.push({
      tool: suite.slug,
      case: c.id,
      kind: c.kind,
      outcome: envelope.ok ? envelope.status : envelope.error.code,
      warnings: envelope.ok ? envelope.warnings : [],
      latencyMs: Date.now() - started,
      score: envelope.ok ? suite.scorer(envelope.output, input, c.expect) : null,
    });
    console.log(`${suite.slug}/${c.id}: ${envelope.ok ? envelope.status : envelope.error.code}`);
  }
}

const file = path.join(path.dirname(REPORT_PATH), `live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(
  file,
  serialize({
    mode: "live",
    notice: "LIVE-provider evaluation on synthetic data. Latency and cost are from real calls on this run only; not production telemetry.",
    rubricVersion: RUBRIC_VERSION,
    model,
    budgetUsd: Number(budgetMicros) / 1_000_000,
    estimatedSpendUsd: Number(spentMicros) / 1_000_000,
    results,
  })
);
console.log(`wrote ${file} — estimated spend $${(Number(spentMicros) / 1_000_000).toFixed(4)} of $${Number(budgetMicros) / 1_000_000} budget`);
