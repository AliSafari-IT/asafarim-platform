/**
 * Intentionally updates the committed reports. Refuses to write if the gate
 * fails, so a regression can't be "accepted" by regenerating.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { distill } from "../src/distill";
import { evaluate } from "../src/evaluate";
import { REPORT_PATH, serialize, SHOWCASE_REPORT_PATH } from "../src/paths";
import { gateFailures } from "../src/thresholds";

const report = await evaluate();
const failures = gateFailures(report);
if (failures.length) {
  console.error(`Eval gate failed; reports not written:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
for (const [file, value] of [
  [REPORT_PATH, report],
  [SHOWCASE_REPORT_PATH, distill(report)],
] as const) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serialize(value));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
