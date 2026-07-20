"use client";

import { useMemo, useState } from "react";
import { Badge } from "@asafarim/ui";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  createJob,
  advance,
  retry,
  FixtureProvider,
  type Job,
  type Brief,
  type PipelineStage,
} from "@asafarim/vionto-benchmark/engine";
import briefsFixture from "@asafarim/vionto-benchmark/fixtures/briefs";
import { stateBadge } from "./format";
import styles from "./vionto.module.css";

const briefs = briefsFixture as Brief[];

const STAGE_ORDER: PipelineStage[] = ["script", "storyboard", "asset-plan", "render", "done"];

function StageChain({ job }: { job: Job }) {
  const { t } = useTranslation();
  const currentIndex = STAGE_ORDER.indexOf(job.stage);
  return (
    <div className={styles.stageChain} aria-label={t("showcase.vionto.pipelineExplorer.aria.stage")}>
      {STAGE_ORDER.map((stage, i) => (
        <span key={stage} style={{ display: "contents" }}>
          <span className={`${styles.stageChip} ${i === currentIndex ? styles.stageChipActive : ""}`}>
            {t(`showcase.vionto.pipelineExplorer.stage.${stage}`)}
          </span>
          {i < STAGE_ORDER.length - 1 ? <span className={styles.stageArrow}>→</span> : null}
        </span>
      ))}
    </div>
  );
}

/**
 * Interactive pipeline demo. Runs the real state machine client-side against
 * a committed synthetic brief — no network call, nothing persisted. Every
 * action (start/approve/reject/retry) is an explicit button; the approval
 * gates cannot be skipped, matching the engine's own rules.
 */
export function PipelineExplorer() {
  const { t } = useTranslation();
  const [briefId, setBriefId] = useState(briefs[0].id);
  const brief = useMemo(() => briefs.find((b) => b.id === briefId) ?? briefs[0], [briefId]);
  const [job, setJob] = useState<Job>(() => createJob(brief));

  function reset(nextBrief: Brief) {
    setJob(createJob(nextBrief));
  }

  function onBriefChange(id: string) {
    setBriefId(id);
    const nextBrief = briefs.find((b) => b.id === id) ?? briefs[0];
    reset(nextBrief);
  }

  const ctx = { brief, provider: FixtureProvider };
  const canStart = job.state === "queued";
  const canApprove = job.state === "awaiting-approval";
  const canReject = job.state === "awaiting-approval";
  const canRetry = job.state === "failed" || job.state === "cancelled";

  function safeDispatch(fn: () => Job) {
    try {
      setJob(fn());
    } catch (err) {
      // The engine throws on an illegal transition (e.g. approving twice) —
      // surface it as a log-style message rather than crashing the demo.
      setJob((current) => ({
        ...current,
        log: [...current.log, { seq: current.log.length, event: "ui-error", detail: { message: (err as Error).message } }],
      }));
    }
  }

  const badge = stateBadge(job.state);

  return (
    <div className={styles.explorer}>
      <div className={styles.controlsRow}>
        <div>
          <label htmlFor="brief-select" className={styles.mono}>
            {t("showcase.vionto.pipelineExplorer.brief")}
          </label>
          <br />
          <select
            id="brief-select"
            className={styles.select}
            value={briefId}
            onChange={(e) => onBriefChange(e.target.value)}
          >
            {briefs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} — {b.title}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--sm"
            disabled={!canStart}
            onClick={() => safeDispatch(() => advance(job, "start", ctx))}
          >
            {t("showcase.vionto.pipelineExplorer.start")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--sm"
            disabled={!canApprove}
            onClick={() => safeDispatch(() => advance(job, "approve", ctx))}
          >
            {t("showcase.vionto.pipelineExplorer.approve")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--danger ui-btn--sm"
            disabled={!canReject}
            onClick={() => safeDispatch(() => advance(job, "reject", ctx))}
          >
            {t("showcase.vionto.pipelineExplorer.reject")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--secondary ui-btn--sm"
            disabled={!canRetry}
            onClick={() => safeDispatch(() => retry(job, ctx))}
          >
            {t("showcase.vionto.pipelineExplorer.retry")}
          </button>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => reset(brief)}>
            {t("showcase.vionto.pipelineExplorer.reset")}
          </button>
        </div>
      </div>

      <p className="u-muted">{brief.brief}</p>

      <div aria-live="polite">
        <div className={styles.jobHead}>
          <span>
            <Badge tone={badge.tone}>{t(badge.labelKey)}</Badge> <span className={styles.mono}>{job.id}</span>
            {job.retryCount > 0 ? (
              <span className={styles.mono}>
                {" · "}
                {t("showcase.vionto.pipelineExplorer.retryLabel")}
                {" "}
                {job.retryCount}
              </span>
            ) : null}
          </span>
          <StageChain job={job} />
        </div>

        {job.errorSummary ? (
          <p className={`${styles.mono} ${styles.errorText}`}>{job.errorSummary}</p>
        ) : null}

        <div className={styles.pane}>
          <pre className={styles.log}>
            {job.log.map((entry) => `${String(entry.seq).padStart(2, "0")}  ${entry.event}${entry.detail ? " " + JSON.stringify(entry.detail) : ""}`).join("\n")}
          </pre>
        </div>
      </div>
    </div>
  );
}
