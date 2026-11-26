import Link from "next/link";
import { getTranslator } from "../../../lib/i18n-server";
import { OUTCOME_STAGES, QUIET_AFTER_DAYS, percent, type OutcomeSummary } from "../../../lib/history/outcomes";

/** How many jobs show before the rest fold into "Show all". */
const VISIBLE_JOBS = 8;

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * "Where your applications stand": every job the candidate tailored a CV
 * for, with the status it has on /applications — a stacked bar by stage,
 * a few plain-language insights, and one line per job linking to the
 * application (or to the newest CV, where "Save as application" lives).
 * Read-only: statuses are changed on /applications, never here.
 */
export async function OutcomesPanel({ summary }: { summary: OutcomeSummary }) {
  const { t } = await getTranslator();
  const total = summary.jobs.length;
  if (total === 0) return null;

  const stageLabel = (stage: string) =>
    stage === "UNTRACKED" ? t("resumatch.history.stage.UNTRACKED") : t(`resumatch.app.status.${stage}`);
  const stages = OUTCOME_STAGES.filter((s) => summary.byStage[s] > 0);
  const answeredPct = percent(summary.answered, summary.applied);
  const chartSummary = stages.map((s) => `${stageLabel(s)}: ${summary.byStage[s]}`).join(", ");

  const visible = summary.jobs.slice(0, VISIBLE_JOBS);
  const rest = summary.jobs.slice(VISIBLE_JOBS);
  const jobRow = (job: OutcomeSummary["jobs"][number]) => (
    <li key={job.key} className="rx-oc__job" data-stage={job.stage}>
      <span className={`rx-st rx-st--${job.stage}`}>{stageLabel(job.stage)}</span>
      <span className="rx-oc__job-text">
        <span className="rx-oc__job-title">
          {job.title ?? job.employer ?? t("resumatch.untitledJob")}
          {job.title && job.employer ? <span className="rx-hl__employer"> · {job.employer}</span> : null}
        </span>
        <span className="rx-oc__job-meta">
          <span>{t("resumatch.history.outcomes.versions", { count: job.versions })}</span>
          {job.appliedAt ? (
            <span>{t("resumatch.history.outcomes.appliedOn", { date: day(job.appliedAt) })}</span>
          ) : null}
          {job.quiet ? (
            <span className="rx-oc__quiet">{t("resumatch.history.outcomes.noAnswer", { days: QUIET_AFTER_DAYS })}</span>
          ) : null}
        </span>
      </span>
      {job.applicationId ? (
        <Link href={`/applications/${encodeURIComponent(job.applicationId)}/timeline`} className="rx-link">
          {t("resumatch.history.outcomes.open")}
        </Link>
      ) : (
        <Link href={`/tailor/${encodeURIComponent(job.latestResumeId)}/preview`} className="rx-link">
          {t("resumatch.history.outcomes.track")}
        </Link>
      )}
    </li>
  );

  return (
    <section className="rx-panel rx-oc" aria-labelledby="rx-oc-title" data-testid="history-outcomes">
      <div className="rx-oc__head">
        <div>
          <h2 id="rx-oc-title" className="rx-panel__title">
            {t("resumatch.history.outcomes.title")}
          </h2>
          <p className="rx-panel__sub">{t("resumatch.history.outcomes.sub")}</p>
        </div>
        <Link href="/applications" className="rx-link">
          {t("resumatch.history.outcomes.manage")}
        </Link>
      </div>

      <div className="rx-oc__bar" role="img" aria-label={chartSummary}>
        {stages.map((s) => (
          <span
            key={s}
            className={`rx-oc__seg rx-oc__seg--${s}`}
            style={{ flexGrow: summary.byStage[s] }}
            title={`${stageLabel(s)}: ${summary.byStage[s]}`}
          />
        ))}
      </div>
      <ul className="rx-oc__legend" aria-hidden="true">
        {stages.map((s) => (
          <li key={s} className={`rx-oc__legend-item rx-oc__legend-item--${s}`}>
            <span className="rx-oc__swatch" />
            {stageLabel(s)} <strong>{summary.byStage[s]}</strong>
          </li>
        ))}
      </ul>

      <ul className="rx-oc__insights">
        <li>
          {summary.applied > 0
            ? t("resumatch.history.outcomes.applied", { applied: summary.applied, total })
            : t("resumatch.history.outcomes.noneApplied", { total })}
        </li>
        {answeredPct !== null ? (
          <li>
            {t("resumatch.history.outcomes.answered", {
              answered: summary.answered,
              applied: summary.applied,
              pct: answeredPct,
              interviews: summary.interviews,
            })}
          </li>
        ) : null}
        {summary.quiet > 0 ? (
          <li className="rx-oc__insight--warm">
            {t("resumatch.history.outcomes.quiet", { count: summary.quiet, days: QUIET_AFTER_DAYS })}
          </li>
        ) : null}
        {summary.byStage.UNTRACKED > 0 ? (
          <li>{t("resumatch.history.outcomes.untracked", { count: summary.byStage.UNTRACKED })}</li>
        ) : null}
        {summary.otherApplications > 0 ? (
          <li>{t("resumatch.history.outcomes.other", { count: summary.otherApplications })}</li>
        ) : null}
      </ul>

      <ol className="rx-oc__jobs" aria-label={t("resumatch.history.outcomes.jobsAria")}>
        {visible.map(jobRow)}
      </ol>
      {rest.length > 0 ? (
        <details className="rx-oc__more">
          <summary>{t("resumatch.history.outcomes.showAll", { count: total })}</summary>
          <ol className="rx-oc__jobs">{rest.map(jobRow)}</ol>
        </details>
      ) : null}
    </section>
  );
}
