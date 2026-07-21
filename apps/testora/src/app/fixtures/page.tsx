export const dynamic = "force-dynamic";

import { FixtureListView } from "@/components/entities/fixture-list";
import { CollapsibleFixtureForm } from "@/components/forms/collapsible-fixture-form";
import { getTestFixtures, getTestSuites, getTestCases, getLastResultByCase } from "@/lib/queries";
import { getActiveProjectId } from "@/lib/active-project";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";
import { aggregateResults, type LastResult } from "@/lib/run-status";

export default async function FixturesPage() {
  const projectId = await getActiveProjectId();
  const access = await getProjectAccess(projectId);
  if (access.locked) {
    return <LockedApp projectId={projectId} name={access.project?.name ?? projectId} />;
  }
  const [fixtures, suites, cases, lastByCase] = await Promise.all([
    getTestFixtures(projectId),
    getTestSuites(projectId),
    getTestCases(projectId),
    getLastResultByCase(),
  ]);
  const suiteOptions = suites.map((suite) => ({ suiteId: suite.suiteId, title: suite.title }));

  // Roll each fixture's cases' last results into one fixture-level verdict.
  const resultsByFixture = new Map<string, LastResult[]>();
  for (const testCase of cases) {
    const result = lastByCase.get(testCase.caseId);
    if (!result) continue;
    const bucket = resultsByFixture.get(testCase.fixtureId) ?? [];
    bucket.push(result);
    resultsByFixture.set(testCase.fixtureId, bucket);
  }

  const items = fixtures.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    suiteId: fixture.suiteId,
    title: fixture.title,
    baseUrl: fixture.baseUrl,
    commonInput: fixture.commonInput ?? {},
    caseCount: fixture.cases.length,
    suiteTitle: fixture.suite?.title,
    result: aggregateResults(resultsByFixture.get(fixture.fixtureId) ?? []),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Test Fixtures</h1>
        <p className="text-muted-foreground">Reusable environment setups shared by test cases.</p>
      </div>

      <CollapsibleFixtureForm suiteOptions={suiteOptions} />

      <FixtureListView fixtures={items} suiteOptions={suiteOptions} />
    </div>
  );
}
