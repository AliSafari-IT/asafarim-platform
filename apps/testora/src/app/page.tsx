export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getFunctionalRequirements, getTestFixtures, getTestCases, getResultsForReport } from "@/lib/queries";
import { getActiveProjectId } from "@/lib/active-project";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";
import { LatestResultRow } from "@/components/dashboard/latest-result";
import { ListChecks, FlaskConical, PlayCircle, FileBarChart } from "lucide-react";

export default async function DashboardPage() {
  // Scoped to the active app (like every other page) so a locked private app's
  // counts and results never leak onto the dashboard.
  const projectId = await getActiveProjectId();
  const access = await getProjectAccess(projectId);
  if (access.locked) {
    return <LockedApp projectId={projectId} name={access.project?.name ?? projectId} />;
  }
  const [requirements, fixtures, cases, results] = await Promise.all([
    getFunctionalRequirements(projectId),
    getTestFixtures(projectId),
    getTestCases(projectId),
    getResultsForReport(10, projectId),
  ]);

  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed" || r.status === "error").length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of functional requirements, fixtures, and the latest test runs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ListChecks} label="Requirements" value={requirements.length} />
        <StatCard icon={FlaskConical} label="Fixtures" value={fixtures.length} />
        <StatCard icon={PlayCircle} label="Test cases" value={cases.length} />
        <StatCard icon={FileBarChart} label="Recent results" value={results.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest results</CardTitle>
          <CardDescription>
            {results.length === 0
              ? "No test runs yet. Seed the database and run a fixture to see results here."
              : `${passed} passed, ${failed} failed in the last ${results.length} runs.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {results.map((result) => (
            <LatestResultRow
              key={result.id}
              result={{
                id: result.id,
                status: result.status,
                title: result.caseTitle || result.caseId,
                screenshot: result.screenshot,
              }}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-md bg-primary/15 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

