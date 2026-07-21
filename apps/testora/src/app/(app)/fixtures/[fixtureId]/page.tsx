export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CaseForm } from "@/components/forms/case-form";
import { FixtureCard } from "@/components/entities/fixture-card";
import { CaseCard } from "@/components/entities/case-card";
import { getTestFixtureById, getTestSuites, getTestFixtures } from "@/lib/queries";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";

export default async function FixtureDetailPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const fixture = await getTestFixtureById(fixtureId);
  if (!fixture) notFound();
  // Withhold a private app's fixture until unlocked (direct-URL guard).
  const projectId = fixture.suite?.functionalRequirement?.projectId ?? "";
  const access = await getProjectAccess(projectId);
  if (access.locked) {
    return <LockedApp projectId={projectId} name={access.project?.name ?? projectId} />;
  }
  const [suites, allFixtures] = await Promise.all([
    getTestSuites(projectId),
    getTestFixtures(projectId),
  ]);

  const suiteOptions = suites.map((suite) => ({ suiteId: suite.suiteId, title: suite.title }));
  const fixtureOptions = allFixtures.map((f) => ({ fixtureId: f.fixtureId, title: f.title }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/suites/${fixture.suiteId}`} className="text-sm text-muted-foreground hover:underline">
          &larr; {fixture.suite?.title ?? fixture.suiteId}
        </Link>
      </div>

      <FixtureCard
        fixture={{
          fixtureId: fixture.fixtureId,
          suiteId: fixture.suiteId,
          title: fixture.title,
          baseUrl: fixture.baseUrl,
          commonInput: fixture.commonInput ?? {},
          caseCount: fixture.cases.length,
        }}
        suiteTitle={fixture.suite?.title}
        suiteOptions={suiteOptions}
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a test case</CardTitle>
          <CardDescription>
            Single-run or multi-run JSON test data, or a scripted case carrying raw TestCafe code
            for multi-step flows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CaseForm defaultFixtureId={fixture.fixtureId} fixtureOptions={fixtureOptions} />
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Test cases</h2>
          <Button asChild size="sm" variant="outline">
            <Link href={`/run?fixtureId=${fixture.fixtureId}`}>Run this fixture</Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {fixture.cases.map((testCase) => (
            <CaseCard
              key={testCase.caseId}
              testCase={{
                caseId: testCase.caseId,
                fixtureId: testCase.fixtureId,
                title: testCase.title,
                scriptType: testCase.scriptType,
                input: testCase.input,
                runs: testCase.runs,
                expected: testCase.expected,
                script: testCase.script,
              }}
              fixtureTitle={fixture.title}
              fixtureOptions={fixtureOptions}
            />
          ))}
          {fixture.cases.length === 0 && (
            <p className="text-muted-foreground">No test cases yet. Create one above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
