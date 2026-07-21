export const dynamic = "force-dynamic";

import { CaseListView } from "@/components/entities/case-list";
import { CollapsibleCaseForm } from "@/components/forms/collapsible-case-form";
import { getTestCases, getTestFixtures, getLastResultByCase } from "@/lib/queries";
import { getActiveProjectId } from "@/lib/active-project";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";
import { singleResult } from "@/lib/run-status";

export default async function CasesPage() {
  const projectId = await getActiveProjectId();
  const access = await getProjectAccess(projectId);
  if (access.locked) {
    return <LockedApp projectId={projectId} name={access.project?.name ?? projectId} />;
  }
  const [cases, fixtures, lastByCase] = await Promise.all([
    getTestCases(projectId),
    getTestFixtures(projectId),
    getLastResultByCase(),
  ]);
  const fixtureOptions = fixtures.map((fixture) => ({ fixtureId: fixture.fixtureId, title: fixture.title }));

  const items = cases.map((testCase) => ({
    caseId: testCase.caseId,
    fixtureId: testCase.fixtureId,
    title: testCase.title,
    scriptType: testCase.scriptType,
    input: testCase.input,
    runs: testCase.runs,
    expected: testCase.expected,
    script: testCase.script,
    fixtureTitle: testCase.fixture?.title,
    result: singleResult(lastByCase.get(testCase.caseId)),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Test Cases</h1>
        <p className="text-muted-foreground">Single-run, multi-run and scripted scenarios driven by test data.</p>
      </div>

      <CollapsibleCaseForm fixtureOptions={fixtureOptions} />

      <CaseListView cases={items} fixtureOptions={fixtureOptions} />
    </div>
  );
}
