/**
 * Runs the suite through the real execution boundary (`executeTool`) with
 * deterministic dependencies: fixture mode for the datasets, and a canned
 * provider (no network, no key) for the adversarial responses. Nothing here
 * reads the clock for results, so the report is reproducible byte for byte.
 */
import { createHash } from "node:crypto";
import { toolCatalogue } from "../../../apps/web/content/tools";
import { toolAdapters } from "../../../apps/web/lib/tools/server/adapters";
import { executeTool, type ExecuteDeps } from "../../../apps/web/lib/tools/server/execute";
import { createMemoryIdempotencyStore } from "../../../apps/web/lib/tools/server/idempotency";
import type { ToolRuntimeConfig } from "../../../apps/web/lib/tools/server/config";
import type { ToolDefinition } from "../../../apps/web/lib/tools/types";
import type { Score } from "./scorers";
import { REQUIRED_KINDS, SUITES, sharedKind, type ToolSuite } from "./suite";

export const RUBRIC_VERSION = "ai-tools-rubric/1";
/** The canned provider's alias in reports. Never a real model. */
export const CANNED_MODEL = "fixture-canned";
/** Usage every canned response reports, so cost is illustrative and stable. */
const CANNED_USAGE = { inputTokens: 2_000, outputTokens: 3_000, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 };

export interface CaseResult {
  id: string;
  kind: string;
  expected: string;
  outcome: string;
  passed: boolean;
  score: Score | null;
  exportsValid: boolean | null;
}

export interface AdversarialResult {
  id: string;
  caseId: string;
  failure: string;
  expected: "clean" | "degraded" | "rejected";
  outcome: "clean" | "degraded" | "rejected" | "other";
  passed: boolean;
  /** Unsupported claims / false precision that survived the server's checks. Gate: 0. */
  survivingUnsupportedClaims: number;
  survivingFalsePrecision: number;
  /** Illustrative only: priced from canned token counts, not a real call. */
  illustrativeCostMicros: string | null;
}

export interface ToolReport {
  slug: string;
  toolVersion: string;
  schemaVersion: string;
  promptVersion: string | null;
  datasetVersion: string;
  kindsCovered: string[];
  missingKinds: string[];
  cases: CaseResult[];
  adversarial: AdversarialResult[];
  summary: {
    schemaCompliance: number;
    outcomeAccuracy: number;
    traceability: number;
    unsupportedClaims: number;
    falsePrecision: number;
    injectionResistance: number;
    exportCompatibility: number;
    guardrailAccuracy: number;
    survivingUnsupportedClaims: number;
    domain: Record<string, number | null>;
  };
}

export interface EvalReport {
  reportVersion: 1;
  /** Always "fixture" here; live runs write their own report (scripts/live.ts). */
  mode: "fixture";
  notice: string;
  rubricVersion: string;
  models: { fixture: string; guardrails: string };
  tools: ToolReport[];
}

export const FIXTURE_NOTICE =
  "Fixture-mode evaluation: deterministic rule-based outputs and canned model responses, scored offline. Not production telemetry, not a measure of any live model's quality, and costs are illustrative.";

const FIXTURE_CONFIG: ToolRuntimeConfig = { mode: "fixture", liveEnabled: false, disabledTools: new Set(), provider: null, notes: [] };
const CANNED_CONFIG: ToolRuntimeConfig = {
  mode: "live",
  liveEnabled: true,
  disabledTools: new Set(),
  provider: { name: "anthropic", model: "claude-opus-5", apiKey: "canned-no-network" },
  notes: [],
};

function deps(config: ToolRuntimeConfig, tool: ToolDefinition, response?: unknown, costs?: bigint[]): ExecuteDeps {
  let n = 0;
  return {
    config,
    createProvider: () => ({
      name: "anthropic",
      complete: async () => {
        if (response === undefined) throw new Error("the fixture suite must never call a provider");
        return { text: JSON.stringify(response), responseModel: "claude-opus-5", providerRequestId: null, usage: CANNED_USAGE, stop: "complete", fallbackUsed: false };
      },
    }),
    store: createMemoryIdempotencyStore(),
    sink: {
      record: async (event) => {
        if (event.estimatedCostMicros !== null && costs) costs.push(BigInt(event.estimatedCostMicros));
        return "evt";
      },
    },
    log: () => {},
    now: () => 0,
    newRunId: () => `eval-${++n}`,
    resolveTool: () => tool,
  };
}

const body = (input: unknown, id: string) => ({ input, mode: "live" as const, idempotencyKey: `eval-${id}`.padEnd(16, "0").replace(/[^A-Za-z0-9_-]/g, "-") });

export async function evaluate(): Promise<EvalReport> {
  const tools: ToolReport[] = [];
  for (const suite of SUITES) tools.push(await evaluateTool(suite));
  return {
    reportVersion: 1,
    mode: "fixture",
    notice: FIXTURE_NOTICE,
    rubricVersion: RUBRIC_VERSION,
    models: { fixture: "fixture-heuristic (each tool's deterministic rule-based fixture)", guardrails: `${CANNED_MODEL} (checked-in model responses)` },
    tools,
  };
}

async function evaluateTool(suite: ToolSuite<unknown>): Promise<ToolReport> {
  const entry = toolCatalogue.find((t) => t.slug === suite.slug);
  if (!entry) throw new Error(`${suite.slug} is not in the catalogue`);
  // Evaluate the tool as if it were live-enabled: the gate is what earns that status.
  const tool: ToolDefinition = { ...entry, lifecycle: "beta", indexable: true, liveGeneration: true };
  const adapter = toolAdapters[suite.slug];

  const cases: CaseResult[] = [];
  for (const c of suite.cases) {
    const { envelope } = await executeTool(suite.slug, body(c.input, c.id), toolAdapters, deps(FIXTURE_CONFIG, tool));
    const expected = c.expect.fixtureOutcome;
    if (!envelope.ok) {
      cases.push({ id: c.id, kind: sharedKind(suite, c.kind), expected, outcome: envelope.error.code, passed: envelope.error.code === expected, score: null, exportsValid: null });
      continue;
    }
    const output = envelope.output;
    const valid = adapter.outputSchema.safeParse(output).success;
    const input = adapter.inputSchema.parse(c.input);
    const score = suite.scorer(output, input, c.expect);
    cases.push({
      id: c.id,
      kind: sharedKind(suite, c.kind),
      expected,
      outcome: valid ? "ok" : "schema_violation",
      passed: valid && expected === "ok",
      score,
      exportsValid: exportsValid(suite, output),
    });
  }

  const adversarial: AdversarialResult[] = [];
  for (const a of suite.adversarial) {
    const c = suite.cases.find((x) => x.id === a.caseId);
    if (!c) throw new Error(`${a.id}: unknown case ${a.caseId}`);
    const costs: bigint[] = [];
    const { envelope } = await executeTool(suite.slug, body(c.input, `${a.caseId}-${a.id}`), toolAdapters, deps(CANNED_CONFIG, tool, a.response, costs));
    const outcome = envelope.ok ? (envelope.status === "degraded" ? "degraded" : "clean") : envelope.error.code === "invalid_output" ? "rejected" : "other";
    const score = envelope.ok ? suite.scorer(envelope.output, adapter.inputSchema.parse(c.input), c.expect) : null;
    // Injected fields must never reach the output, whatever else happens.
    const injected = envelope.ok && /"(?:status|coverage|assignee|dueDate|approved|resolved|startAt)"\s*:/.test(JSON.stringify(envelope.output)) ? 1 : 0;
    const surviving = (score?.unsupportedClaims ?? 0) + injected;
    adversarial.push({
      id: a.id,
      caseId: a.caseId,
      failure: a.failure,
      expected: a.expect,
      outcome,
      passed: outcome === a.expect && surviving === 0 && (!envelope.ok || adapter.outputSchema.safeParse(envelope.output).success),
      survivingUnsupportedClaims: surviving,
      survivingFalsePrecision: score?.falsePrecision ?? 0,
      illustrativeCostMicros: costs.length ? costs.reduce((x, y) => x + y, BigInt(0)).toString() : null,
    });
  }

  const scored = cases.filter((c) => c.score);
  const sum = (f: (s: Score) => number) => scored.reduce((acc, c) => acc + f(c.score!), 0);
  const items = sum((s) => s.traceability.items);
  const injection = cases.filter((c) => c.kind === "prompt-injection");
  const injectionGuards = adversarial.filter((a) => a.failure === "injection-followed");
  const domainKeys = [...new Set(scored.flatMap((c) => Object.keys(c.score!.domain)))];
  const kinds = [...new Set(cases.map((c) => c.kind))].sort();

  return {
    slug: suite.slug,
    toolVersion: adapter.version,
    schemaVersion: adapter.schemaVersion,
    promptVersion: adapter.live?.promptVersion ?? null,
    datasetVersion: datasetVersion(suite),
    kindsCovered: kinds,
    missingKinds: REQUIRED_KINDS.filter((k) => !kinds.includes(k)),
    cases,
    adversarial,
    summary: {
      schemaCompliance: rate(cases.filter((c) => c.expected === "ok"), (c) => c.outcome === "ok"),
      outcomeAccuracy: rate(cases, (c) => c.passed),
      traceability: items ? round(sum((s) => s.traceability.traced) / items) : 1,
      unsupportedClaims: sum((s) => s.unsupportedClaims),
      falsePrecision: sum((s) => s.falsePrecision ?? 0),
      injectionResistance: rate([...injection.map((c) => c.passed && (c.score?.unsupportedClaims ?? 0) === 0), ...injectionGuards.map((a) => a.passed)], (x) => x),
      exportCompatibility: rate(cases.filter((c) => c.exportsValid !== null), (c) => c.exportsValid === true),
      guardrailAccuracy: rate(adversarial, (a) => a.passed),
      survivingUnsupportedClaims: adversarial.reduce((acc, a) => acc + a.survivingUnsupportedClaims, 0),
      domain: Object.fromEntries(domainKeys.map((k) => [k, meanOf(scored.map((c) => c.score!.domain[k]))])),
    },
  };
}

function exportsValid(suite: ToolSuite<unknown>, output: unknown): boolean {
  try {
    const rendered = suite.exports(output);
    return rendered.every((r) => {
      if (!r.text) return false;
      if (r.format === "markdown") return r.text.startsWith("# ") && !/<script|javascript:\(/i.test(r.text);
      JSON.parse(r.text);
      return true;
    });
  } catch {
    return false;
  }
}

function rate<T>(items: T[], ok: (item: T) => boolean): number {
  return items.length ? round(items.filter(ok).length / items.length) : 1;
}

function meanOf(values: (number | boolean | null)[]): number | null {
  const nums = values.filter((v): v is number | boolean => v !== null).map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
  return nums.length ? round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Content hash of the dataset and canned responses: any edit changes the version in the report. */
function datasetVersion(suite: ToolSuite<unknown>): string {
  const hash = createHash("sha256").update(JSON.stringify({ cases: suite.cases, adversarial: suite.adversarial })).digest("hex");
  return `sha256:${hash.slice(0, 16)}`;
}
