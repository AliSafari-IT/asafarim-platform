import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../../../../lib/db/client";
import { parseTailoredResumeContent } from "../../../../../../lib/tailoring/ai/schema";
import { diffTailoredResumes } from "../../../../../../lib/tailoring/diff";
import { getCurrentWorkspace } from "../../../../../../lib/workspace";

export const metadata: Metadata = { title: "Compare tailored resumes" };
export const dynamic = "force-dynamic";

/**
 * Side-by-side / field-level comparison of two `TailoredResume` versions
 * (issue #434). Read-only, derived at render from
 * lib/tailoring/diff.ts — nothing here is persisted, the same "describes
 * the documents, never becomes part of them" boundary the coverage report
 * (#428) and quality checklist (#433) already follow.
 */
export default async function CompareTailoredResumesPage({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a: idA, b: idB } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  const db = getJobmatchDb();
  // Both scoped to the workspace, same as every other tailored-resume
  // read — an id from the URL cannot reach another candidate's version.
  const [rowA, rowB] = await Promise.all([
    db.tailoredResume.findFirst({
      where: { id: idA, workspaceId: workspace.id },
      select: { content: true, createdAt: true, targetJob: { select: { title: true, employer: true } } },
    }),
    db.tailoredResume.findFirst({
      where: { id: idB, workspaceId: workspace.id },
      select: { content: true, createdAt: true, targetJob: { select: { title: true, employer: true } } },
    }),
  ]);
  if (!rowA || !rowB) notFound();

  const contentA = parseTailoredResumeContent(rowA.content);
  const contentB = parseTailoredResumeContent(rowB.content);
  const diff = diffTailoredResumes(contentA, contentB);

  return (
    <>
      <PageHeader kicker="Tailor" title="Compare tailored resumes" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Card title={rowA.targetJob.title ?? rowA.targetJob.employer ?? "Version A"}>
          <p style={{ opacity: 0.6, fontSize: "0.8rem" }}>{new Date(rowA.createdAt).toLocaleString()}</p>
        </Card>
        <Card title={rowB.targetJob.title ?? rowB.targetJob.employer ?? "Version B"}>
          <p style={{ opacity: 0.6, fontSize: "0.8rem" }}>{new Date(rowB.createdAt).toLocaleString()}</p>
        </Card>
      </div>

      <Card title="Headline">
        {diff.headlineChanged ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <p>{contentA.headline ?? <em>(none)</em>}</p>
            <p>{contentB.headline ?? <em>(none)</em>}</p>
          </div>
        ) : (
          <p style={{ opacity: 0.7 }}>Unchanged: {contentA.headline ?? <em>(none)</em>}</p>
        )}
      </Card>

      <Card title="Summary">
        {diff.summaryChanged ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <p>{contentA.summary ?? <em>(none)</em>}</p>
            <p>{contentB.summary ?? <em>(none)</em>}</p>
          </div>
        ) : (
          <p style={{ opacity: 0.7 }}>Unchanged: {contentA.summary ?? <em>(none)</em>}</p>
        )}
      </Card>

      <Card title="Skills">
        {diff.skills.added.length === 0 && diff.skills.removed.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No change ({diff.skills.common.length} skills, unchanged).</p>
        ) : (
          <>
            {diff.skills.added.length > 0 ? (
              <p>
                <strong>Added:</strong> {diff.skills.added.join(", ")}
              </p>
            ) : null}
            {diff.skills.removed.length > 0 ? (
              <p>
                <strong>Removed:</strong> {diff.skills.removed.join(", ")}
              </p>
            ) : null}
          </>
        )}
      </Card>

      {diff.experience.length > 0 ? (
        <Card title="Experience bullets">
          {diff.experience.map((entry, index) => (
            <div key={index} style={{ marginTop: index > 0 ? "1rem" : 0 }}>
              <strong>
                {entry.title}
                {entry.employer ? ` · ${entry.employer}` : ""}
              </strong>
              {entry.changed ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.35rem" }}>
                  <ul>
                    {entry.bulletsA.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                  <ul>
                    {entry.bulletsB.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ opacity: 0.6, fontSize: "0.85rem", margin: "0.3rem 0 0" }}>Unchanged.</p>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <Alert tone="info">Neither version has experience entries to compare.</Alert>
      )}
    </>
  );
}
