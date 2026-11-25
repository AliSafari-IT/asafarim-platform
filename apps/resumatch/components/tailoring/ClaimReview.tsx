"use client";

import { useState, type ReactNode } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { confirmQuestionKey, type Removal, type RequirementGap, type ReviewIssue } from "../../lib/tailoring/claimReview";
import { MAX_BULLET_CHARS, MAX_CONFIRMED_DETAIL_CHARS } from "../../lib/tailoring/candidateEdits";

/**
 * #964: the parts of the Tailor review that make claim warnings
 * actionable: the exact words highlighted in place, a review card per
 * highlight (what, why, profile evidence, what to do), the clickable
 * summary that replaced the generic banner, job-requirement gaps, and what
 * the save will leave out. State lives in TailorFlow; these only render
 * it and report choices.
 */

type T = ReturnType<typeof useTranslation>["t"];

/** The DOM id of an issue's highlight, for "Review next" and the summary. */
export function markId(fieldKey: string, issueId: string): string {
  return `rm-claim-${fieldKey}-${issueId}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

const RULES = new Set([
  "mentoring",
  "training_people",
  "people_leadership",
  "hiring",
  "certification",
  "award",
  "publication",
  "patent",
  "public_speaking",
  "spoken_language",
]);

/** "Why this was flagged", in "we couldn't find support" words. */
export function reasonText(t: T, issue: ReviewIssue, where: string): string {
  const requirement = issue.requirementText ?? issue.text;
  switch (issue.reason) {
    case "responsibility":
      return t("resumatch.claimReview.reason.responsibility", {
        rule: t(`resumatch.claimReview.rule.${issue.rule && RULES.has(issue.rule) ? issue.rule : "other"}`),
        where,
      });
    case "requirement_unmet":
      return t(`resumatch.claimReview.reason.requirement_unmet.${issue.unmetBy ?? "profile"}`, { requirement });
    case "requirement_not_in_role":
    case "requirement_not_found":
      return t(`resumatch.claimReview.reason.${issue.reason}`, { requirement, where });
    default:
      return t(`resumatch.claimReview.reason.${issue.reason}`, { term: issue.text, where });
  }
}

export function ClaimSummaryBar({
  open,
  gaps,
  onNext,
  onGaps,
  onlyFlagged,
  onOnlyFlagged,
}: {
  open: number;
  gaps: number;
  onNext: () => void;
  onGaps: () => void;
  onlyFlagged: boolean;
  onOnlyFlagged: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  if (open === 0 && gaps === 0) {
    return (
      <p className="rm-claim-summary rm-claim-summary--done" role="status" data-testid="claims-summary">
        {t("resumatch.claimReview.summary.done")}
      </p>
    );
  }
  return (
    <div className="rm-claim-summary" role="region" aria-label={t("resumatch.claimReview.card.why")} data-testid="claims-summary">
      <p className="rm-claim-summary__line" aria-live="polite">
        {open > 0 ? (
          <button type="button" className="rm-link-button" onClick={onNext} data-testid="claims-summary-issues">
            {t("resumatch.claimReview.summary.issues", { count: open })}
          </button>
        ) : null}
        {open > 0 && gaps > 0 ? <span aria-hidden="true"> · </span> : null}
        {gaps > 0 ? (
          <button type="button" className="rm-link-button" onClick={onGaps} data-testid="claims-summary-gaps">
            {t("resumatch.claimReview.summary.gaps", { count: gaps })}
          </button>
        ) : null}
      </p>
      {open > 0 ? <p className="rm-claim-summary__hint">{t("resumatch.claimReview.summary.hint")}</p> : null}
      <div className="rm-claim-summary__tools">
        {open > 0 ? (
          <button type="button" className="rm-small-button" onClick={onNext} data-testid="claims-review-next">
            {t("resumatch.claimReview.next")}
          </button>
        ) : null}
        <label className="rm-skill-toggle">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => onOnlyFlagged(e.target.checked)} data-testid="claims-only-flagged" />
          <span>{t("resumatch.claimReview.onlyFlagged")}</span>
        </label>
      </div>
    </div>
  );
}

/**
 * The claim's text with each issue's words as a button: the rest stays
 * plain, readable text. A whole-claim issue makes the whole text one
 * button.
 */
export function ClaimText({
  fieldKey,
  text,
  issues,
  activeId,
  onOpen,
}: {
  fieldKey: string;
  text: string;
  issues: ReviewIssue[];
  activeId: string | null;
  onOpen: (issueId: string) => void;
}) {
  const { t } = useTranslation();
  const sorted = [...issues].sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const issue of sorted) {
    if (issue.start < at || text.slice(issue.start, issue.end) !== issue.text) continue;
    if (issue.start > at) parts.push(text.slice(at, issue.start));
    const confirmed = issue.status === "confirmed";
    parts.push(
      <button
        key={issue.id}
        type="button"
        id={markId(fieldKey, issue.id)}
        className={`rm-claim-mark rm-claim-mark--${issue.status}`}
        aria-expanded={activeId === issue.id}
        aria-label={t(confirmed ? "resumatch.claimReview.markConfirmedLabel" : "resumatch.claimReview.markLabel", { text: issue.text })}
        onClick={() => onOpen(issue.id)}
        data-testid="claim-mark"
        data-status={issue.status}
      >
        {issue.text}
      </button>,
    );
    at = issue.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return (
    <p className="rm-claim-text" data-testid="claim-text">
      {parts}
    </p>
  );
}

export interface EvidenceSource {
  label: string;
  /** Where the candidate can see or change it, or null (evidence). */
  href: string | null;
}

export function ClaimCard({
  issue,
  location,
  where,
  source,
  removal,
  isBullet,
  onEdit,
  onRemove,
  onExclude,
  onConfirm,
  onUndo,
  onClose,
  disabled,
}: {
  issue: ReviewIssue;
  /** "Experience at Probex Belgium". */
  location: string;
  /** "your role at Probex Belgium". */
  where: string;
  source: (sourceId: string) => EvidenceSource;
  removal: Removal | null;
  isBullet: boolean;
  onEdit: () => void;
  onRemove: (text: string) => void;
  onExclude: () => void;
  onConfirm: (detail: string | null) => void;
  onUndo: () => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"idle" | "confirm" | "remove">("idle");
  const [detail, setDetail] = useState(issue.detail ?? "");
  const matches = issue.evidence.filter((e) => e.kind === "match");
  const context = issue.evidence.filter((e) => e.kind === "context");
  const titleKey =
    issue.status === "confirmed"
      ? "resumatch.claimReview.card.confirmedTitle"
      : issue.status === "excluded"
        ? "resumatch.claimReview.card.excludedTitle"
        : "resumatch.claimReview.card.title";
  const headingId = `${issue.id}-card`.replace(/[^A-Za-z0-9_-]/g, "_");

  return (
    <section className={`rm-claim-card rm-claim-card--${issue.status}`} aria-labelledby={headingId} data-testid="claim-card">
      <div className="rm-claim-card__head">
        <h4 id={headingId} className="rm-claim-card__title">
          {t(titleKey, { where: location })}
        </h4>
        <button type="button" className="rm-link-button" onClick={onClose}>
          {t("resumatch.claimReview.card.close")}
        </button>
      </div>
      <blockquote className="rm-claim-card__quote">“{issue.text}”</blockquote>

      <p className="rm-claim-card__label">{t("resumatch.claimReview.card.why")}</p>
      <p className="rm-claim-card__why" data-testid="claim-why">
        {reasonText(t, issue, where)}
      </p>

      <p className="rm-claim-card__label">{t("resumatch.claimReview.card.evidence")}</p>
      {matches.length === 0 ? <p className="rm-claim-card__none">{t("resumatch.claimReview.card.noEvidence")}</p> : null}
      {matches.map((ref) => {
        const s = source(ref.sourceId);
        return (
          <div key={`m:${ref.sourceId}`} className="rm-claim-card__evidence">
            <span>{t("resumatch.claimReview.card.found", { source: s.label })}</span> <q>{ref.excerpt}</q>
            {s.href ? (
              <>
                {" "}
                <a href={s.href} target="_blank" rel="noopener" className="rm-link-button">
                  {t("resumatch.claimReview.card.viewProfile")}
                </a>
              </>
            ) : null}
          </div>
        );
      })}
      {context.map((ref) => {
        const s = source(ref.sourceId);
        return (
          <div key={`c:${ref.sourceId}`} className="rm-claim-card__evidence rm-claim-card__evidence--context">
            <span>{t("resumatch.claimReview.card.roleContext")}</span> <q>{ref.excerpt}</q>
            {s.href ? (
              <>
                {" "}
                <a href={s.href} target="_blank" rel="noopener" className="rm-link-button">
                  {t("resumatch.claimReview.card.viewProfile")}
                </a>
              </>
            ) : null}
          </div>
        );
      })}

      {issue.status === "confirmed" ? (
        <div className="rm-claim-card__confirmed">
          <p>{t("resumatch.claimReview.confirmedNote")}</p>
          {issue.detail ? <p className="rm-claim-card__detail">“{issue.detail}”</p> : null}
          <p className="rm-claim-card__profile-note">
            {t("resumatch.claimReview.profileNote")}{" "}
            <a href="/profile#rm-sec-experience" target="_blank" rel="noopener" className="rm-link-button">
              {t("resumatch.claimReview.openProfile")}
            </a>
          </p>
          <div className="rm-claim-card__actions">
            <button type="button" className="rm-small-button" onClick={onUndo} disabled={disabled}>
              {t("resumatch.claimReview.action.undo")}
            </button>
          </div>
        </div>
      ) : mode === "confirm" ? (
        <div className="rm-claim-card__confirm">
          <label className="rm-claim-card__label" htmlFor={`${headingId}-detail`}>
            {t("resumatch.claimReview.detailLabel")}
          </label>
          <textarea
            id={`${headingId}-detail`}
            className="ui-input"
            rows={2}
            maxLength={MAX_CONFIRMED_DETAIL_CHARS}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            disabled={disabled}
          />
          <div className="rm-claim-card__actions">
            <button
              type="button"
              className="rm-small-button rm-small-button--primary"
              onClick={() => {
                onConfirm(detail.trim() || null);
                setMode("idle");
              }}
              disabled={disabled}
              data-testid="claim-confirm-save"
            >
              {t("resumatch.claimReview.action.confirmSave")}
            </button>
            <button type="button" className="rm-small-button" onClick={() => setMode("idle")} disabled={disabled}>
              {t("resumatch.claimReview.action.cancel")}
            </button>
          </div>
        </div>
      ) : mode === "remove" && removal ? (
        <div className="rm-claim-card__remove">
          <p className="rm-claim-card__label">{t("resumatch.claimReview.remove.preview")}</p>
          <p className="rm-claim-card__preview" data-testid="claim-remove-preview">
            {removal.text}
          </p>
          <div className="rm-claim-card__actions">
            <button
              type="button"
              className="rm-small-button rm-small-button--primary"
              onClick={() => {
                onRemove(removal.text.slice(0, isBullet ? MAX_BULLET_CHARS * 5 : 2000));
                setMode("idle");
              }}
              disabled={disabled}
              data-testid="claim-remove-apply"
            >
              {t("resumatch.claimReview.action.apply")}
            </button>
            <button type="button" className="rm-small-button" onClick={() => setMode("idle")} disabled={disabled}>
              {t("resumatch.claimReview.action.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="rm-claim-card__ask">
            {t(confirmQuestionKey(issue.reason), { term: issue.text, where, requirement: issue.requirementText ?? issue.text })}
          </p>
          <div className="rm-claim-card__actions">
            <button type="button" className="rm-small-button" onClick={() => setMode("confirm")} disabled={disabled} data-testid="claim-confirm">
              {t("resumatch.claimReview.action.confirm")}
            </button>
            <button type="button" className="rm-small-button" onClick={onEdit} disabled={disabled} data-testid="claim-edit">
              {t("resumatch.claimReview.action.edit")}
            </button>
            {removal ? (
              <button type="button" className="rm-small-button" onClick={() => setMode("remove")} disabled={disabled} data-testid="claim-remove">
                {t("resumatch.claimReview.action.remove")}
              </button>
            ) : null}
            {isBullet && issue.status !== "excluded" ? (
              <button type="button" className="rm-small-button" onClick={onExclude} disabled={disabled} data-testid="claim-exclude">
                {t("resumatch.claimReview.action.exclude")}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

export function RequirementGaps({
  gaps,
  roles,
  onDecide,
  onAdd,
  disabled,
}: {
  gaps: RequirementGap[];
  roles: { index: number; label: string }[];
  onDecide: (requirementId: string, decision: RequirementGap["decision"]) => void;
  /** Adds the candidate's own bullet to a role and marks the gap added. */
  onAdd: (requirementId: string, roleIndex: number, text: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<string | null>(null);
  const [role, setRole] = useState<number>(roles[0]?.index ?? 0);
  const [text, setText] = useState("");
  if (gaps.length === 0) return null;
  return (
    <div className="rm-review__section rm-claim-gaps" id="rm-claim-gaps" data-review-item data-needs-review={gaps.some((g) => g.decision === "open") || undefined} data-testid="claim-gaps">
      <span className="rm-review__section-label">{t("resumatch.claimReview.gaps.title")}</span>
      <p className="rm-claim-gaps__hint">{t("resumatch.claimReview.gaps.hint")}</p>
      <ul className="rm-claim-gaps__list">
        {gaps.map((gap) => (
          <li key={gap.requirementId} className={`rm-claim-gap rm-claim-gap--${gap.decision}`} data-testid="claim-gap">
            <p className="rm-claim-gap__text">“{gap.text}”</p>
            {gap.decision === "open" ? (
              adding === gap.requirementId ? (
                <div className="rm-claim-gap__form">
                  {roles.length > 1 ? (
                    <label className="rm-claim-card__label">
                      {t("resumatch.claimReview.gaps.role")}
                      <select className="ui-input" value={role} onChange={(e) => setRole(Number(e.target.value))} disabled={disabled}>
                        {roles.map((r) => (
                          <option key={r.index} value={r.index}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="rm-claim-card__label" htmlFor={`gap-${gap.requirementId}`}>
                    {t("resumatch.claimReview.gaps.text")}
                  </label>
                  <textarea
                    id={`gap-${gap.requirementId}`}
                    className="ui-input"
                    rows={2}
                    maxLength={MAX_BULLET_CHARS}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={disabled}
                  />
                  <div className="rm-claim-card__actions">
                    <button
                      type="button"
                      className="rm-small-button rm-small-button--primary"
                      disabled={disabled || !text.trim()}
                      onClick={() => {
                        onAdd(gap.requirementId, role, text.trim());
                        setAdding(null);
                        setText("");
                      }}
                    >
                      {t("resumatch.claimReview.gaps.addSave")}
                    </button>
                    <button type="button" className="rm-small-button" onClick={() => setAdding(null)} disabled={disabled}>
                      {t("resumatch.claimReview.action.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rm-claim-card__actions">
                  {roles.length > 0 ? (
                    <button type="button" className="rm-small-button" onClick={() => setAdding(gap.requirementId)} disabled={disabled}>
                      {t("resumatch.claimReview.gaps.add")}
                    </button>
                  ) : null}
                  <button type="button" className="rm-small-button" onClick={() => onDecide(gap.requirementId, "left_out")} disabled={disabled} data-testid="claim-gap-leave">
                    {t("resumatch.claimReview.gaps.leaveOut")}
                  </button>
                </div>
              )
            ) : (
              <p className="rm-claim-gap__done">
                {t(gap.decision === "added" ? "resumatch.claimReview.gaps.added" : "resumatch.claimReview.gaps.leftOut")}{" "}
                <button type="button" className="rm-link-button" onClick={() => onDecide(gap.requirementId, "open")} disabled={disabled}>
                  {t("resumatch.claimReview.gaps.undo")}
                </button>
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SaveImpactItem {
  kind: "excluded" | "removed" | "fallback" | "kept";
  location: string;
  /** Field name for "removed"/"fallback" ("summary"). */
  field?: string;
  text: string;
  targetId: string | null;
}

/** What Save will do with the claims still open (#964). */
export function SaveImpact({ items, confirmed, onJump }: { items: SaveImpactItem[]; confirmed: number; onJump: (id: string) => void }) {
  const { t } = useTranslation();
  if (items.length === 0 && confirmed === 0) return null;
  const group = (kind: SaveImpactItem["kind"]) => items.filter((i) => i.kind === kind);
  const list = (rows: SaveImpactItem[]) => (
    <ul className="rm-claim-impact__list">
      {rows.map((row, i) => (
        <li key={`${row.kind}-${i}`}>
          <span className="rm-claim-impact__where">{row.location}:</span>{" "}
          {row.targetId ? (
            <button type="button" className="rm-link-button" onClick={() => onJump(row.targetId!)}>
              “{row.text}”
            </button>
          ) : (
            <span>“{row.text}”</span>
          )}
        </li>
      ))}
    </ul>
  );
  const removed = group("removed");
  const fallback = group("fallback");
  return (
    <div className="rm-claim-impact" data-testid="claims-save-impact" role="region" aria-label={t("resumatch.claimReview.save.title")}>
      <p className="rm-claim-impact__title">{t("resumatch.claimReview.save.title")}</p>
      {group("excluded").length > 0 ? (
        <>
          <p>{t("resumatch.claimReview.save.excluded")}</p>
          {list(group("excluded"))}
        </>
      ) : null}
      {[...new Set(removed.map((r) => r.field!))].map((field) => (
        <div key={`r-${field}`}>
          <p>{t("resumatch.claimReview.save.removed", { field })}</p>
          {list(removed.filter((r) => r.field === field))}
        </div>
      ))}
      {fallback.map((row, i) => (
        <p key={`f-${i}`}>{t("resumatch.claimReview.save.fallback", { field: row.field ?? "" })}</p>
      ))}
      {group("kept").length > 0 ? (
        <>
          <p>{t("resumatch.claimReview.save.kept")}</p>
          {list(group("kept"))}
        </>
      ) : null}
      {confirmed > 0 ? <p>{t("resumatch.claimReview.save.confirmed", { count: confirmed })}</p> : null}
    </div>
  );
}
