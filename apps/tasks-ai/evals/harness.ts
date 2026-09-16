import { renderPrompt } from "../lib/ai/prompts";
import { redact } from "../lib/ai/redact";
import { guardDraft } from "../lib/ai/guard";
import { getProvider } from "../lib/ai/registry";
import type { Operation } from "../lib/ai/types";
import { EVAL_CASES, type EvalCase } from "./cases";

export interface CaseResult {
  id: string;
  kind: string;
  pass: boolean;
  failures: string[];
  metrics: {
    ops: number;
    groundedRatio: number;
    latencyMs: number;
    costUsd: number;
    consistent: boolean;
  };
}

export interface EvalReport {
  provider: string;
  promptVersions: Record<string, string>;
  total: number;
  passed: number;
  results: CaseResult[];
}

async function runCase(providerName: string, c: EvalCase): Promise<CaseResult> {
  const retrievedIds = c.retrievedIds ? new Set(c.retrievedIds) : undefined;

  // A syntheticDraft case validates guardDraft's grounding safety-net
  // deterministically, independent of any provider — see cases.ts for why.
  if (c.syntheticDraft) {
    const failures: string[] = [];
    let groundedRatio = 1;
    let ops = 0;
    try {
      const g = guardDraft(c.syntheticDraft, 100, { retrievedIds });
      groundedRatio = g.groundedRatio;
      ops = g.operationCount;
    } catch (err) {
      failures.push(`guard rejected: ${err instanceof Error ? err.message : "?"}`);
    }
    if (c.expect.minOps != null && ops < c.expect.minOps) failures.push(`ops ${ops} < min ${c.expect.minOps}`);
    if (c.expect.maxOps != null && ops > c.expect.maxOps) failures.push(`ops ${ops} > max ${c.expect.maxOps}`);
    if (c.expect.minGroundedRatio != null && groundedRatio < c.expect.minGroundedRatio) {
      failures.push(`groundedRatio ${groundedRatio.toFixed(2)} < ${c.expect.minGroundedRatio}`);
    }
    if (c.expect.maxGroundedRatio != null && groundedRatio > c.expect.maxGroundedRatio) {
      failures.push(`groundedRatio ${groundedRatio.toFixed(2)} > ${c.expect.maxGroundedRatio} (a leaked/hallucinated source counted as grounded)`);
    }
    for (const bad of c.expect.forbiddenText ?? []) {
      const hay = JSON.stringify(c.syntheticDraft.operations).toLowerCase();
      if (hay.includes(bad.toLowerCase())) failures.push(`forbidden text leaked: ${bad}`);
    }
    return {
      id: c.id,
      kind: c.kind,
      pass: failures.length === 0,
      failures,
      metrics: { ops, groundedRatio, latencyMs: 0, costUsd: 0, consistent: true },
    };
  }

  const provider = await getProvider(providerName);
  const { text } = redact(c.input);
  const context = c.retrieved?.length ? { retrieved: c.retrieved } : undefined;
  const prompt = renderPrompt({ kind: c.kind, input: text, context }, text);

  const t0 = Date.now();
  const a = await provider.generate({ kind: c.kind, prompt, model: provider.models[0] });
  const latencyMs = Date.now() - t0;
  const b = await provider.generate({ kind: c.kind, prompt, model: provider.models[0] });
  const consistent = JSON.stringify(a.draft) === JSON.stringify(b.draft);

  const failures: string[] = [];
  let groundedRatio = 1;
  try {
    const g = guardDraft(a.draft, 100, { retrievedIds });
    groundedRatio = g.groundedRatio;
  } catch (err) {
    failures.push(`guard rejected: ${err instanceof Error ? err.message : "?"}`);
  }

  const ops = a.draft.operations.length;
  if (c.expect.minOps != null && ops < c.expect.minOps) failures.push(`ops ${ops} < min ${c.expect.minOps}`);
  if (c.expect.maxOps != null && ops > c.expect.maxOps) failures.push(`ops ${ops} > max ${c.expect.maxOps}`);
  if (c.expect.minGroundedRatio != null && groundedRatio < c.expect.minGroundedRatio) {
    failures.push(`groundedRatio ${groundedRatio.toFixed(2)} < ${c.expect.minGroundedRatio}`);
  }
  if (c.expect.maxGroundedRatio != null && groundedRatio > c.expect.maxGroundedRatio) {
    failures.push(`groundedRatio ${groundedRatio.toFixed(2)} > ${c.expect.maxGroundedRatio} (a leaked/hallucinated source counted as grounded)`);
  }
  if (!consistent) failures.push("non-deterministic output for identical input");
  for (const bad of c.expect.forbiddenText ?? []) {
    const hay = JSON.stringify(a.draft.operations).toLowerCase();
    if (hay.includes(bad.toLowerCase())) failures.push(`forbidden text leaked: ${bad}`);
  }
  // No op may reference a disallowed field/verb — schema guarantees this,
  // but assert the op discriminant set as a belt.
  for (const op of a.draft.operations as Operation[]) {
    if (!["create_task", "update_task", "link_tasks"].includes(op.op)) {
      failures.push(`disallowed op type: ${(op as { op: string }).op}`);
    }
  }

  return {
    id: c.id,
    kind: c.kind,
    pass: failures.length === 0,
    failures,
    metrics: { ops, groundedRatio, latencyMs, costUsd: a.costUsd, consistent },
  };
}

export async function runEvals(providerName = "fixture"): Promise<EvalReport> {
  const results: CaseResult[] = [];
  for (const c of EVAL_CASES) results.push(await runCase(providerName, c));
  const promptVersions: Record<string, string> = {};
  for (const c of EVAL_CASES) {
    promptVersions[c.kind] = renderPrompt({ kind: c.kind, input: "x" }, "x").version;
  }
  return {
    provider: providerName,
    promptVersions,
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    results,
  };
}
