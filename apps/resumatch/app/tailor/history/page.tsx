import type { Metadata } from "next";
import Link from "next/link";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../lib/db/client";
import { getJourneyCounts, jobKey } from "../../../lib/journey";
import { getCurrentWorkspace } from "../../../lib/workspace";
import { BarList } from "../../components/app/Charts";
import { JourneyTracker } from "../../components/app/JourneyTracker";
import { PageHero } from "../../components/app/PageHero";
import { StatRow, StatTile } from "../../components/app/Stats";
import { BriefcaseIcon, MailIcon, SparkIcon, WarningIcon } from "../../profile/icons";
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
  const [resumes, journey] = await Promise.all([
    db.tailoredResume.findMany({
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
        targetJob: { select: { id: true, title: true, employer: true, sourceUrl: true } },
        coverLetter: { select: { id: true } },
      },
    }),
    getJourneyCounts(workspace.id),
  ]);

  // Most-tailored jobs: versions per distinct job (see jobKey), top six.
  const perJob = new Map<string, { label: string; hint?: string; count: number }>();
  for (const r of resumes) {
    const key = jobKey(r.targetJob);
    const entry = perJob.get(key) ?? {
      label: r.targetJob.title ?? r.targetJob.employer ?? "Untitled job",
      hint: r.targetJob.title && r.targetJob.employer ? r.targetJob.employer : undefined,
      count: 0,
    };
    entry.count += 1;
    perJob.set(key, entry);
  }
  const topJobs = [...perJob.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  const withCoverLetter = resumes.filter((r) => r.coverLetter).length;
  const degraded = resumes.filter((r) => r.degraded).length;

  return (
    <div className="rx">
      <PageHero
        kicker="Tailor · History"
        title="Every version,"
        accent="side by side."
        lead="Everything you've generated, newest first. Pick any two to compare what changed between them."
        aside={<JourneyTracker counts={journey} current="tailor" />}
      />

      {resumes.length === 0 ? (
        <section className="rx-panel rx-panel--warm">
          <h2 className="rx-panel__title">Nothing here yet</h2>
          <p className="rx-panel__sub">Tailor a CV toward a job and every version will show up here.</p>
          <Link href="/tailor" className="rx-btn rx-btn--primary">
            Tailor a CV →
          </Link>
        </section>
      ) : (
        <>
          <StatRow label="History at a glance">
            <StatTile value={resumes.length} label="versions" visual={<SparkIcon />} />
            <StatTile value={perJob.size} label="different jobs" visual={<BriefcaseIcon />} />
            <StatTile value={withCoverLetter} label="with a cover letter" visual={<MailIcon />} tone="ok" />
            <StatTile
              value={degraded}
              label="degraded runs"
              hint="Made by the fallback, without a real AI call"
              visual={<WarningIcon />}
              tone={degraded > 0 ? "warm" : "muted"}
            />
          </StatRow>

          {topJobs.length > 1 ? (
            <section className="rx-panel">
              <h2 className="rx-panel__title">Most-tailored jobs</h2>
              <p className="rx-panel__sub">Versions generated per job — the ones you iterated on most.</p>
              <BarList items={topJobs} label="Versions per job" />
            </section>
          ) : null}

          <HistoryList resumes={resumes} />
        </>
      )}
    </div>
  );
}
