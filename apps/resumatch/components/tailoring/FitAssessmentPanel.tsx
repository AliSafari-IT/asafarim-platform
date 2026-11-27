"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button } from "@asafarim/ui";
import { MAX_EVIDENCE_DETAIL_CHARS } from "../../lib/evidence/contract";
import type { FitView, FitViewQuestion } from "../../lib/tailoring/fit/view";
import type { FitState } from "../../lib/tailoring/fit/service";
import { evidenceTitleFrom } from "./evidenceTitle";
import { FitSummary } from "./FitSummary";

/**
 * Job fit assessment on the fetched-job card (#971, lib/tailoring/fit).
 *
 * Two answers, kept apart: Suitability (essential conditions the posting
 * states: supported, not met, or needing the candidate's confirmation) and
 * Background match (an explained, evidence-backed percentage computed in
 * code, with information completeness beside it). Then strengths,
 * transferable experience and material gaps, at most three optional
 * questions, a requirement-to-evidence table with corrections, and how the
 * number is calculated.
 *
 * Before any AI analysis, and whenever one fails, the basic keyword check
 * is shown, labelled as such. "Analyze job fit" is an explicit action; a
 * saved analysis for unchanged inputs reopens without a new call.
 *
 * The candidate stays in control: the low-fit warning is a question with a
 * "yes"; nothing is ever rejected for them. Text from the posting and the
 * candidate's sources is rendered as text, never as HTML.
 */

type ApiState = FitState & { ai?: { provider: string; available: boolean; budgetResetsOn: string } };
type Failure = "budget" | "provider" | "timeout" | "invalid_output" | "unavailable" | "cancelled" | "network";

interface Answer {
  requirementId: string;
  detail: string;
  reviewing: boolean;
}

export function FitAssessmentPanel({
  targetJobId,
  profileVersionId,
  acknowledged,
  onAcknowledge,
  onDecline,
  onGateChange,
  onEvidenceAdded,
  refreshKey,
}: {
  targetJobId: string;
  profileVersionId: string;
  /** The candidate said "yes, tailor anyway" to the low-fit warning. */
  acknowledged: boolean;
  onAcknowledge: () => void;
  onDecline: () => void;
  /** The gate generate-preview applies, so the card can hold the options. */
  onGateChange: (targetJobId: string, gate: { lowFit: boolean; source: "ai" | "keyword" } | null) => void;
  /** A "yes" answer saved evidence: the evidence list should refresh. */
  onEvidenceAdded: () => void;
  /** Changes whenever evidence changes elsewhere on the card: reloads the
   *  state, so a changed input shows the saved analysis as out of date. */
  refreshKey: string;
}) {
  const { t, locale } = useTranslation();
  const headingId = useId();
  const [state, setState] = useState<ApiState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latest = useRef(0);
  // The parent's callback may change identity on every render; reading it
  // through a ref keeps `load` stable so the panel never refetches in a loop.
  const gateRef = useRef(onGateChange);
  gateRef.current = onGateChange;

  const accept = useCallback(
    (next: ApiState) => {
      setState(next);
      gateRef.current(targetJobId, next.gate);
    },
    [targetJobId],
  );

  const load = useCallback(async () => {
    const request = ++latest.current;
    try {
      const res = await fetch(
        `/api/tailor/fit?targetJobId=${encodeURIComponent(targetJobId)}&profileVersionId=${encodeURIComponent(profileVersionId)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as ApiState;
      if (request === latest.current) accept(body);
    } catch {
      if (request === latest.current) {
        setLoadFailed(true);
        gateRef.current(targetJobId, null);
      }
    }
  }, [targetJobId, profileVersionId, accept]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function analyze() {
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzing(true);
    setFailure(null);
    const request = ++latest.current;
    try {
      const res = await fetch("/api/tailor/fit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetJobId, profileVersionId, language: ["en", "nl", "fr", "de"].includes(locale) ? locale : "en" }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as (ApiState & { ok?: boolean; reason?: Failure }) | null;
      if (request !== latest.current) return;
      if (!res.ok || !body) {
        setFailure("network");
        return;
      }
      accept(body);
      if (body.ok === false) setFailure(body.reason ?? "provider");
    } catch (err) {
      if (request !== latest.current) return;
      setFailure((err as Error)?.name === "AbortError" ? "cancelled" : "network");
    } finally {
      if (request === latest.current) setAnalyzing(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function send(path: string, method: "POST" | "DELETE", payload: Record<string, unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetJobId, profileVersionId, ...payload }),
      });
      const body = (await res.json().catch(() => null)) as (ApiState & { error?: string }) | null;
      if (!res.ok || !body) {
        setActionError(body?.error ?? t("resumatch.requirements.error.save"));
        return false;
      }
      accept({ ...body, ai: state?.ai });
      return true;
    } catch {
      setActionError(t("resumatch.evidence.error.network"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmYes(question: FitViewQuestion, detail: string) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "RESPONSIBILITY",
          title: evidenceTitleFrom(detail),
          detail,
          experienceRef: null,
          scope: "APPLICATION",
          targetJobId,
          confirm: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as { revisionId?: string; error?: string } | null;
      if (!res.ok || !body?.revisionId) {
        setActionError(body?.error ?? t("resumatch.requirements.error.save"));
        return;
      }
      setBusy(false);
      if (await send("/api/tailor/fit/answers", "POST", { requirementId: question.requirementId, answer: "yes", evidenceRevisionId: body.revisionId })) {
        setAnswer(null);
        onEvidenceAdded();
      }
    } catch {
      setActionError(t("resumatch.evidence.error.network"));
    } finally {
      setBusy(false);
    }
  }

  if (loadFailed && !state) return null;
  if (!state) {
    return (
      <section className="rm-jfa" aria-busy="true" data-testid="fit-assessment">
        <p className="rm-jfa__muted">{t("resumatch.jfa.title")}…</p>
      </section>
    );
  }

  const view: FitView = state.assessment ?? state.keyword;
  const isAi = view.method === "ai";
  const stale = Boolean(view.meta?.stale);
  const score = view.score;
  const showGate = state.gate.lowFit && !acknowledged;
  const dateLabel = view.meta ? new Date(view.meta.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
  const failureText = failure
    ? t(`resumatch.jfa.error.${failure}`, { date: state.ai?.budgetResetsOn ?? "" })
    : null;
  const incompleteParts = [
    view.completeness.jobTruncated ? t("resumatch.jfa.incomplete.job") : null,
    view.completeness.requirementsCapped ? t("resumatch.jfa.incomplete.requirements") : null,
    view.completeness.profileSentencesOmitted > 0 ? t("resumatch.jfa.incomplete.profile", { count: view.completeness.profileSentencesOmitted }) : null,
  ].filter(Boolean);

  return (
    <section className="rm-jfa" aria-labelledby={headingId} data-testid="fit-assessment" data-method={view.method}>
      <header className="rm-jfa__head">
        <div>
          <h3 id={headingId} className="rm-jfa__title">
            {t("resumatch.jfa.title")}
          </h3>
          <p className="rm-jfa__method" data-testid="fit-method">
            {isAi ? t("resumatch.jfa.method.ai", { date: dateLabel }) : t("resumatch.jfa.method.keyword")}
          </p>
        </div>
        <div className="rm-jfa__actions">
          {analyzing ? (
            <Button size="sm" variant="ghost" onClick={cancel}>
              {t("resumatch.jfa.cancel")}
            </Button>
          ) : state.ai?.available !== false && (!isAi || stale) ? (
            <Button size="sm" onClick={() => void analyze()} disabled={busy}>
              {failure && failure !== "cancelled" ? t("resumatch.jfa.retry") : isAi ? t("resumatch.jfa.reanalyze") : t("resumatch.jfa.analyze")}
            </Button>
          ) : null}
        </div>
      </header>
      {!isAi ? <p className="rm-jfa__muted">{t("resumatch.jfa.method.keywordHint")}</p> : null}
      {!isAi && !analyzing ? <p className="rm-jfa__muted">{t("resumatch.jfa.analyzeHint")}</p> : null}
      {analyzing ? (
        <p className="rm-jfa__status" role="status">
          {t("resumatch.jfa.analyzing")}
        </p>
      ) : null}
      {failureText ? (
        <Alert tone="warning">
          <span data-testid="fit-failure">{failureText}</span>
          {stale && state.assessment ? <> {t("resumatch.jfa.previousShown")}</> : null}
        </Alert>
      ) : null}
      {stale ? (
        <p className="rm-jfa__stale" role="note" data-testid="fit-stale">
          {t("resumatch.jfa.stale")}
        </p>
      ) : null}
      {incompleteParts.length > 0 ? <p className="rm-jfa__muted">{t("resumatch.jfa.incomplete", { parts: incompleteParts.join("; ") })}</p> : null}
      {isAi && view.validation.judgmentsDowngraded > 0 ? (
        <p className="rm-jfa__muted">{t("resumatch.jfa.downgraded", { count: view.validation.judgmentsDowngraded })}</p>
      ) : null}

      {showGate ? (
        <div className="rm-fit rm-fit--low" data-testid="fit-gate">
          <Alert tone="warning">
            <strong>{t("resumatch.jfa.lowFit.title")}</strong>
            <p data-testid="fit-gate-reason">
              {state.gate.reason === "essential_unmet"
                ? t("resumatch.jfa.lowFit.bodyEssential")
                : state.gate.reason === "low_match"
                  ? t("resumatch.jfa.lowFit.bodyMatch", { percent: score.percent ?? 0 })
                  : state.gate.reason === "nothing_supported"
                    ? t("resumatch.jfa.lowFit.bodyNothing")
                    : state.gate.keywordScore
                      ? t("resumatch.fit.low.body", { score: state.gate.keywordScore })
                      : t("resumatch.fit.low.bodyNone")}
            </p>
          </Alert>
          <p className="rm-fit__question">{t("resumatch.fit.low.question")}</p>
          <p className="rm-fit__hint">{t("resumatch.fit.low.hint")}</p>
          <div className="rm-fit__actions">
            <Button onClick={onAcknowledge}>{t("resumatch.fit.low.yes")}</Button>
            <Button variant="ghost" onClick={onDecline}>
              {t("resumatch.fit.low.no")}
            </Button>
          </div>
        </div>
      ) : state.gate.lowFit && acknowledged ? (
        <p className="rm-jfa__muted">{t("resumatch.fit.confirmedNote")}</p>
      ) : null}

      <FitSummary
        view={view}
        questionsShown
        between={
          <>
          {view.questions.length > 0 ? (
            <section className="rm-reqs__questions" aria-labelledby={`${headingId}-q`} data-testid="fit-questions">
              <h4 id={`${headingId}-q`} className="rm-jfa__card-title">
                {t("resumatch.jfa.questions.title", { count: view.questions.length })}
              </h4>
              <p className="rm-jfa__muted">{t("resumatch.jfa.questions.hint")}</p>
              <ol className="rm-reqs__question-list">
                {view.questions.map((q) => {
                  const open = answer?.requirementId === q.requirementId ? answer : null;
                  const detailId = `${headingId}-${q.requirementId}`;
                  return (
                    <li key={q.requirementId} className="rm-evidence__item rm-reqs__question">
                      <p className="rm-reqs__ask">{t("resumatch.requirements.question", { requirement: q.quote })}</p>
                      {!open ? (
                        <div className="rm-evidence__actions">
                          <Button size="sm" variant="ghost" onClick={() => setAnswer({ requirementId: q.requirementId, detail: "", reviewing: false })} disabled={busy}>
                            {t("resumatch.requirements.yes")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void send("/api/tailor/fit/answers", "POST", { requirementId: q.requirementId, answer: "no" })}
                            disabled={busy}
                          >
                            {t("resumatch.requirements.no")}
                          </Button>
                        </div>
                      ) : open.reviewing ? (
                        <div className="rm-reqs__confirm">
                          <p className="rm-evidence__hint">{t("resumatch.requirements.confirmIntro")}</p>
                          <blockquote className="rm-evidence__detail rm-reqs__quote">{open.detail.trim()}</blockquote>
                          <div className="rm-evidence__actions">
                            <Button size="sm" onClick={() => void confirmYes(q, open.detail.trim())} disabled={busy}>
                              {t("resumatch.requirements.confirm")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setAnswer({ ...open, reviewing: false })} disabled={busy}>
                              {t("resumatch.requirements.edit")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="rm-evidence__form">
                          <label htmlFor={detailId} className="rm-evidence__hint">
                            {t("resumatch.requirements.detailLabel")}
                          </label>
                          <textarea
                            id={detailId}
                            className="ui-input"
                            rows={2}
                            maxLength={MAX_EVIDENCE_DETAIL_CHARS}
                            value={open.detail}
                            onChange={(e) => setAnswer({ ...open, detail: e.target.value })}
                          />
                          <div className="rm-evidence__actions">
                            <Button size="sm" onClick={() => setAnswer({ ...open, reviewing: true })} disabled={!open.detail.trim()}>
                              {t("resumatch.requirements.review")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setAnswer(null)}>
                              {t("resumatch.requirements.cancel")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
          {actionError ? <Alert tone="error">{actionError}</Alert> : null}
          </>
        }
        answerActions={(row) => (
          <button
            type="button"
            className="rm-link-button"
            disabled={busy}
            onClick={() => void send("/api/tailor/fit/answers", "DELETE", { requirementId: row.id })}
          >
            {t("resumatch.jfa.undoAnswer")}
          </button>
        )}
        rowActions={(row) => (
          <div className="rm-jfa__correct">
            {correcting === row.id ? (
              <label className="rm-jfa__correct-label">
                <span>{t("resumatch.jfa.correct.label")}</span>
                <select
                  className="ui-input ui-select"
                  defaultValue=""
                  disabled={busy}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    setCorrecting(null);
                    void send(
                      "/api/tailor/fit/corrections",
                      "POST",
                      value === "not_requirement" || value === "restore"
                        ? { requirementId: row.id, action: value }
                        : { requirementId: row.id, action: "priority", priority: value },
                    );
                  }}
                >
                  <option value="">—</option>
                  {(["required", "preferred", "unclear"] as const)
                    .filter((p) => p !== row.priority)
                    .map((p) => (
                      <option key={p} value={p}>
                        {t(`resumatch.jfa.correct.${p}`)}
                      </option>
                    ))}
                  {!row.removed ? <option value="not_requirement">{t("resumatch.jfa.correct.not_requirement")}</option> : null}
                  {row.removed || row.priorityCorrectedFrom ? <option value="restore">{t("resumatch.jfa.correct.restore")}</option> : null}
                </select>
              </label>
            ) : (
              <button type="button" className="rm-link-button" onClick={() => setCorrecting(row.id)} disabled={busy}>
                {t("resumatch.jfa.correct")}
              </button>
            )}
          </div>
        )}
      />
    </section>
  );
}
