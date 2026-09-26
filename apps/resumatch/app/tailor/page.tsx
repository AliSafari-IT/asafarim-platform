import type { Metadata } from "next";
import Link from "next/link";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../lib/db/client";
import { getJourneyCounts, jobKey } from "../../lib/journey";
import { getConfirmedVersion } from "../../lib/profile/versions";
import { getCurrentWorkspace } from "../../lib/workspace";
import { ActivityBars, lastNDays } from "../components/app/Charts";
import { JourneyTracker } from "../components/app/JourneyTracker";
import { PageHero } from "../components/app/PageHero";
import { StatRow, StatTile } from "../components/app/Stats";
import { BriefcaseIcon, MailIcon, SparkIcon, WarningIcon } from "../profile/icons";
import { TailorFlow } from "./TailorFlow";
import { LanguageBadge } from "../components/app/LanguageBadge";

export const metadata: Metadata = { title: "Tailor your CV" };
export const dynamic = "force-dynamic";

const ACTIVITY_DAYS = 14;

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

  const [confirmed, journey] = await Promise.all([
    getConfirmedVersion(workspace.id),
    getJourneyCounts(workspace.id),
  ]);

  if (!confirmed) {
    return (
      <div className="rx">
        <PageHero
          kicker="Tailor"
          title="Confirm your profile"
          accent="first."
          lead="Tailoring rewrites your confirmed profile toward one job. Nothing is tailored from an unreviewed extraction."
          aside={<JourneyTracker counts={journey} current="tailor" />}
        />
        <section className="rx-panel rx-panel--warm">
          <h2 className="rx-panel__title">One step before tailoring</h2>
          <p className="rx-panel__sub">
            Upload a CV (or type your profile in), check what was read, and confirm it.
          </p>
          <Link href="/profile" className="rx-btn rx-btn--primary">
            Go to your profile →
          </Link>
        </section>
      </div>
    );
  }

  const db = getJobmatchDb();
  const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000);
  const [history, coverLetters, degraded, jobs, recent] = await Promise.all([
    db.tailoredResume.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 9,
      select: {
        id: true,
        createdAt: true,
        degraded: true,
        templateKey: true,
        outputLanguage: true,
        targetJob: { select: { title: true, employer: true } },
        coverLetter: { select: { id: true, outputLanguage: true } },
      },
    }),
    db.tailoredResume.count({ where: { workspaceId: workspace.id, coverLetter: { isNot: null } } }),
    db.tailoredResume.count({ where: { workspaceId: workspace.id, degraded: true } }),
    db.tailoredResume.findMany({
      where: { workspaceId: workspace.id },
      select: { targetJob: { select: { id: true, title: true, employer: true } } },
    }),
    db.tailoredResume.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);
  const activity = lastNDays(
    recent.map((r) => r.createdAt),
    ACTIVITY_DAYS,
  );
  const lastTwoWeeks = activity.reduce((sum, d) => sum + d.count, 0);
  const distinctJobs = new Set(jobs.map((r) => jobKey(r.targetJob))).size;

  return (
    <div className="rx">
      <PageHero
        kicker="Tailor"
        title="Tailor your CV"
        accent="to one job."
        lead="Point ResuMatch at a job. AI rewords your summary and experience bullets toward it and reorders your skills — it never invents an employer, a date, a degree, or a skill you did not list."
        aside={<JourneyTracker counts={journey} current="tailor" />}
      />

      <section className="rx-flow" aria-label="Tailor a new CV">
        <TailorFlow confirmedVersionId={confirmed.id} />
      </section>

      {journey.tailoredCount > 0 ? (
        <>
          <StatRow label="Your tailoring at a glance">
            <StatTile value={journey.tailoredCount} label="tailored CVs" visual={<SparkIcon />} />
            <StatTile value={distinctJobs} label="different jobs" visual={<BriefcaseIcon />} />
            <StatTile
              value={coverLetters}
              label="with a cover letter"
              visual={<MailIcon />}
              tone="ok"
            />
            <StatTile
              value={degraded}
              label="degraded runs"
              hint="Made by the fallback, without a real AI call"
              visual={<WarningIcon />}
              tone={degraded > 0 ? "warm" : "muted"}
            />
          </StatRow>

          <section className="rx-panel">
            <div className="rx-panel__head">
              <div>
                <h2 className="rx-panel__title">Last {ACTIVITY_DAYS} days</h2>
                <p className="rx-panel__sub">
                  {lastTwoWeeks} tailored CV{lastTwoWeeks === 1 ? "" : "s"} — hover a bar for the day.
                </p>
              </div>
            </div>
            <ActivityBars days={activity} label="Tailored CVs per day" />
          </section>

          <section className="rx-panel" aria-labelledby="rx-recent-title">
            <div className="rx-panel__head">
              <h2 id="rx-recent-title" className="rx-panel__title">
                Previously tailored
              </h2>
              <Link href="/tailor/history" className="rx-link">
                Full history & compare →
              </Link>
            </div>
            <ul className="rx-cards">
              {history.map((resume) => (
                <li key={resume.id}>
                  <Link href={`/tailor/${resume.id}/preview`} className="rx-card">
                    <span className="rx-card__title">{resume.targetJob.title ?? "Tailored CV"}</span>
                    {resume.targetJob.employer ? (
                      <span className="rx-card__sub">{resume.targetJob.employer}</span>
                    ) : null}
                    <span className="rx-card__meta">
                      <span className="jm-mono">{resume.createdAt.toISOString().slice(0, 10)}</span>
                      <span className="rx-pill">{resume.templateKey}</span>
                      <LanguageBadge language={resume.outputLanguage} />
                      {resume.coverLetter ? <span className="rx-pill rx-pill--ok">+ Cover letter</span> : null}
                      <LanguageBadge language={resume.coverLetter?.outputLanguage} subject="Cover letter" />
                      {resume.degraded ? <span className="rx-pill rx-pill--warm">Degraded</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
