import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../lib/db/client";
import { getConfirmedVersion } from "../../lib/profile/versions";
import { getCurrentWorkspace } from "../../lib/workspace";
import { TailorFlow } from "./TailorFlow";

export const metadata: Metadata = { title: "Tailor your CV" };
export const dynamic = "force-dynamic";

export default async function TailorPage() {
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

  const confirmed = await getConfirmedVersion(workspace.id);

  if (!confirmed) {
    return (
      <>
        <PageHeader
          kicker="Tailor"
          title="Confirm your profile first."
          description="Tailoring rewrites your confirmed profile toward one job. Nothing is tailored from an unreviewed extraction."
        />
        <Alert tone="info">
          <Link href="/profile">Go to your profile</Link> to upload a CV and confirm what was read
          from it.
        </Alert>
      </>
    );
  }

  const db = getJobmatchDb();
  const history = await db.tailoredResume.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      degraded: true,
      targetJob: { select: { title: true, employer: true } },
      coverLetter: { select: { id: true } },
    },
  });

  return (
    <>
      <PageHeader
        kicker="Tailor"
        title="Tailor your CV to a job."
        description="Paste a job posting URL. AI rewords your summary and experience bullets toward it and reorders your skills — it never invents an employer, a date, a degree, or a skill you did not list."
      />

      <section style={{ marginTop: "1.5rem" }}>
        <TailorFlow confirmedVersionId={confirmed.id} />
      </section>

      {history.length > 0 ? (
        <section style={{ marginTop: "2rem" }}>
          <Card title="Previously tailored">
            <ul className="rm-history-list">
              {history.map((resume) => (
                <li key={resume.id} className="rm-history-item">
                  <Link href={`/tailor/${resume.id}/preview`} className="rm-history-item__link">
                    {resume.targetJob.title ?? "Tailored CV"}
                    {resume.targetJob.employer ? ` · ${resume.targetJob.employer}` : ""}
                  </Link>
                  <span className="rm-history-item__meta">
                    <span className="jm-mono">{resume.createdAt.toISOString().slice(0, 10)}</span>
                    {resume.coverLetter ? <span className="rm-badge rm-badge--neutral">+ Cover letter</span> : null}
                    {resume.degraded ? <span className="rm-badge rm-badge--warning">Degraded</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <div className="rm-history-footer">
              <Link href="/tailor/history">View full history & compare versions →</Link>
            </div>
          </Card>
        </section>
      ) : null}
    </>
  );
}
