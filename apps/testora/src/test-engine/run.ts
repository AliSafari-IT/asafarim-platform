import { writeFile } from "node:fs/promises";
import { db } from "@/db/client";
import { testSuites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { executeFixture, loadFixtureWithCases } from "@/test-engine/executors/testExecutor";
import { toJsonReport, toHtmlReport } from "@/test-engine/formatters/resultFormatter";

async function main() {
  const fixtureId = process.argv[2];
  if (!fixtureId) {
    console.error("Usage: pnpm test:e2e <fixtureId>");
    process.exit(1);
  }

  const loaded = await loadFixtureWithCases(fixtureId);
  if (!loaded) {
    console.error(`Fixture "${fixtureId}" not found.`);
    process.exit(1);
  }

  const { fixture, cases } = loaded;
  const suite = await db.query.testSuites.findFirst({ where: eq(testSuites.suiteId, fixture.suiteId) });

  const results = await executeFixture(fixture, cases);
  const reports = toJsonReport(suite?.title ?? fixture.suiteId, fixture, cases, results);

  await writeFile("test-results.json", JSON.stringify(reports, null, 2), "utf8");
  await writeFile("test-results.html", toHtmlReport(reports), "utf8");

  console.log(`Wrote ${reports.length} result(s) to test-results.json and test-results.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
