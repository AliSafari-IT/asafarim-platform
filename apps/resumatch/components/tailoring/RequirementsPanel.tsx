"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button } from "@asafarim/ui";
import { MAX_EVIDENCE_DETAIL_CHARS, MAX_EVIDENCE_TITLE_CHARS } from "../../lib/evidence/contract";
import type { ClarificationQuestion, RequirementCoverage } from "../../lib/tailoring/selection/select";

/**
 * What the job asks for, checked against the profile (#930), and at most
 * three optional questions about requirements the profile never mentions.
 *
 * - "Yes": the candidate describes it in their own words, then confirms
 *   the text in a second step. Only then is it saved, as confirmed evidence
 *   for this application (the #929 store), and used like any other.
 * - "No": the requirement is marked unmet for this run; the CV never claims
 *   it. Undo puts it back to unknown.
 * - Skipping is doing nothing: the run treats it as unknown and claims
 *   nothing about it.
 *
 * Requirement text comes from the job posting. React escapes it; it is
 * never rendered as HTML.
 */

interface Answer {
  requirementId: string;
  detail: string;
  /** The candidate pressed "Review"; the next step is the confirm. */
  reviewing: boolean;
}

export function RequirementsPanel({
  targetJobId,
  profileVersionId,
  unmet,
  onUnmetChange,
  refreshKey,
  onEvidenceAdded,
}: {
  targetJobId: string;
  profileVersionId: string;
  /** Requirement ids the candidate answered "no" to. */
  unmet: string[];
  onUnmetChange: (ids: string[]) => void;
  /** Changes whenever evidence changes (here or in the evidence list), to
   *  refresh coverage and questions. */
  refreshKey: string;
  onEvidenceAdded: () => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const [requirements, setRequirements] = useState<RequirementCoverage[] | null>(null);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tailor/job-fit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileVersionId, targetJobId, unmetRequirementIds: unmet }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { requirements?: RequirementCoverage[]; questions?: ClarificationQuestion[] };
      setRequirements(body.requirements ?? []);
      setQuestions(body.questions ?? []);
    } catch {
      // The check is optional: without it the run still claims nothing the
      // profile lacks. Show nothing rather than an error.
      setRequirements((previous) => previous ?? []);
    }
  }, [profileVersionId, targetJobId, unmet]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function confirmYes(question: ClarificationQuestion, detail: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "RESPONSIBILITY",
          title: question.text.slice(0, MAX_EVIDENCE_TITLE_CHARS),
          detail,
          // No single role: the candidate did not say where. It can back the
          // headline and summary, never another role's bullet. They can link
          // a role in the evidence list below.
          experienceRef: null,
          scope: "APPLICATION",
          targetJobId,
          confirm: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? t("resumatch.requirements.error.save"));
        return;
      }
      setAnswer(null);
      setNotice(t("resumatch.requirements.saved"));
      onEvidenceAdded();
    } catch {
      setError(t("resumatch.evidence.error.network"));
    } finally {
      setBusy(false);
    }
  }

  if (!requirements || requirements.length === 0) return null;

  const supported = requirements.filter((r) => r.status === "supported").length;
  const statusLabel = (r: RequirementCoverage) =>
    r.status === "supported"
      ? t("resumatch.requirements.status.supported")
      : r.status === "unmet"
        ? t(r.unmetBy === "candidate" ? "resumatch.requirements.status.unmetCandidate" : "resumatch.requirements.status.unmetProfile")
        : r.status === "conflict"
          ? t("resumatch.requirements.status.conflict")
          : t("resumatch.requirements.status.unknown");

  return (
    <details className="rm-evidence rm-reqs" open={questions.length > 0 || undefined} data-testid="requirements-panel">
      <summary>
        {t("resumatch.requirements.summary")}{" "}
        <span className="rm-evidence__count">
          {t("resumatch.requirements.count", { supported, total: requirements.length })}
        </span>
      </summary>
      <p className="rm-evidence__hint">{t("resumatch.requirements.hint")}</p>

      <ul className="rm-reqs__list">
        {requirements.map((r) => (
          <li key={r.id} className="rm-reqs__item">
            <span className={`rx-pill ${r.status === "supported" ? "rx-pill--ok" : r.status === "unknown" ? "" : "rx-pill--warm"}`}>
              {statusLabel(r)}
            </span>
            <span className="rm-reqs__text">
              {r.text}
              {r.priority === "preferred" ? <span className="rm-evidence__role"> · {t("resumatch.requirements.preferred")}</span> : null}
            </span>
            {r.status === "conflict" ? (
              <span className="rm-reqs__note">{t("resumatch.requirements.conflictNote")}</span>
            ) : null}
            {r.unmetBy === "candidate" ? (
              <button
                type="button"
                className="rm-link-button"
                onClick={() => onUnmetChange(unmet.filter((id) => id !== r.id))}
              >
                {t("resumatch.requirements.undo")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {questions.length > 0 ? (
        <section className="rm-reqs__questions" aria-labelledby={headingId}>
          <h3 id={headingId} className="rm-evidence__group">
            {t("resumatch.requirements.questions.title", { count: questions.length })}
          </h3>
          <p className="rm-evidence__hint">{t("resumatch.requirements.questions.hint")}</p>
          <ol className="rm-reqs__question-list">
            {questions.map((q) => {
              const open = answer?.requirementId === q.requirementId ? answer : null;
              const detailId = `${headingId}-${q.requirementId}`;
              return (
                <li key={q.requirementId} className="rm-evidence__item rm-reqs__question">
                  <p className="rm-reqs__ask">{t("resumatch.requirements.question", { requirement: q.text })}</p>
                  {!open ? (
                    <div className="rm-evidence__actions">
                      <Button size="sm" variant="ghost" onClick={() => setAnswer({ requirementId: q.requirementId, detail: "", reviewing: false })} disabled={busy}>
                        {t("resumatch.requirements.yes")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onUnmetChange([...unmet, q.requirementId])} disabled={busy}>
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
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? (
        <p className="rm-evidence__notice" role="status">
          {notice}
        </p>
      ) : null}
    </details>
  );
}
