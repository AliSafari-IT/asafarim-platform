"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { PROFESSIONAL_EVIDENCE_KINDS, MAX_EVIDENCE_DETAIL_CHARS, MAX_EVIDENCE_TITLE_CHARS, type EvidenceKind } from "../../lib/evidence/contract";
import { FEEDBACK_REASONS, type FeedbackItem, type FeedbackReason } from "../../lib/tailoring/feedback";
import { MAX_BACKGROUND_PROMOTIONS, suggestEvidenceTitle } from "../../lib/tailoring/feedbackScope";
import { factualStyleIssue, MAX_STYLE_NOTE_CHARS } from "../../lib/writingPreferences/contract";

/**
 * #932 on the Tailor review: what the candidate changed from the AI's
 * suggestions, an optional reason for each change, and the two explicit
 * "remember" actions. By default everything applies to this application
 * only; nothing here is saved before the candidate presses Save, and
 * nothing is inferred from an edit.
 */

export interface BackgroundDraft {
  kind: EvidenceKind;
  title: string;
  detail: string;
}

export interface PreferenceDraft {
  cvStyleNote: string;
  letterStyleNote: string;
}

/** A bullet the candidate wrote or rewrote and kept on this CV. */
export interface OwnBulletChoice {
  /** The review bullet's key. */
  key: string;
  role: string;
  text: string;
}

export function FeedbackPanel({
  items,
  labelFor,
  reasons,
  onReasonChange,
  ownBullets,
  background,
  onBackgroundChange,
  preference,
  onPreferenceChange,
  savedNotes,
  includeLetter,
  disabled,
}: {
  items: FeedbackItem[];
  labelFor: (key: string) => string;
  reasons: Record<string, FeedbackReason>;
  onReasonChange: (key: string, reason: FeedbackReason | null) => void;
  ownBullets: OwnBulletChoice[];
  background: Record<string, BackgroundDraft>;
  onBackgroundChange: (key: string, draft: BackgroundDraft | null) => void;
  preference: PreferenceDraft | null;
  onPreferenceChange: (draft: PreferenceDraft | null) => void;
  savedNotes: { cv: string | null; letter: string | null };
  includeLetter: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const changed = items.filter((item) => item.decision !== "accepted");
  const kept = items.length - changed.length;
  const chosen = ownBullets.filter((b) => background[b.key]).length;

  const noteIssue = (note: string) =>
    note.trim() && factualStyleIssue(note) ? t("resumatch.writing.error.style_note_factual") : null;

  return (
    <section className="rm-feedback" aria-labelledby="rm-feedback-title" data-testid="feedback-panel">
      <h3 id="rm-feedback-title" className="rm-review__section-label">
        {t("resumatch.feedback.title")}
      </h3>
      <p className="rm-evidence__hint">{t("resumatch.feedback.intro")}</p>

      {items.length > 0 ? (
        <p className="rm-feedback__summary" data-testid="feedback-summary">
          {changed.length === 0
            ? t("resumatch.feedback.allKept", { count: kept })
            : t("resumatch.feedback.counts", { kept, changed: changed.length })}
        </p>
      ) : null}

      {changed.length > 0 ? (
        <ul className="rm-feedback__list">
          {changed.map((item) => (
            <li key={item.key} className="rm-feedback__item" data-testid="feedback-item" data-key={item.key}>
              <span className="rm-feedback__label">{labelFor(item.key)}</span>
              <span className={`rm-feedback__badge rm-feedback__badge--${item.decision}`}>
                {t(`resumatch.feedback.decision.${item.decision}`)}
              </span>
              <label className="rm-feedback__reason">
                <span>{t("resumatch.feedback.reason")}</span>
                <select
                  className="ui-input ui-select"
                  value={reasons[item.key] ?? ""}
                  onChange={(e) => onReasonChange(item.key, (e.target.value || null) as FeedbackReason | null)}
                  disabled={disabled}
                  aria-label={t("resumatch.feedback.reasonFor", { field: labelFor(item.key) })}
                >
                  <option value="">{t("resumatch.feedback.reason.none")}</option>
                  {FEEDBACK_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {t(`resumatch.feedback.reason.${reason}`)}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="rm-feedback__scope-note">{t("resumatch.feedback.applicationOnly")}</p>

      {ownBullets.length > 0 ? (
        <div className="rm-feedback__group" data-testid="feedback-background">
          <h4 className="rm-evidence__group">{t("resumatch.feedback.background.title")}</h4>
          <p className="rm-evidence__hint">{t("resumatch.feedback.background.hint")}</p>
          <ul className="rm-evidence__list">
            {ownBullets.map((bullet) => {
              const draft = background[bullet.key];
              const idBase = `rm-fb-bg-${bullet.key}`;
              return (
                <li key={bullet.key} className="rm-evidence__item" data-testid="feedback-background-item">
                  <div className="rm-evidence__head">
                    <span className="rm-evidence__role">{bullet.role}</span>
                  </div>
                  <p className="rm-evidence__detail">{bullet.text}</p>
                  {draft ? (
                    <div className="rm-evidence__form" role="group" aria-labelledby={`${idBase}-legend`}>
                      <p id={`${idBase}-legend`} className="rm-feedback__proposal">
                        {t("resumatch.feedback.background.proposal", { role: bullet.role })}
                      </p>
                      <label className="jm-field">
                        <span className="rm-review__section-label">{t("resumatch.evidence.form.kind")}</span>
                        <select
                          className="ui-input ui-select"
                          value={draft.kind}
                          onChange={(e) => onBackgroundChange(bullet.key, { ...draft, kind: e.target.value as EvidenceKind })}
                          disabled={disabled}
                        >
                          {PROFESSIONAL_EVIDENCE_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {t(`resumatch.evidence.kind.${kind}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="jm-field">
                        <span className="rm-review__section-label">{t("resumatch.evidence.form.title")}</span>
                        <input
                          className="ui-input"
                          type="text"
                          value={draft.title}
                          maxLength={MAX_EVIDENCE_TITLE_CHARS}
                          onChange={(e) => onBackgroundChange(bullet.key, { ...draft, title: e.target.value })}
                          disabled={disabled}
                        />
                      </label>
                      <label className="jm-field">
                        <span className="rm-review__section-label">{t("resumatch.evidence.form.detail")}</span>
                        <textarea
                          className="ui-input"
                          rows={3}
                          value={draft.detail}
                          maxLength={MAX_EVIDENCE_DETAIL_CHARS}
                          onChange={(e) => onBackgroundChange(bullet.key, { ...draft, detail: e.target.value })}
                          disabled={disabled}
                        />
                      </label>
                      <div className="rm-evidence__actions">
                        <button
                          type="button"
                          className="rm-small-button"
                          onClick={() => onBackgroundChange(bullet.key, null)}
                          disabled={disabled}
                        >
                          {t("resumatch.feedback.background.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rm-evidence__actions">
                      <button
                        type="button"
                        className="rm-small-button"
                        onClick={() =>
                          onBackgroundChange(bullet.key, {
                            kind: "ACHIEVEMENT",
                            title: suggestEvidenceTitle(bullet.text),
                            detail: bullet.text.slice(0, MAX_EVIDENCE_DETAIL_CHARS),
                          })
                        }
                        disabled={disabled || chosen >= MAX_BACKGROUND_PROMOTIONS}
                      >
                        {t("resumatch.feedback.background.add")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {chosen >= MAX_BACKGROUND_PROMOTIONS ? (
            <p className="rm-evidence__hint">{t("resumatch.feedback.background.limit", { max: MAX_BACKGROUND_PROMOTIONS })}</p>
          ) : null}
        </div>
      ) : null}

      <div className="rm-feedback__group" data-testid="feedback-preference">
        <h4 className="rm-evidence__group">{t("resumatch.feedback.preference.title")}</h4>
        {preference ? (
          <div className="rm-evidence__form" role="group" aria-labelledby="rm-fb-pref-legend">
            <p id="rm-fb-pref-legend" className="rm-feedback__proposal">
              {t("resumatch.feedback.preference.proposal")}
            </p>
            {(
              [
                ["cv", "cvStyleNote", savedNotes.cv],
                ...(includeLetter ? ([["letter", "letterStyleNote", savedNotes.letter]] as const) : []),
              ] as const
            ).map(([artifact, field, current]) => {
              const value = preference[field];
              const issue = noteIssue(value);
              const id = `rm-fb-pref-${artifact}`;
              return (
                <label key={artifact} className="jm-field" htmlFor={id}>
                  <span className="rm-review__section-label">
                    {t(artifact === "cv" ? "resumatch.feedback.preference.cv" : "resumatch.feedback.preference.letter")}
                  </span>
                  <small className="rm-evidence__hint" id={`${id}-now`}>
                    {current ? t("resumatch.feedback.preference.now", { note: current }) : t("resumatch.feedback.preference.nowNone")}
                  </small>
                  <textarea
                    id={id}
                    className="ui-input"
                    rows={2}
                    value={value}
                    maxLength={MAX_STYLE_NOTE_CHARS}
                    placeholder={t(
                      artifact === "cv" ? "resumatch.writing.styleNote.cvPlaceholder" : "resumatch.writing.styleNote.letterPlaceholder",
                    )}
                    onChange={(e) => onPreferenceChange({ ...preference, [field]: e.target.value })}
                    disabled={disabled}
                    aria-describedby={issue ? `${id}-now ${id}-issue` : `${id}-now`}
                  />
                  {issue ? (
                    <small id={`${id}-issue`} className="rm-claim-flag">
                      {issue}
                    </small>
                  ) : null}
                </label>
              );
            })}
            <div className="rm-evidence__actions">
              <button type="button" className="rm-small-button" onClick={() => onPreferenceChange(null)} disabled={disabled}>
                {t("resumatch.feedback.preference.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="rm-evidence__hint">{t("resumatch.feedback.preference.hint")}</p>
            <div className="rm-evidence__actions">
              <button
                type="button"
                className="rm-small-button"
                onClick={() => onPreferenceChange({ cvStyleNote: savedNotes.cv ?? "", letterStyleNote: savedNotes.letter ?? "" })}
                disabled={disabled}
              >
                {t("resumatch.feedback.preference.add")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
