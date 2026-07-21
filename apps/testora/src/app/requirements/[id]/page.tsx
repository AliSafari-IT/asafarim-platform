export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SuiteForm } from "@/components/forms/suite-form";
import { SuiteCard } from "@/components/entities/suite-card";
import { RequirementCard } from "@/components/entities/requirement-card";
import { getFunctionalRequirementById, getFunctionalRequirements } from "@/lib/queries";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";

export default async function RequirementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fr = await getFunctionalRequirementById(id);
  if (!fr) notFound();
  // Withhold a private app's requirement until unlocked (direct-URL guard).
  const access = await getProjectAccess(fr.projectId);
  if (access.locked) {
    return <LockedApp projectId={fr.projectId} name={access.project?.name ?? fr.projectId} />;
  }
  const allRequirements = await getFunctionalRequirements(fr.projectId);

  const frOptions = allRequirements.map((item) => ({ id: item.id, title: item.title }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/requirements" className="text-sm text-muted-foreground hover:underline">
          &larr; Requirements
        </Link>
      </div>

      <RequirementCard
        fr={{ id: fr.id, title: fr.title, description: fr.description, suiteCount: fr.suites.length, baseUrl: fr.baseUrl }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a test suite</CardTitle>
          <CardDescription>Group related flows under this requirement.</CardDescription>
        </CardHeader>
        <CardContent>
          <SuiteForm defaultFrId={fr.id} frOptions={frOptions} />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Test suites</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {fr.suites.map((suite) => (
            <SuiteCard
              key={suite.suiteId}
              suite={{
                suiteId: suite.suiteId,
                frId: suite.frId,
                title: suite.title,
                description: suite.description,
                fixtureCount: suite.fixtures.length,
              }}
              frTitle={fr.title}
              frOptions={frOptions}
            />
          ))}
          {fr.suites.length === 0 && (
            <p className="text-muted-foreground">No test suites yet. Create one above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
