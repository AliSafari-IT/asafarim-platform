import "./load-env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { testSuites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { executeFixture, loadFixtureWithCases } from "@/test-engine/executors/testExecutor";
import { toJsonReport, toHtmlReport } from "@/test-engine/formatters/resultFormatter";

async function main() {
  const [fixtureId, targetOrigin] = process.argv.slice(2);
  if (!fixtureId) {
    console.error("Usage: pnpm test:e2e <fixtureId> [targetOrigin]");
    process.exit(1);
  }

  const loaded = await loadFixtureWithCases(fixtureId);
  if (!loaded) {
    console.error(`Fixture "${fixtureId}" not found.`);
    process.exit(1);
  }

  const { cases } = loaded;
  let { fixture } = loaded;
  // Optional origin override (e.g. http://localhost:3004) so a fixture whose
  // requirement points at production can be run against a local target
  // without editing the stored baseUrl.
  if (targetOrigin && fixture.baseUrl) {
    const target = new URL(targetOrigin);
    const url = new URL(fixture.baseUrl);
    url.protocol = target.protocol;
    url.host = target.host;
    fixture = { ...fixture, baseUrl: url.toString() };
  }
  const suite = await db.query.testSuites.findFirst({ where: eq(testSuites.suiteId, fixture.suiteId) });

  const results = await executeFixture(fixture, cases);
  const reports = toJsonReport(suite?.title ?? fixture.suiteId, fixture, cases, results);

  // test-results/ is git-ignored, so CLI runs never leave report files to commit.
  const outDir = path.resolve("test-results");
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "test-results.json");
  const htmlPath = path.join(outDir, "test-results.html");
  await writeFile(jsonPath, JSON.stringify(reports, null, 2), "utf8");
  await writeFile(htmlPath, toHtmlReport(reports), "utf8");

  console.log(`Wrote ${reports.length} result(s) to ${jsonPath} and ${htmlPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
