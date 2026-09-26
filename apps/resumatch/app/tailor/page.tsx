import type { Metadata } from "next";
import Link from "next/link";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../lib/db/client";
import { getTranslator } from "../../lib/i18n-server";
import { getJourneyCounts, jobKey } from "../../lib/journey";
import { getConfirmedVersion } from "../../lib/profile/versions";
import { getCurrentWorkspace } from "../../lib/workspace";
import { ActivityBars, busiestDay, lastNDays } from "../components/app/Charts";
import { JourneyTracker } from "../components/app/JourneyTracker";
import { PageHero } from "../components/app/PageHero";
import { StatRow, StatTile } from "../components/app/Stats";
import { BriefcaseIcon, MailIcon, SparkIcon, WarningIcon } from "../profile/icons";
import { TailorFlow } from "./TailorFlow";
import { LanguageBadge } from "../components/app/LanguageBadge";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.tailor.metaTitle") };
}
export const dynamic = "force-dynamic";

const ACTIVITY_DAYS = 14;

export default async function TailorPage() {
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
  const busiest = busiestDay(activity);
  const activitySummary = [
    t("resumatch.tailor.activity.aria", { total: lastTwoWeeks, days: ACTIVITY_DAYS }),
    busiest ? t("resumatch.tailor.activity.busiest", { day: busiest.day, count: busiest.count }) : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="rx">
      <PageHero
        kicker={t("resumatch.tailor.kicker")}
        title={t("resumatch.tailor.hero.title")}
        accent={t("resumatch.tailor.hero.accent")}
        lead={t("resumatch.tailor.hero.lead")}
        aside={<JourneyTracker counts={journey} current="tailor" />}
      />

      <section className="rx-flow" aria-label={t("resumatch.tailor.flowAria")}>
        <TailorFlow confirmedVersionId={confirmed.id} />
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
                <p className="rx-panel__sub">
                  {t(`resumatch.tailor.activity.sub.${lastTwoWeeks === 1 ? "one" : "other"}`, { count: lastTwoWeeks })}
                </p>
              </div>
            </div>
            <ActivityBars days={activity} summary={activitySummary} />
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
