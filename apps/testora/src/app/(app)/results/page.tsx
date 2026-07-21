export const dynamic = "force-dynamic";

import { getResultsForReport } from "@/lib/queries";
import { getActiveProjectId } from "@/lib/active-project";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";
import { ResultsExplorer } from "@/components/results/results-explorer";

export default async function ResultsPage() {
  const projectId = await getActiveProjectId();
  const access = await getProjectAccess(projectId);
  if (access.locked) {
    return <LockedApp projectId={projectId} name={access.project?.name ?? projectId} />;
  }
  const rows = await getResultsForReport(1000, projectId);
  return <ResultsExplorer rows={rows} />;
}
