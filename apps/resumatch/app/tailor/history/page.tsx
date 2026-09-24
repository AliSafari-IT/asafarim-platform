import type { Metadata } from "next";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../lib/db/client";
import { getCurrentWorkspace } from "../../../lib/workspace";
import { HistoryList } from "./HistoryList";

export const metadata: Metadata = { title: "Tailoring history" };
export const dynamic = "force-dynamic";

/**
 * List view for issue #434: every `TailoredResume` row for the workspace,
 * newest first, with the target job, `templateKey`, `degraded` flag, and
 * prompt/model provenance. All the data already exists (see
 * generate-confirm's write) — this is read-only UI plus a picker for the
 * compare page.
 */
export default async function TailoringHistoryPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker="Tailor" title="This account cannot open a workspace." />
        <Alert tone="warning">
          <strong>Account inactive.</strong> Your platform account is not active, so ResuMatch will
          not open a workspace for it.
        </Alert>
      </>
    );
  }

  const db = getJobmatchDb();
  const resumes = await db.tailoredResume.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      templateKey: true,
      degraded: true,
      promptVersion: true,
      modelVersion: true,
      profileVersionId: true,
      targetJobId: true,
      targetJob: { select: { title: true, employer: true, sourceUrl: true } },
      coverLetter: { select: { id: true } },
    },
  });

  return (
    <>
      <PageHeader
        kicker="Tailor"
        title="Tailoring history"
        description="Every version you've generated, newest first. Pick two to compare them side by side."
      />

      {resumes.length === 0 ? (
        <Alert tone="info">Nothing here yet — tailor a CV toward a job to see its history.</Alert>
      ) : (
        <HistoryList resumes={resumes} />
      )}
    </>
  );
}
