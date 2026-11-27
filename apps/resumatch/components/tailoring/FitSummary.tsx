"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import type { FitView, FitViewRow } from "../../lib/tailoring/fit/view";

/**
 * The job fit summary (#971), shared by the interactive panel on /tailor
 * (FitAssessmentPanel) and the read-only one on a saved CV's preview
 * (#973): Suitability and Background match side by side, strengths,
 * transferable experience and gaps, the requirement-to-evidence table and
 * how the number is calculated. Every number comes from the server's
 * rubric; this only renders it. Posting and source text is rendered as
 * text, never as HTML.
 *
 * `between` sits after the summary and before the table (the panel's
 * questions). `rowActions` and `answerActions` add controls to a table
 * row (the panel's Correct and Undo); without them the table is read-only.
 */

const JUDGMENT_PILL: Record<string, string> = {
  direct: "rx-pill--ok",
  partial: "rm-jfa__pill--partial",
  unknown: "",
  unmet: "rx-pill--warm",
  conflict: "rx-pill--warm",
};

export function FitSummary({
  view,
  between,
  rowActions,
  answerActions,
  questionsShown = false,
}: {
  view: FitView;
  between?: ReactNode;
  rowActions?: (row: FitViewRow) => ReactNode;
  answerActions?: (row: FitViewRow) => ReactNode;
  /** The clarification questions are on this screen (the panel). */
  questionsShown?: boolean;
}) {
  const { t, locale } = useTranslation();
  const isAi = view.method === "ai";
  const score = view.score;
  const rowsById = new Map(view.rows.map((r) => [r.id, r]));
  const live = view.rows.filter((r) => !r.removed && !r.protectedTrait);

  const why = (row: FitViewRow) =>
    row.answeredBy
      ? t(`resumatch.jfa.answeredWhy.${row.answeredBy}`)
      : isAi && row.explanation
        ? row.explanation
        : t(`resumatch.jfa.keywordWhy.${row.judgment}`);
  const quoteList = (ids: string[]) =>
    ids.slice(0, 5).map((id) => {
      const row = rowsById.get(id);
      return row ? <li key={id}>{row.quote}</li> : null;
    });

  return (
    <>
      <div className="rm-jfa__grid">
        <article className="rm-jfa__card" data-testid="fit-suitability">
          <h4 className="rm-jfa__card-title">{t("resumatch.jfa.suitability.title")}</h4>
          <p className={`rm-jfa__verdict rm-jfa__verdict--${score.suitability.overall}`}>{t(`resumatch.jfa.suitability.${score.suitability.overall}`)}</p>
          <p className="rm-jfa__muted">{t("resumatch.jfa.suitability.hint")}</p>
          {score.suitability.items.length > 0 ? (
            <ul className="rm-jfa__list">
              {score.suitability.items.map((item) => (
                <li key={item.requirementId} className="rm-jfa__constraint">
                  <span className={`rx-pill ${item.status === "supported" ? "rx-pill--ok" : item.status === "unmet" ? "rx-pill--warm" : ""}`}>
                    {t(`resumatch.jfa.suitability.status.${item.status}`)}
                  </span>
                  <span className="rm-jfa__quote">{rowsById.get(item.requirementId)?.quote}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="rm-jfa__muted">{t("resumatch.jfa.suitability.unknownNote")}</p>
        </article>

        <article className="rm-jfa__card" data-testid="fit-match">
          <h4 className="rm-jfa__card-title">{t("resumatch.jfa.match.title")}</h4>
          {score.percent !== null ? (
            <>
              <p className="rm-jfa__percent" data-testid="fit-percent">
                {t("resumatch.jfa.match.percent", { percent: score.percent })}
                <span className="rm-jfa__band"> {t(`resumatch.jfa.match.band.${score.band}`)}</span>
              </p>
              <p className="rm-jfa__muted">{t("resumatch.jfa.match.meaning")}</p>
            </>
          ) : (
            <div className="rm-jfa__insufficient" data-testid="fit-insufficient">
              <p className="rm-jfa__verdict">{t("resumatch.jfa.insufficient.title")}</p>
              <p>{t(`resumatch.jfa.insufficient.${score.suppressed}`)}</p>
              <p className="rm-jfa__muted">{t("resumatch.jfa.insufficient.next")}</p>
              <ul className="rm-jfa__next">
                <li>
                  <Link href="/profile">{t("resumatch.jfa.insufficient.nextProfile")}</Link>
                </li>
                {questionsShown && view.questions.length > 0 ? <li>{t("resumatch.jfa.insufficient.nextQuestions")}</li> : null}
                <li>{t("resumatch.jfa.insufficient.nextEvidence")}</li>
                <li>{t("resumatch.jfa.insufficient.nextJob")}</li>
              </ul>
            </div>
          )}
          <p className="rm-jfa__completeness" data-testid="fit-completeness">
            {t("resumatch.jfa.match.completeness", { percent: score.completeness, unknown: score.counts.unknown, total: score.units.length })}
          </p>
          <p className="rm-jfa__muted">
            {t(`resumatch.jfa.match.sufficiency.${score.sufficiency}`)} ·{" "}
            {t("resumatch.jfa.match.counts", { ...score.counts })}
          </p>
        </article>
      </div>

      <div className="rm-jfa__summary">
        {score.strengths.length > 0 ? (
          <div>
            <h4 className="rm-jfa__card-title">{t("resumatch.jfa.strengths")}</h4>
            <ul className="rm-jfa__bullets">{quoteList(score.strengths)}</ul>
          </div>
        ) : null}
        {score.transferable.length > 0 ? (
          <div>
            <h4 className="rm-jfa__card-title">{t("resumatch.jfa.transferable")}</h4>
            <ul className="rm-jfa__bullets">{quoteList(score.transferable)}</ul>
          </div>
        ) : null}
        <div data-testid="fit-gaps">
          <h4 className="rm-jfa__card-title">{t("resumatch.jfa.gaps")}</h4>
          {score.gaps.length > 0 ? <ul className="rm-jfa__bullets">{quoteList(score.gaps)}</ul> : <p className="rm-jfa__muted">{t("resumatch.jfa.gapsNone")}</p>}
        </div>
      </div>

      {between}

      <details className="rm-jfa__details" data-testid="fit-details">
        <summary>{t("resumatch.jfa.details.summary", { count: view.rows.length })}</summary>
        <table className="rm-jfa__table">
          <thead>
            <tr>
              <th scope="col">{t("resumatch.jfa.details.requirement")}</th>
              <th scope="col">{t("resumatch.jfa.details.priority")}</th>
              <th scope="col">{t("resumatch.jfa.details.assessment")}</th>
              <th scope="col">{t("resumatch.jfa.details.evidence")}</th>
              <th scope="col">{t("resumatch.jfa.details.why")}</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.id} className={row.removed || row.protectedTrait ? "rm-jfa__row--off" : undefined} data-testid="fit-row" data-judgment={row.judgment}>
                <td data-label={t("resumatch.jfa.details.requirement")}>
                  <span className="rm-jfa__quote">“{row.quote}”</span>
                  {row.groupId ? <span className="rm-jfa__muted"> · {t("resumatch.jfa.details.alternative")}</span> : null}
                  {row.protectedTrait ? <span className="rm-jfa__note">{t("resumatch.jfa.details.protected")}</span> : null}
                  {row.removed ? <span className="rm-jfa__note">{t("resumatch.jfa.details.removed")}</span> : null}
                </td>
                <td data-label={t("resumatch.jfa.details.priority")}>
                  {t(`resumatch.jfa.priority.${row.priority}`)}
                  {row.priorityCorrectedFrom ? (
                    <span className="rm-jfa__note">{t("resumatch.jfa.details.corrected", { priority: t(`resumatch.jfa.priority.${row.priorityCorrectedFrom}`) })}</span>
                  ) : null}
                </td>
                <td data-label={t("resumatch.jfa.details.assessment")}>
                  <span className={`rx-pill ${JUDGMENT_PILL[row.judgment] ?? ""}`}>{t(`resumatch.jfa.judgment.${row.judgment}`)}</span>
                  {row.answeredBy ? <span className="rm-jfa__note">{t(`resumatch.jfa.answered.${row.answeredBy}`)}</span> : null}
                  {row.answeredBy && answerActions ? answerActions(row) : null}
                </td>
                <td data-label={t("resumatch.jfa.details.evidence")}>
                  {row.citations.length === 0 ? (
                    <span className="rm-jfa__muted">{t("resumatch.jfa.details.none")}</span>
                  ) : (
                    row.citations.map((c) => (
                      <span key={`${c.sourceId}:${c.quote}`} className="rm-jfa__citation">
                        {c.kind === "answer" ? (
                          t("resumatch.jfa.details.answerSource")
                        ) : (
                          <>
                            “{c.quote}”{" "}
                            <span className="rm-jfa__muted">({c.sourceId.startsWith("ev:") && c.label === c.sourceId ? t("resumatch.jfa.details.sourceGone") : c.label})</span>
                          </>
                        )}
                      </span>
                    ))
                  )}
                </td>
                <td data-label={t("resumatch.jfa.details.why")}>
                  {why(row)}
                  {row.equivalence ? <span className="rm-jfa__note">{t("resumatch.jfa.details.equivalence", row.equivalence)}</span> : null}
                  {row.flags.some((f) => f !== "not_assessed" && f !== "partial_not_credential") ? (
                    <span className="rm-jfa__note">{t("resumatch.jfa.details.flagged")}</span>
                  ) : null}
                  {rowActions ? rowActions(row) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details className="rm-jfa__details" data-testid="fit-calc">
        <summary>{t("resumatch.jfa.calc.summary")}</summary>
        <p className="rm-jfa__muted">{t("resumatch.jfa.calc.rules")}</p>
        <p>
          {t("resumatch.jfa.calc.thisJob", { earned: formatPoints(score.earned, locale), possible: formatPoints(score.possible, locale) })}
          {score.percent !== null ? ` = ${t("resumatch.jfa.match.percent", { percent: score.percent })}` : ""}
        </p>
        <p className="rm-jfa__muted">
          {t("resumatch.jfa.calc.version", { version: score.rubricVersion })} · {live.length}/{view.rows.length}
        </p>
      </details>
    </>
  );
}

function formatPoints(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}
