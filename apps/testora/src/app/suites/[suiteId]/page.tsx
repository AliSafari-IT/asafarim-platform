export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FixtureForm } from "@/components/forms/fixture-form";
import { FixtureCard } from "@/components/entities/fixture-card";
import { SuiteCard } from "@/components/entities/suite-card";
import { getTestSuiteById, getFunctionalRequirements, getTestSuites } from "@/lib/queries";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";

export default async function SuiteDetailPage({ params }: { params: Promise<{ suiteId: string }> }) {
  const { suiteId } = await params;
  const suite = await getTestSuiteById(suiteId);
  if (!suite) notFound();
  // Withhold a private app's suite until unlocked (direct-URL guard).
  const projectId = suite.functionalRequirement?.projectId ?? "";
  const access = await getProjectAccess(projectId);
  if (access.locked) {
    return <LockedApp projectId={projectId} name={access.project?.name ?? projectId} />;
  }
  const [requirements, allSuites] = await Promise.all([
    getFunctionalRequirements(projectId),
    getTestSuites(projectId),
  ]);

  const frOptions = requirements.map((fr) => ({ id: fr.id, title: fr.title }));
  const suiteOptions = allSuites.map((s) => ({ suiteId: s.suiteId, title: s.title }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/requirements/${suite.frId}`} className="text-sm text-muted-foreground hover:underline">
          &larr; {suite.functionalRequirement?.title ?? suite.frId}
        </Link>
      </div>

      <SuiteCard
        suite={{
          suiteId: suite.suiteId,
          frId: suite.frId,
          title: suite.title,
          description: suite.description,
          fixtureCount: suite.fixtures.length,
        }}
        frTitle={suite.functionalRequirement?.title}
        frOptions={frOptions}
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a test fixture</CardTitle>
          <CardDescription>Define a reusable environment setup for this suite.</CardDescription>
        </CardHeader>
        <CardContent>
          <FixtureForm defaultSuiteId={suite.suiteId} suiteOptions={suiteOptions} />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Test fixtures</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {suite.fixtures.map((fixture) => (
            <FixtureCard
              key={fixture.fixtureId}
              fixture={{
                fixtureId: fixture.fixtureId,
                suiteId: fixture.suiteId,
                title: fixture.title,
                baseUrl: fixture.baseUrl,
                commonInput: fixture.commonInput ?? {},
                caseCount: fixture.cases.length,
              }}
              suiteTitle={suite.title}
              suiteOptions={suiteOptions}
            />
          ))}
          {suite.fixtures.length === 0 && (
            <p className="text-muted-foreground">No test fixtures yet. Create one above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
