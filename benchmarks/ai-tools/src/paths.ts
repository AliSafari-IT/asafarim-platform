import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPORT_PATH = path.resolve(here, "../reports/fixture-report.json");
/** Read by the Showcase AI Workbench project page (#683). */
export const SHOWCASE_REPORT_PATH = path.resolve(here, "../../../apps/showcase/app/projects/ai-workbench/_data/eval-report.json");

export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
