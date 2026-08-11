#!/usr/bin/env node
/**
 * Turns treosh/lighthouse-ci-action's output (.lighthouseci/manifest.json +
 * per-run Lighthouse JSON reports) into the small public summary this repo
 * commits at apps/showcase/public-data/lighthouse-status.json.
 *
 * Only allow-listed fields make it into the committed file: URL, category
 * scores (accessibility/performance), and a timestamp. No raw Lighthouse
 * report content (which can include page screenshots, resource URLs, etc.)
 * is committed — see apps/showcase/app/proof/data.ts's no-secrets rule.
 *
 * Used by .github/workflows/lighthouse.yml. Requires the action to have run
 * with `resultsPath` default (.lighthouseci/).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const manifestPath = path.resolve(".lighthouseci/manifest.json");
const outPath = path.resolve("apps/showcase/public-data/lighthouse-status.json");

function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const measuredAt = new Date().toISOString();

  // One entry per URL — the manifest may include multiple runs per URL
  // (numberOfRuns), representative one is flagged isRepresentativeRun.
  const byUrl = new Map();
  for (const entry of manifest) {
    if (!entry.isRepresentativeRun) continue;
    const report = JSON.parse(readFileSync(entry.jsonPath, "utf8"));
    byUrl.set(entry.url, {
      url: entry.url,
      accessibility: Math.round((report.categories.accessibility?.score ?? 0) * 100),
      performance: Math.round((report.categories.performance?.score ?? 0) * 100),
    });
  }

  const summary = {
    measuredAt,
    method: "Lighthouse CI (treosh/lighthouse-ci-action) against the deployed showcase, on a schedule.",
    results: Array.from(byUrl.values()),
  };

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

main();
