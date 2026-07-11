/*
 * CLI runner — prints the fixture-mode leaderboard and the regression check.
 * No network, no API keys. Exits 0; the generator is the CI gate.
 */
import { evaluateAll, evaluateRegression, MODEL_IDS } from "./evaluate.mjs";
import { modelById } from "../providers/catalog.mjs";

const pct = (n) => `${Math.round(n * 100)}%`;

const { version, byModel } = evaluateAll();

console.log(`\nAI Evaluation Lab — fixture mode (prompt ${version})\n`);
console.log(
  ["model", "overall", "correct", "ground", "format", "safety", "latency", "$/1k"]
    .map((h) => h.padEnd(9))
    .join(""),
);
for (const id of MODEL_IDS) {
  const m = byModel[id];
  console.log(
    [
      modelById[id].label,
      pct(m.overall),
      pct(m.correctness),
      pct(m.groundedness),
      pct(m.format),
      pct(m.safety),
      `${m.meanLatencyMs}ms`,
      `$${(m.meanCostUsd * 1000).toFixed(3)}`,
    ]
      .map((c) => String(c).padEnd(9))
      .join(""),
  );
}

const reg = evaluateRegression();
const regressed = reg.rows.filter((r) => r.regressed);
console.log(
  `\nRegression check (${reg.modelId} · ${reg.scenario} · v1→v2): ` +
    (regressed.length
      ? `${regressed.length} regressed — ${regressed.map((r) => r.caseId).join(", ")}`
      : "none"),
);
console.log("");
