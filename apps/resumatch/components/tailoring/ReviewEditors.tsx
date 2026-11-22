"use client";

import { useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  canonicalSkill,
  MAX_ADDED_SKILLS,
  MAX_BULLET_CHARS,
  MAX_BULLETS_PER_ROLE,
  MAX_CV_BULLET_CHARS,
  MAX_CV_SKILLS,
  MAX_SKILL_CHARS,
} from "../../lib/tailoring/candidateEdits";
import { acceptedBulletCount, cleanSkillInput, isOwnBullet, type ReviewBullet } from "../../lib/tailoring/reviewEdits";

/**
 * The hand-editing parts of the Tailor review (2026-11-22): the skills on
 * this CV (reorder toward the job, remove, add) and one role's bullets
 * (tick, rewrite, add, delete). State lives in TailorFlow; these only
 * render it and report changes.
 */

export function ReviewSkillsEditor({
  baseSkills,
  canReorder,
  reorder,
  onReorderChange,
  removedSkills,
  addedSkills,
  onRemovedChange,
  onAddedChange,
  disabled,
}: {
  /** The profile's skills in the order currently chosen. */
  baseSkills: string[];
  canReorder: boolean;
  reorder: boolean;
  onReorderChange: (value: boolean) => void;
  removedSkills: string[];
  addedSkills: string[];
  onRemovedChange: (next: string[]) => void;
  onAddedChange: (next: string[]) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const removedKeys = new Set(removedSkills.map(canonicalSkill));
  const kept = baseSkills.filter((name) => !removedKeys.has(canonicalSkill(name)));
  const onCv = [...kept, ...addedSkills];

  const add = () => {
    const name = cleanSkillInput(draft);
    if (!name) return;
    const key = canonicalSkill(name);
    const removedMatch = baseSkills.find((s) => canonicalSkill(s) === key && removedKeys.has(key));
    if (removedMatch) {
      // Typing back a skill they removed just puts the profile one back.
      onRemovedChange(removedSkills.filter((s) => canonicalSkill(s) !== key));
      setDraft("");
      setMessage(null);
      return;
    }
    if (onCv.some((s) => canonicalSkill(s) === key)) {
      setMessage(t("resumatch.review.skills.duplicate", { skill: name }));
      return;
    }
    if (addedSkills.length >= MAX_ADDED_SKILLS) {
      setMessage(t("resumatch.review.skills.limit", { max: MAX_ADDED_SKILLS }));
      return;
    }
    if (onCv.length >= MAX_CV_SKILLS) {
      setMessage(t("resumatch.review.skills.full", { max: MAX_CV_SKILLS }));
      return;
    }
    onAddedChange([...addedSkills, name]);
    setDraft("");
    setMessage(null);
  };

  return (
    <div className="rm-review__section" data-testid="review-skills">
      <span className="rm-review__section-label">{t("resumatch.review.skills")}</span>
      {canReorder ? (
        <label className="rm-skill-toggle">
          <input
            type="checkbox"
            checked={reorder}
            onChange={(e) => onReorderChange(e.target.checked)}
            disabled={disabled}
          />
          <span>{t("resumatch.review.reorderSkills")}</span>
        </label>
      ) : null}

      <ul className="rm-skill-chips" aria-label={t("resumatch.review.skills")}>
        {kept.map((skill) => (
          <li key={`p:${skill}`} className="rm-skill-chip">
            <span>{skill}</span>
            <button
              type="button"
              className="rm-skill-chip__x"
              onClick={() => onRemovedChange([...removedSkills, skill])}
              disabled={disabled}
              aria-label={t("resumatch.review.skills.remove", { skill })}
              title={t("resumatch.review.skills.remove", { skill })}
            >
              ×
            </button>
          </li>
        ))}
        {addedSkills.map((skill) => (
          <li key={`a:${skill}`} className="rm-skill-chip rm-skill-chip--own">
            <span>{skill}</span>
            <span className="rm-skill-chip__tag">{t("resumatch.review.yours")}</span>
            <button
              type="button"
              className="rm-skill-chip__x"
              onClick={() => onAddedChange(addedSkills.filter((s) => s !== skill))}
              disabled={disabled}
              aria-label={t("resumatch.review.skills.remove", { skill })}
              title={t("resumatch.review.skills.remove", { skill })}
            >
              ×
            </button>
          </li>
        ))}
        {onCv.length === 0 ? <li className="rm-skill-chips__empty">{t("resumatch.review.skills.none")}</li> : null}
      </ul>

      {removedSkills.length > 0 ? (
        <p className="rm-skill-removed">
          <span>{t("resumatch.review.skills.removed")}</span>
          {removedSkills.map((skill) => (
            <button
              key={skill}
              type="button"
              className="rm-skill-restore"
              onClick={() => onRemovedChange(removedSkills.filter((s) => s !== skill))}
              disabled={disabled}
              aria-label={t("resumatch.review.skills.restore", { skill })}
              title={t("resumatch.review.skills.restore", { skill })}
            >
              ↺ {skill}
            </button>
          ))}
        </p>
      ) : null}

      <div className="rm-skill-add">
        <label htmlFor="rm-skill-add-input" className="rm-skill-add__label">
          {t("resumatch.review.skills.addLabel")}
        </label>
        <div className="rm-skill-add__row">
          <input
            id="rm-skill-add-input"
            type="text"
            value={draft}
            maxLength={MAX_SKILL_CHARS}
            placeholder={t("resumatch.review.skills.addPlaceholder")}
            onChange={(e) => {
              setDraft(e.target.value);
              setMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            disabled={disabled}
            aria-describedby={message ? "rm-skill-add-msg" : undefined}
          />
          <button type="button" className="rm-small-button" onClick={add} disabled={disabled || !cleanSkillInput(draft)}>
            {t("resumatch.review.skills.add")}
          </button>
        </div>
        {message ? (
          <p id="rm-skill-add-msg" className="rm-skill-add__msg" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A bullet's text box that grows to fit its text at any width. */
function GrowingTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [props.value]);
  return <textarea ref={ref} rows={2} {...props} />;
}

export function ReviewBulletsEditor({
  role,
  bullets,
  onChange,
  onAdd,
  disabled,
}: {
  /** "Title · Employer", for labels. */
  role: string;
  bullets: ReviewBullet[];
  onChange: (key: string, patch: Partial<ReviewBullet> | null) => void;
  onAdd: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const full = acceptedBulletCount(bullets) >= MAX_BULLETS_PER_ROLE;
  const noneTicked = bullets.length > 0 && acceptedBulletCount(bullets) === 0;

  return (
    <>
      {bullets.length > 0 ? (
        <ul className="rm-bullet-list">
          {bullets.map((bullet, index) => {
            const own = bullet.aiText === null;
            const edited = !own && isOwnBullet(bullet);
            return (
              <li
                key={bullet.key}
                data-bullet-key={bullet.key}
                className={`rm-bullet-item rm-bullet-item--editable${bullet.accepted ? "" : " rm-bullet-item--unaccepted"}`}
              >
                <input
                  type="checkbox"
                  checked={bullet.accepted}
                  onChange={() => onChange(bullet.key, { accepted: !bullet.accepted })}
                  disabled={disabled || (!bullet.accepted && full)}
                  aria-label={t("resumatch.review.bullet.keep", { n: index + 1, role })}
                />
                <div className="rm-bullet-item__body">
                  <GrowingTextarea
                    className="rm-bullet-item__text"
                    value={bullet.text}
                    maxLength={
                      own ? MAX_BULLET_CHARS : Math.min(MAX_CV_BULLET_CHARS, Math.max(MAX_BULLET_CHARS, bullet.aiText?.length ?? 0))
                    }
                    onChange={(e) => onChange(bullet.key, { text: e.target.value })}
                    disabled={disabled}
                    aria-label={t("resumatch.review.bullet.text", { n: index + 1, role })}
                    placeholder={own ? t("resumatch.review.bullet.placeholder") : undefined}
                    data-own={own || edited ? "true" : undefined}
                  />
                  {own || edited || bullet.fromProfile ? (
                    <div className="rm-bullet-item__meta">
                      <span className="rm-skill-chip__tag">
                        {own
                          ? t("resumatch.review.yours")
                          : edited
                            ? t("resumatch.review.bullet.edited")
                            : t("resumatch.review.bullet.fromProfile")}
                      </span>
                      {edited ? (
                        <button
                          type="button"
                          className="rm-link-button"
                          onClick={() => onChange(bullet.key, { text: bullet.aiText ?? "" })}
                          disabled={disabled}
                        >
                          {t("resumatch.review.bullet.undo")}
                        </button>
                      ) : own ? (
                        <button
                          type="button"
                          className="rm-link-button"
                          onClick={() => onChange(bullet.key, null)}
                          disabled={disabled}
                        >
                          {t("resumatch.review.bullet.delete")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {noneTicked ? <p className="rm-bullet-add__hint">{t("resumatch.review.bullet.fallback")}</p> : null}
      <div className="rm-bullet-add">
        <button type="button" className="rm-small-button" onClick={onAdd} disabled={disabled || full}>
          {t("resumatch.review.bullet.add")}
        </button>
        {full ? <span className="rm-bullet-add__hint">{t("resumatch.review.bullet.limit", { max: MAX_BULLETS_PER_ROLE })}</span> : null}
      </div>
    </>
  );
}
