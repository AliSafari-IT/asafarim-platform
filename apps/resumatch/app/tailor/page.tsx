import type { Metadata } from "next";
import Link from "next/link";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../lib/db/client";
import { getTranslator } from "../../lib/i18n-server";
import { getJourneyCounts, jobKey } from "../../lib/journey";
import { getConfirmedVersion } from "../../lib/profile/versions";
import { getCurrentWorkspace } from "../../lib/workspace";
import { busiestDay, lastNDays } from "../components/app/Charts";
import { ActivitySeriesChart } from "../components/app/ActivitySeriesChart";
import { activityFunnelLine, answeredAppliedCount, buildActivitySeries, responseDates } from "../../lib/activity/dailySeries";
import { JourneyTracker } from "../components/app/JourneyTracker";
import { PageHero } from "../components/app/PageHero";
import { StatRow, StatTile } from "../components/app/Stats";
import { BriefcaseIcon, MailIcon, SparkIcon, WarningIcon } from "../profile/icons";
import { TailorFlow } from "./TailorFlow";
import { LanguageBadge } from "../components/app/LanguageBadge";
import { buildRegenerateSeed, type RegenerateSeed } from "../../lib/tailoring/regenerate";
import { buildSavedReviewSeed, type SavedReviewSeed } from "../../lib/tailoring/editSaved";
import { parseTailoredResumeContent } from "../../lib/tailoring/ai/schema";
import { parseCoverLetterContent } from "../../lib/tailoring/ai/coverLetter/schema";
import { logError } from "../../lib/observability/logger";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.tailor.metaTitle") };
}
export const dynamic = "force-dynamic";

const ACTIVITY_DAYS = 14;

export default async function TailorPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; letter?: string; edit?: string }>;
}) {
  const { from, letter, edit } = await searchParams;
  const { t } = await getTranslator();
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker={t("resumatch.inactive.kicker")} title={t("resumatch.inactive.title")} />
        <Alert tone="warning">
          <strong>{t("resumatch.inactive.strong")}</strong> {t("resumatch.inactive.body")}
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
          kicker={t("resumatch.tailor.kicker")}
          title={t("resumatch.tailor.confirmFirst.title")}
          accent={t("resumatch.tailor.confirmFirst.accent")}
          lead={t("resumatch.tailor.confirmFirst.lead")}
          aside={<JourneyTracker counts={journey} current="tailor" />}
        />
        <section className="rx-panel rx-panel--warm">
          <h2 className="rx-panel__title">{t("resumatch.tailor.confirmFirst.panelTitle")}</h2>
          <p className="rx-panel__sub">{t("resumatch.tailor.confirmFirst.panelBody")}</p>
          <Link href="/profile" className="rx-btn rx-btn--primary">
            {t("resumatch.tailor.confirmFirst.cta")}
          </Link>
        </section>
      </div>
    );
  }

  const db = getJobmatchDb();
  // "Regenerate" from a saved CV or letter: reopen the flow on the
  // same job with the same choices. Workspace-scoped, so an id in the URL
  // cannot reach another candidate's CV; an unknown id just opens the
  // normal empty flow.
  let seed: RegenerateSeed | null = null;
  if (typeof from === "string" && from) {
    const source = await db.tailoredResume.findFirst({
      where: { id: from, workspaceId: workspace.id },
      select: {
        id: true,
        instructions: true,
        outputLanguage: true,
        candidateEdits: true,
        tailoringContext: true,
        targetJob: { select: { id: true, title: true, employer: true, rawText: true } },
        coverLetter: { select: { outputLanguage: true } },
      },
    });
    if (source) seed = buildRegenerateSeed(source, letter === "1");
  }
  // "Edit" on a saved CV: reopen its review exactly as it was saved, with
  // no AI call (lib/tailoring/editSaved.ts). Workspace-scoped like `from`;
  // an unknown or unreadable id opens the normal empty flow.
  let editSeed: SavedReviewSeed | null = null;
  if (typeof edit === "string" && edit) {
    const source = await db.tailoredResume.findFirst({
      where: { id: edit, workspaceId: workspace.id },
      select: {
        id: true,
        instructions: true,
        outputLanguage: true,
        content: true,
        candidateEdits: true,
        profileVersion: { select: { content: true } },
        targetJob: { select: { id: true, title: true, employer: true, rawText: true } },
        coverLetter: { select: { id: true, outputLanguage: true, content: true } },
      },
    });
    if (source) {
      try {
        editSeed = buildSavedReviewSeed({
          ...source,
          content: parseTailoredResumeContent(source.content),
          profileContent: (source.profileVersion.content ?? {}) as Parameters<typeof buildSavedReviewSeed>[0]["profileContent"],
          coverLetter: source.coverLetter
            ? { ...source.coverLetter, content: parseCoverLetterContent(source.coverLetter.content) }
            : null,
        });
      } catch (error) {
        logError("tailoring.edit.seed_failed", error, { tailoringId: source.id });
      }
    }
  }
  const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000);
  const [history, coverLetters, degraded, jobs, recent, recentLetters, recentApplied, recentStatusChanges] = await Promise.all([
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
      select: { createdAt: true, degraded: true },
    }),
    db.coverLetter.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    db.application.findMany({
      where: { workspaceId: workspace.id, appliedAt: { gte: since } },
      select: { id: true, appliedAt: true },
    }),
    // Responses: the application row has no "answered on" date, so the
    // status-change audit log is the record of when it happened (#943).
    db.auditEvent.findMany({
      where: { workspaceId: workspace.id, action: "application.status_changed", createdAt: { gte: since } },
      select: { createdAt: true, metadata: true },
    }),
  ]);
  const now = new Date();
  const activity = lastNDays(
    recent.map((r) => r.createdAt),
    ACTIVITY_DAYS,
    now,
  );
  const windowStart = `${activity[0]?.day ?? ""}T00:00:00.000Z`;
  const recentDegraded = recent.filter((r) => r.degraded && r.createdAt.toISOString() >= windowStart).length;
  const chart = buildActivitySeries(
    {
      tailored: recent.map((r) => r.createdAt),
      coverLetters: recentLetters.map((r) => r.createdAt),
      applied: recentApplied.flatMap((r) => (r.appliedAt ? [r.appliedAt] : [])),
      responses: responseDates(recentStatusChanges),
    },
    {
      tailored: t("resumatch.tailor.activity.series.tailored"),
      coverLetters: t("resumatch.tailor.activity.series.coverLetters"),
      applied: t("resumatch.tailor.activity.series.applied"),
      responses: t("resumatch.tailor.activity.series.responses"),
    },
    ACTIVITY_DAYS,
    now,
  );
  const totals = Object.fromEntries(chart.series.map((s) => [s.key, s.total])) as Record<
    (typeof chart.series)[number]["key"],
    number
  >;
  const distinctJobs = new Set(jobs.map((r) => jobKey(r.targetJob))).size;
  const busiest = busiestDay(activity);
  const activitySummary = [
    t("resumatch.tailor.activity.ariaSeries", {
      days: ACTIVITY_DAYS,
      list: chart.series.map((s) => `${s.label} ${s.total}`).join(", "),
    }),
    busiest ? t("resumatch.tailor.activity.busiest", { day: busiest.day, count: busiest.count }) : null,
  ]
    .filter(Boolean)
    .join(" ");
  const appliedInWindow = recentApplied.filter((r) => r.appliedAt && r.appliedAt.toISOString() >= windowStart);
  const answeredApplied = answeredAppliedCount(
    appliedInWindow.map((r) => r.id),
    recentStatusChanges.filter((e) => e.createdAt.toISOString() >= windowStart),
  );
  const funnel = activityFunnelLine(t, totals, recentDegraded, answeredApplied);

  return (
    <div className="rx">
      <PageHero
        kicker={t("resumatch.tailor.kicker")}
        title={t("resumatch.tailor.hero.title")}
        accent={t("resumatch.tailor.hero.accent")}
        lead={t("resumatch.tailor.hero.lead")}
        aside={<JourneyTracker counts={journey} current="tailor" />}
      />

      <section id="tailor-flow" className="rx-flow" aria-label={t("resumatch.tailor.flowAria")}>
        <TailorFlow confirmedVersionId={confirmed.id} seed={editSeed ? null : seed} editSeed={editSeed} />
      </section>

      {journey.tailoredCount > 0 ? (
        <>
          <StatRow label={t("resumatch.tailor.stats.aria")}>
            <StatTile value={journey.tailoredCount} label={t("resumatch.tailor.stats.tailored")} visual={<SparkIcon />} />
            <StatTile value={distinctJobs} label={t("resumatch.stats.jobs")} visual={<BriefcaseIcon />} />
            <StatTile
              value={coverLetters}
              label={t("resumatch.stats.withCoverLetter")}
              visual={<MailIcon />}
              tone="ok"
            />
            <StatTile
              value={degraded}
              label={t("resumatch.stats.degraded")}
              hint={t("resumatch.stats.degradedHint")}
              visual={<WarningIcon />}
              tone={degraded > 0 ? "warm" : "muted"}
            />
          </StatRow>

          <section className="rx-panel">
            <div className="rx-panel__head">
              <div>
                <h2 className="rx-panel__title">{t("resumatch.tailor.activity.title", { days: ACTIVITY_DAYS })}</h2>
                <p className="rx-panel__sub">{funnel}</p>
              </div>
            </div>
            <ActivitySeriesChart
              days={chart.days}
              series={chart.series}
              summary={activitySummary}
              legendLabel={t("resumatch.tailor.activity.legend")}
            />
          </section>

          <section className="rx-panel" aria-labelledby="rx-recent-title">
            <div className="rx-panel__head">
              <h2 id="rx-recent-title" className="rx-panel__title">
                {t("resumatch.tailor.recent.title")}
              </h2>
              <Link href="/tailor/history" className="rx-link">
                {t("resumatch.tailor.recent.all")}
              </Link>
            </div>
            <ul className="rx-cards">
              {history.map((resume) => (
                <li key={resume.id}>
                  <Link href={`/tailor/${resume.id}/preview`} className="rx-card">
                    <span className="rx-card__title">{resume.targetJob.title ?? t("resumatch.tailor.recent.fallbackTitle")}</span>
                    {resume.targetJob.employer ? (
                      <span className="rx-card__sub">{resume.targetJob.employer}</span>
                    ) : null}
                    <span className="rx-card__meta">
                      <span className="jm-mono">{resume.createdAt.toISOString().slice(0, 10)}</span>
                      <span className="rx-pill">{resume.templateKey}</span>
                      <LanguageBadge language={resume.outputLanguage} />
                      {resume.coverLetter ? <span className="rx-pill rx-pill--ok">{t("resumatch.plusCoverLetter")}</span> : null}
                      <LanguageBadge language={resume.coverLetter?.outputLanguage} coverLetter />
                      {resume.degraded ? <span className="rx-pill rx-pill--warm">{t("resumatch.degraded")}</span> : null}
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
