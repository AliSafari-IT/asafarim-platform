import { scenarioById } from "../fixtures/scenarios.mjs";

/**
 * Build a test title from the seed catalog so the generator can join raw
 * Playwright results back to a scenario by the leading id token ("<id>: ...").
 */
export function title(id: string): string {
  const s = scenarioById[id];
  if (!s) throw new Error(`Unknown scenario id: ${id}`);
  return `${id}: ${s.title}`;
}
