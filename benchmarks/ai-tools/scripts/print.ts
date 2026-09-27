/** Prints the fixture report as a table, plus local fixture latency (never committed, never telemetry). */
import { performance } from "node:perf_hooks";
import { evaluate } from "../src/evaluate";
import { gateFailures } from "../src/thresholds";

const started = performance.now();
const report = await evaluate();
const elapsed = performance.now() - started;

console.log(`\nAI Workbench eval — ${report.mode.toUpperCase()} MODE (${report.rubricVersion})\n${report.notice}\n`);
for (const t of report.tools) {
  const s = t.summary;
  console.log(`${t.slug}  tool ${t.toolVersion} · schema ${t.schemaVersion} · prompt ${t.promptVersion ?? "none"} · dataset ${t.datasetVersion}`);
  console.table({
    "schema compliance": s.schemaCompliance,
    "outcome accuracy": s.outcomeAccuracy,
    traceability: s.traceability,
    "unsupported claims": s.unsupportedClaims,
    "false precision": s.falsePrecision,
    "injection resistance": s.injectionResistance,
    "export compatibility": s.exportCompatibility,
    "guardrail accuracy": s.guardrailAccuracy,
    "surviving unsupported claims": s.survivingUnsupportedClaims,
    ...Object.fromEntries(Object.entries(s.domain).map(([k, v]) => [`domain: ${k}`, v])),
  });
}
const failures = gateFailures(report);
console.log(failures.length ? `GATE FAILED:\n- ${failures.join("\n- ")}` : "Gate: all thresholds met.");
console.log(`Local fixture run took ${elapsed.toFixed(0)} ms (this machine, fixture mode; not production latency).`);
process.exit(failures.length ? 1 : 0);
