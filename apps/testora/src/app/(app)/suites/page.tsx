export const dynamic = "force-dynamic";

import { SuiteListView } from "@/components/entities/suite-list";
import { CollapsibleSuiteForm } from "@/components/forms/collapsible-suite-form";
import {
  getTestSuites,
  getFunctionalRequirements,
  getTestCases,
  getLastResultByCase,
} from "@/lib/queries";
import { getActiveProjectId } from "@/lib/active-project";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";
import { aggregateResults, type LastResult } from "@/lib/run-status";

export default async function SuitesPage() {
  const projectId = await getActiveProjectId();
  const access = await getProjectAccess(projectId);
  if (access.locked) {
    return <LockedApp projectId={projectId} name={access.project?.name ?? projectId} />;
  }
  const [suites, requirements, cases, lastByCase] = await Promise.all([
    getTestSuites(projectId),
    getFunctionalRequirements(projectId),
    getTestCases(projectId),
    getLastResultByCase(),
  ]);
  const frOptions = requirements.map((fr) => ({ id: fr.id, title: fr.title }));

  // Roll each suite's cases (via fixture → suite) into one suite-level verdict.
  const resultsBySuite = new Map<string, LastResult[]>();
  for (const testCase of cases) {
    const result = lastByCase.get(testCase.caseId);
    const suiteId = testCase.fixture?.suiteId;
    if (!result || !suiteId) continue;
    const bucket = resultsBySuite.get(suiteId) ?? [];
    bucket.push(result);
    resultsBySuite.set(suiteId, bucket);
  }

  const items = suites.map((suite) => ({
    suiteId: suite.suiteId,
    frId: suite.frId,
    title: suite.title,
    description: suite.description,
    fixtureCount: suite.fixtures.length,
    frTitle: suite.functionalRequirement?.title,
    result: aggregateResults(resultsBySuite.get(suite.suiteId) ?? []),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Test Suites</h1>
        <p className="text-muted-foreground">Groupings of related flows under each requirement.</p>
      </div>

      <CollapsibleSuiteForm frOptions={frOptions} />

      <SuiteListView suites={items} frOptions={frOptions} />
    </div>
  );
}
