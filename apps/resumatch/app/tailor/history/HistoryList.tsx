"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import { LanguageBadge } from "../../components/app/LanguageBadge";
import { JobSourceLine } from "../../../components/jobSource/JobSourceLine";
import { describeJobSource } from "../../../lib/jobs/source";
import { OUTCOME_STAGES, type OutcomeStage } from "../../../lib/history/stages";
import type { ApplicationStatusName } from "../../../lib/applications/constants";

/** Deterministic, locale-independent formatting — `toLocaleString()` here
 *  produced a server/client hydration mismatch (server and browser locales
 *  disagreed on "18/9/2026" vs "18/09/2026"). Matches the `YYYY-MM-DD
 *  HH:MM` shape the rest of this app already uses for dates (see
 *  tailor/page.tsx's `toISOString().slice(0, 10)`). */
function formatTimestamp(value: string | Date): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

interface HistoryRow {
  id: string;
  createdAt: string | Date;
  templateKey: string;
  degraded: boolean;
  outputLanguage: string | null;
  promptVersion: string;
  modelVersion: string;
  targetJobId: string;
  targetJob: { title: string | null; employer: string | null; sourceUrl: string; sourceFiles?: unknown };
  coverLetter: { id: string; outputLanguage: string | null } | null;
}

/** What happened to a version's job on /applications (lib/history/outcomes.ts). */
export interface HistoryOutcome {
  applicationId: string;
  status: ApplicationStatusName;
  /** "version": this CV is the one on the application; "job": the job is tracked. */
  via: "version" | "job";
}

/** Client picker: check exactly two rows, then "Compare" navigates to
 *  /tailor/history/compare/[a]/[b]. Server data stays read-only — this
 *  component only tracks local selection state. */
export function HistoryList({
  resumes,
  outcomes = {},
}: {
  resumes: HistoryRow[];
  outcomes?: Record<string, HistoryOutcome>;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  // Show only versions whose job is at this stage; null shows all.
  const [stageFilter, setStageFilter] = useState<OutcomeStage | null>(null);
  const stageOf = (id: string): OutcomeStage => outcomes[id]?.status ?? "UNTRACKED";
  const stageLabel = (stage: OutcomeStage) =>
    stage === "UNTRACKED" ? t("resumatch.history.stage.UNTRACKED") : t(`resumatch.app.status.${stage}`);
  const stageCounts = new Map<OutcomeStage, number>();
  for (const r of resumes) stageCounts.set(stageOf(r.id), (stageCounts.get(stageOf(r.id)) ?? 0) + 1);
  const filterStages = OUTCOME_STAGES.filter((s) => (stageCounts.get(s) ?? 0) > 0);
  const shown = stageFilter ? resumes.filter((r) => stageOf(r.id) === stageFilter) : resumes;
  // Which job is currently being re-fetched — see "Refresh title" below.
  // Keyed by targetJobId, not the resume id, since a refresh updates the
  // shared TargetJob row every resume/list entry for it reads from.
  const [refreshingJobId, setRefreshingJobId] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  async function refreshJob(targetJobId: string) {
    setRefreshingJobId(targetJobId);
    try {
      const response = await fetch("/api/tailor/refresh-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetJobId }),
      });
      if (response.ok) router.refresh();
    } finally {
      setRefreshingJobId(null);
    }
  }

  // Group by UTC day, keeping newest-first order within and across days.
  const days: { day: string; rows: HistoryRow[] }[] = [];
  for (const resume of shown) {
    const day = formatTimestamp(resume.createdAt).slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(resume);
    else days.push({ day, rows: [resume] });
  }

  return (
    <section className="rx-panel rx-hl" aria-labelledby="rx-hl-title">
      <div className="rx-hl__bar">
        <div>
          <h2 id="rx-hl-title" className="rx-panel__title">
            {t("resumatch.history.list.title")}
          </h2>
          <p className="rx-panel__sub" aria-live="polite">
            {selected.length === 0
              ? t("resumatch.history.list.pickTwo")
              : selected.length === 1
                ? t("resumatch.history.list.pickOne")
                : t("resumatch.history.list.ready")}
          </p>
        </div>
        <Button
          onClick={() => router.push(`/tailor/history/compare/${selected[0]}/${selected[1]}`)}
          disabled={selected.length !== 2}
        >
          {t("resumatch.history.list.compare", { count: selected.length })}
        </Button>
      </div>

      {filterStages.length > 1 ? (
        <div className="rx-hl__filters" role="group" aria-label={t("resumatch.history.list.filterAria")}>
          <button
            type="button"
            className="rx-hl__filter"
            aria-pressed={stageFilter === null}
            onClick={() => setStageFilter(null)}
          >
            {t("resumatch.history.list.filterAll")} <span className="rx-hl__filter-count">{resumes.length}</span>
          </button>
          {filterStages.map((stage) => (
            <button
              key={stage}
              type="button"
              className={`rx-hl__filter rx-hl__filter--${stage}`}
              aria-pressed={stageFilter === stage}
              onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
            >
              <span className="rx-hl__filter-dot" aria-hidden="true" />
              {stageLabel(stage)} <span className="rx-hl__filter-count">{stageCounts.get(stage)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {days.map(({ day, rows }) => (
        <div key={day} className="rx-hl__day">
          <h3 className="rx-hl__date">
            <span className="jm-mono">{day}</span>
            <span className="rx-hl__count">
              {t(`resumatch.history.list.dayCount.${rows.length === 1 ? "one" : "other"}`, { count: rows.length })}
            </span>
          </h3>
          <ol className="rx-hl__items">
            {rows.map((resume) => {
              const isSelected = selected.includes(resume.id);
              const title = resume.targetJob.title ?? resume.targetJob.employer ?? t("resumatch.untitledJob");
              const outcome = outcomes[resume.id];
              return (
                <li
                  key={resume.id}
                  className={`rx-hl__item${isSelected ? " rx-hl__item--selected" : ""}${resume.degraded ? " rx-hl__item--degraded" : ""}`}
                >
                  <span className="rx-hl__dot" aria-hidden="true" />
                  <label className="rx-hl__main">
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(resume.id)} />
                    <span className="rx-hl__text">
                      <span className="rx-hl__title">
                        {title}
                        {resume.targetJob.employer && resume.targetJob.title ? (
                          <span className="rx-hl__employer"> · {resume.targetJob.employer}</span>
                        ) : null}
                      </span>
                      <span className="rx-hl__outcome">
                        <span className={`rx-st rx-st--${stageOf(resume.id)}`}>{stageLabel(stageOf(resume.id))}</span>
                        {outcome ? (
                          <span className="rx-hl__outcome-note">
                            {outcome.via === "version"
                              ? t("resumatch.history.list.usedVersion")
                              : t("resumatch.history.list.jobStatus")}
                          </span>
                        ) : null}
                      </span>
                      <span className="rx-hl__meta">
                        <span className="jm-mono">{formatTimestamp(resume.createdAt).slice(11)} UTC</span>
                        <span className="rx-pill">{resume.templateKey}</span>
                        <LanguageBadge language={resume.outputLanguage} />
                        <span className="jm-mono rx-hl__model">{resume.modelVersion}</span>
                        {resume.coverLetter ? (
                          <span className="rx-pill rx-pill--ok">{t("resumatch.plusCoverLetter")}</span>
                        ) : null}
                        <LanguageBadge language={resume.coverLetter?.outputLanguage} coverLetter />
                        {resume.degraded ? (
                          <span className="rx-pill rx-pill--warm">{t("resumatch.degraded")}</span>
                        ) : null}
                      </span>
                      <JobSourceLine
                        as="span"
                        className="rm-job-source rx-hl__source"
                        source={describeJobSource(resume.targetJob)}
                        targetJobId={resume.targetJobId}
                        from="history"
                      />
                    </span>
                  </label>
                  <span className="rx-hl__actions">
                    {!resume.targetJob.title && resume.targetJob.sourceUrl.startsWith("http") ? (
                      <button
                        type="button"
                        className="rm-history-item__refresh"
                        disabled={refreshingJobId === resume.targetJobId}
                        onClick={() => refreshJob(resume.targetJobId)}
                      >
                        {refreshingJobId === resume.targetJobId
                          ? t("resumatch.history.list.refreshing")
                          : t("resumatch.history.list.refreshTitle")}
                      </button>
                    ) : null}
                    {outcome ? (
                      <Link
                        href={`/applications/${encodeURIComponent(outcome.applicationId)}/timeline`}
                        className="rx-link"
                      >
                        {t("resumatch.history.list.application")}
                      </Link>
                    ) : null}
                    <Link href={`/tailor/${resume.id}/preview`} className="rx-link">
                      {t("resumatch.history.list.view")}
                    </Link>
                    <Link
                      href={`/ai-usage?job=${encodeURIComponent(resume.targetJobId)}&preset=year`}
                      className="rx-link"
                      aria-label={t("resumatch.history.list.aiCostAria", {
                        job: resume.targetJob.title ?? t("resumatch.history.list.thisJob"),
                      })}
                    >
                      {t("resumatch.history.list.aiCost")}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
