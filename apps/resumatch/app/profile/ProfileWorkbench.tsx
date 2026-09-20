"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card } from "@asafarim/ui";
import { LOW_CONFIDENCE_THRESHOLD } from "../../lib/profile/contract";
import type {
  CandidateProfileContent,
  CertificationEntry,
  EducationEntry,
  ExperienceEntry,
  LanguageEntry,
  ProfileConfidence,
} from "../../lib/profile/contract";
import { AwardIcon, BriefcaseIcon, GlobeIcon, GraduationCapIcon, TrashIcon } from "./icons";
import type { SummaryTone } from "../../lib/profile/ai/provider";
import { categorizeSkill, groupSkillsByCategory, SKILL_CATEGORIES } from "../../lib/profile/skillCategories";
import { parseSkillsFreeText } from "../../lib/profile/parseSkillsText";

/**
 * Profile review and correction (JM-021).
 *
 * The screen is built around one idea: **the extractor is a typing aid, not
 * an authority.** So it never presents extracted data as settled. Fields
 * the extractor guessed at are marked, the source of every value is stated,
 * and nothing reaches matching until the candidate presses Confirm.
 *
 * Uncertainty is shown as "check this", not as a percentage. The confidence
 * numbers are a three-tier ranking of how much structure the extractor had
 * to work with, not calibrated probabilities, and rendering them as "45%
 * confident" would claim a precision that does not exist.
 */

/** A candidate typing how long a qualification took ("2016-2020") is a much
 *  more natural instinct than typing when it finished ("2020"), but
 *  `educationSchema.completedOn` only accepts a single year or year-month
 *  (see lib/profile/contract.ts's YEAR_MONTH) — a span fails validation and,
 *  until this normalizer, surfaced only as a generic "could not be saved"
 *  error with no indication of which field was wrong. Silently keeping the
 *  end year on blur turns the common case into something that just works. */
function normalizeCompletedOn(value: string): string {
  const span = /^\s*\d{4}\s*[-–—]\s*(\d{4})\s*$/.exec(value);
  return span ? span[1] : value;
}

export interface ProfileWorkbenchProps {
  initialContent: CandidateProfileContent;
  initialConfidence: ProfileConfidence;
  versionId: string | null;
  versionNumber: number | null;
  isConfirmed: boolean;
  hasDocument: boolean;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "saved"; confirmed: boolean };

/** Split a free-typed list on commas or newlines, trimming and dropping
 *  blanks — shared by every parsed-list field so the "how many entries did
 *  the user actually type" count used for the over-limit warning is always
 *  the exact same count that gets sliced and saved. */
function parseEntries(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A safe-enough ISO-639-ish code for a manually-added language: the
 *  schema only requires 2-16 characters, and this field is never read for
 *  anything beyond display and de-duplication during extraction, so a
 *  slug of the label the candidate typed is sufficient. */
function codeFromLabel(label: string): string {
  const slug = label.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 16);
  return slug.length >= 2 ? slug : slug.padEnd(2, "x");
}

function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

function replaceAt<T>(list: T[], index: number, item: T): T[] {
  return list.map((existing, i) => (i === index ? item : existing));
}

function needsReview(confidence: ProfileConfidence, field: string): boolean {
  const score = confidence[field];
  return score !== undefined && score < LOW_CONFIDENCE_THRESHOLD;
}

function FieldLabel({ label, confidence, field }: { label: string; confidence: ProfileConfidence; field: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span>{label}</span>
      {needsReview(confidence, field) ? (
        <Badge tone="warning">check this</Badge>
      ) : confidence[field] !== undefined ? (
        <Badge tone="neutral">from your CV</Badge>
      ) : null}
    </span>
  );
}

export function ProfileWorkbench({
  initialContent,
  initialConfidence,
  versionId,
  versionNumber,
  isConfirmed,
  hasDocument,
}: ProfileWorkbenchProps) {
  const [content, setContent] = useState<CandidateProfileContent>(initialContent);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);
  // Skills and excluded-employers are free-typed lists, parsed into
  // structured data on every keystroke. The textarea's own text must be its
  // own state, not re-derived by rejoining the parsed array: typing a
  // trailing comma, newline, or run of whitespace to start the *next* entry
  // parses back to the *same* array as before that keystroke (an empty
  // trailing segment is dropped), so a value bound to the rejoined array
  // would snap back and silently eat exactly what was just typed —
  // rendering the field un-typable past the first couple of entries.
  const [skillsText, setSkillsText] = useState(() =>
    initialContent.skills.map((skill) => skill.name).join(", "),
  );
  const [excludedEmployersText, setExcludedEmployersText] = useState(() =>
    initialContent.preferences.excludedEmployers.join(", "),
  );
  const confidence = initialConfidence;
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [tone, setTone] = useState<SummaryTone>("friendly");
  const [rewriteState, setRewriteState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "preview"; text: string; degraded: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const update = useCallback(<K extends keyof CandidateProfileContent>(key: K, value: CandidateProfileContent[K]) => {
    setContent((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  }, []);

  const requestRewrite = useCallback(async () => {
    const currentSummary = content.summary?.trim();
    if (!currentSummary) return;

    setRewriteState({ kind: "loading" });
    try {
      const response = await fetch("/api/profile/summary/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentSummary, tone }),
      });
      const body = (await response.json()) as { rewritten?: string; degraded?: boolean; error?: string };
      if (!response.ok || !body.rewritten) {
        setRewriteState({ kind: "error", message: body.error ?? "That summary could not be rewritten." });
        return;
      }
      // A candidate reviews and explicitly accepts or rejects this — it
      // never touches `content.summary` on its own, the same "nothing is
      // used until you confirm it" posture the rest of this form follows.
      setRewriteState({ kind: "preview", text: body.rewritten, degraded: body.degraded ?? false });
    } catch {
      setRewriteState({ kind: "error", message: "That summary could not be rewritten. Check your connection and try again." });
    }
  }, [content.summary, tone]);

  const save = useCallback(
    async (confirm: boolean) => {
      setState({ kind: "saving" });
      try {
        // Rows added with "+ Add ..." and never filled in are dropped here
        // rather than sent — the schema requires a title/label, and a
        // candidate who added a row then changed their mind should not see
        // a validation error for leaving it empty.
        const submitted: CandidateProfileContent = {
          ...content,
          languages: content.languages.filter((language) => language.label.trim().length > 0),
          experience: content.experience.filter((role) => role.title.trim().length > 0),
          education: content.education.filter((entry) => entry.qualification.trim().length > 0),
          certifications: content.certifications.filter((entry) => entry.name.trim().length > 0),
        };
        const response = await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: submitted, parentVersionId: versionId, confirm }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          setState({ kind: "error", message: body.error ?? "This profile could not be saved." });
          return;
        }
        setDirty(false);
        setState({ kind: "saved", confirmed: confirm });
        // Pull the new version down so the next edit records the version
        // just written as its parent. Without this, a second save in the
        // same session posts the already-superseded parentVersionId and the
        // recorded lineage is wrong — which is the one thing immutable
        // versions exist to get right.
        router.refresh();
      } catch {
        setState({ kind: "error", message: "This profile could not be saved. Check your connection and try again." });
      }
    },
    [content, versionId, router],
  );

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void save(true);
      }}
    >
      {isConfirmed && !dirty ? (
        <Alert tone="info">
          <strong>This profile is confirmed.</strong> It is the version ResuMatch tailors from when
          you paste a job URL. Editing it creates a new version — the confirmed one stays on record
          so a past tailored CV remains explainable.
        </Alert>
      ) : (
        <Alert tone="warning">
          <strong>Nothing is used until you confirm it.</strong>{" "}
          {hasDocument
            ? "These fields were read from your CV automatically and some of them will be wrong. Correct anything that is off, then confirm."
            : "Fill in what is relevant and confirm when you are ready."}
        </Alert>
      )}

      <div className="jm-grid" style={{ margin: "1.5rem 0" }}>
        <Card title="About you">
          <label className="jm-field">
            <FieldLabel label="Full name" confidence={confidence} field="fullName" />
            <input
              type="text"
              value={content.fullName ?? ""}
              onChange={(event) => update("fullName", event.target.value || null)}
              maxLength={160}
            />
          </label>

          <label className="jm-field">
            <FieldLabel label="Email" confidence={confidence} field="email" />
            <input
              type="email"
              value={content.email ?? ""}
              onChange={(event) => update("email", event.target.value || null)}
              maxLength={320}
            />
          </label>

          <label className="jm-field">
            <FieldLabel label="Phone" confidence={confidence} field="phone" />
            <input
              type="tel"
              value={content.phone ?? ""}
              onChange={(event) => update("phone", event.target.value || null)}
              maxLength={40}
            />
          </label>

          <label className="jm-field">
            <FieldLabel label="Headline" confidence={confidence} field="headline" />
            <input
              type="text"
              value={content.headline ?? ""}
              onChange={(event) => update("headline", event.target.value || null)}
              maxLength={200}
              placeholder="Senior .NET / React Developer"
            />
          </label>

          <label className="jm-field">
            <FieldLabel label="Summary" confidence={confidence} field="summary" />
            <textarea
              rows={4}
              value={content.summary ?? ""}
              onChange={(event) => update("summary", event.target.value || null)}
              maxLength={4000}
              placeholder="A couple of sentences about what you do and what you're looking for next."
            />
          </label>

          <div className="jm-rewrite">
            <div className="jm-rewrite__controls">
              <select
                aria-label="Rewrite tone"
                value={tone}
                onChange={(event) => setTone(event.target.value as SummaryTone)}
                disabled={rewriteState.kind === "loading"}
              >
                <option value="friendly">Friendly</option>
                <option value="official">Official</option>
                <option value="confident">Confident</option>
                <option value="concise">Concise</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={rewriteState.kind === "loading" || !content.summary?.trim()}
                onClick={() => void requestRewrite()}
              >
                {rewriteState.kind === "loading" ? "Rewriting…" : "Suggest a rewrite"}
              </Button>
            </div>

            {rewriteState.kind === "error" ? (
              <Alert tone="error">{rewriteState.message}</Alert>
            ) : null}

            {rewriteState.kind === "preview" ? (
              <div className="jm-rewrite__preview">
                {rewriteState.degraded ? (
                  <p className="jm-rewrite__note">
                    No AI rewrite is configured for this deployment, so this is your text unchanged. You can still
                    accept or reject it.
                  </p>
                ) : null}
                <p className="jm-rewrite__text">{rewriteState.text}</p>
                <div className="jm-rewrite__actions">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      update("summary", rewriteState.text);
                      setRewriteState({ kind: "idle" });
                    }}
                  >
                    Accept
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRewriteState({ kind: "idle" })}>
                    Reject
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <label className="jm-field">
            <span>Where you are based</span>
            <input
              type="text"
              value={content.baseLocation ?? ""}
              onChange={(event) => update("baseLocation", event.target.value || null)}
              maxLength={120}
              placeholder="Hasselt, Belgium"
            />
          </label>

          <label className="jm-field">
            <span>Right to work</span>
            <select
              value={content.workAuthorization ?? ""}
              onChange={(event) =>
                update(
                  "workAuthorization",
                  (event.target.value || null) as CandidateProfileContent["workAuthorization"],
                )
              }
            >
              <option value="">Prefer not to say</option>
              <option value="eea_unrestricted">I can work in the EEA without sponsorship</option>
              <option value="national_permit">I hold a national work permit</option>
              <option value="requires_sponsorship">I would need sponsorship</option>
            </select>
            <small>
              Kept with your profile for your own reference. It is not currently included in a
              tailored CV.
            </small>
          </label>
        </Card>

        <Card title="Skills">
          <label className="jm-field">
            <FieldLabel label="Skills" confidence={confidence} field="skills" />
            <textarea
              rows={6}
              value={skillsText}
              onChange={(event) => {
                const raw = event.target.value;
                setSkillsText(raw);
                // Shares its parser with CV-upload extraction
                // (lib/profile/parseSkillsText.ts) so pasting a formatted
                // skills block here — category headings, "Term:
                // description" bullets, bullet glyphs and all — behaves the
                // same as uploading the CV it came from, instead of storing
                // every raw line verbatim.
                //
                // A skill already in `content.skills` keeps whatever
                // category it has (including a candidate's manual
                // override, which always wins); a newly-typed or
                // newly-pasted one gets whatever category the parser just
                // detected for it, if any. Matched by name,
                // case-insensitively, since that's the only identity a
                // free-typed list has.
                const existingByName = new Map(
                  content.skills.map((skill) => [skill.name.toLowerCase(), skill]),
                );
                update(
                  "skills",
                  parseSkillsFreeText(raw).map(({ name, category }) => {
                    const existing = existingByName.get(name.toLowerCase());
                    return {
                      name,
                      rawLabel: name,
                      yearsExperience: existing?.yearsExperience ?? null,
                      category: existing?.category ?? category,
                    };
                  }),
                );
              }}
            />
            <small>
              One per line or separated by commas — paste a formatted skills block (with category
              headings) and it's read the same way an uploaded CV would be.
              {parseSkillsFreeText(skillsText).length > 200
                ? " Only the first 200 will be saved — trim the rest before saving."
                : null}
            </small>
          </label>
          {content.skills.length > 0 ? (
            <div className="rm-skill-groups">
              <p className="rm-skill-groups__hint">
                Grouped automatically by what each skill is for — this is how they'll appear on your
                tailored CV. Pick a different group from any skill's dropdown if one looks wrong.
              </p>
              {groupSkillsByCategory(
                content.skills.map((skill) => skill.name),
                (name) => content.skills.find((skill) => skill.name === name)?.category,
              ).map(({ category, skills }) => (
                <div className="rm-skill-group" key={category}>
                  <span className="rm-skill-group__label">{category}</span>
                  <div className="jm-chip-row">
                    {skills.map((name) => {
                      const index = content.skills.findIndex((skill) => skill.name === name);
                      const skill = content.skills[index];
                      return (
                        <span className="jm-chip rm-skill-chip" key={`${name}-${index}`}>
                          {name}
                          {skill.yearsExperience ? ` · ${skill.yearsExperience}y` : ""}
                          <select
                            aria-label={`Category for ${name}`}
                            className="rm-skill-chip__category"
                            value={category}
                            onChange={(event) =>
                              update(
                                "skills",
                                replaceAt(content.skills, index, {
                                  ...skill,
                                  category:
                                    event.target.value === categorizeSkill(name) ? null : event.target.value,
                                }),
                              )
                            }
                          >
                            {SKILL_CATEGORIES.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card title="Languages">
          <FieldLabel label="Languages" confidence={confidence} field="languages" />
          {content.languages.length === 0 ? (
            <p style={{ opacity: 0.75 }}>None read from your CV. Add them if they matter for the roles you want.</p>
          ) : (
            <ul className="jm-entity-list">
              {content.languages.map((language, index) => (
                <li key={`${language.code}-${index}`} className="jm-entity-card jm-entity-card--languages">
                  <span className="jm-entity-card__icon">
                    <GlobeIcon />
                  </span>
                  <span className="jm-entity-card__body">
                    <input
                      aria-label="Language name"
                      type="text"
                      value={language.label}
                      placeholder="Language"
                      maxLength={64}
                      style={{ flex: "1 1 8rem", minWidth: 0, maxWidth: "100%" }}
                      onChange={(event) => {
                        const label = event.target.value;
                        update(
                          "languages",
                          replaceAt(content.languages, index, { ...language, label, code: codeFromLabel(label) }),
                        );
                      }}
                    />
                    <span className="jm-entity-card__actions">
                      <select
                        aria-label={`${language.label || "Language"} proficiency`}
                        value={language.proficiency ?? ""}
                        onChange={(event) => {
                          update(
                            "languages",
                            replaceAt(content.languages, index, {
                              ...language,
                              proficiency: (event.target.value || null) as (typeof language)["proficiency"],
                            }),
                          );
                        }}
                      >
                        <option value="">Not stated</option>
                        <option value="basic">Basic</option>
                        <option value="conversational">Conversational</option>
                        <option value="professional">Professional</option>
                        <option value="native">Native</option>
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${language.label || "language"}`}
                        className="jm-icon-button"
                        onClick={() => update("languages", removeAt(content.languages, index))}
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={content.languages.length >= 20}
            onClick={() => {
              const blank: LanguageEntry = { code: "xx", label: "", proficiency: null };
              update("languages", [...content.languages, blank]);
            }}
          >
            + Add language
          </Button>
        </Card>

        <Card title="Experience">
          <FieldLabel label="Roles" confidence={confidence} field="experience" />
          {content.experience.length === 0 ? (
            <p style={{ opacity: 0.75 }}>No roles were read from your CV. Add as many as you like.</p>
          ) : (
            <ul className="jm-entity-list">
              {content.experience.map((role, index) => {
                const setRole = (patch: Partial<ExperienceEntry>) =>
                  update("experience", replaceAt(content.experience, index, { ...role, ...patch }));
                return (
                  <li key={index} className="jm-entity-card jm-entity-card--experience jm-entity-card--stacked">
                    <div className="jm-entity-card__head">
                      <span className="jm-entity-card__icon">
                        <BriefcaseIcon />
                      </span>
                      <strong style={{ flex: 1 }}>Role {index + 1}</strong>
                      <button
                        type="button"
                        aria-label={`Remove ${role.title || "this role"}`}
                        className="jm-icon-button"
                        onClick={() => update("experience", removeAt(content.experience, index))}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <div className="jm-entity-card__fields">
                      <label>
                        Job title
                        <input
                          type="text"
                          value={role.title}
                          maxLength={120}
                          placeholder="Software Engineer"
                          onChange={(event) => setRole({ title: event.target.value })}
                        />
                      </label>
                      <label>
                        Employer
                        <input
                          type="text"
                          value={role.employer ?? ""}
                          maxLength={120}
                          placeholder="Company name"
                          onChange={(event) => setRole({ employer: event.target.value || null })}
                        />
                      </label>
                      <label>
                        Started
                        <input
                          type="text"
                          value={role.startedOn ?? ""}
                          placeholder="2021-03"
                          onChange={(event) => setRole({ startedOn: event.target.value || null })}
                        />
                      </label>
                      <label>
                        Ended
                        <input
                          type="text"
                          value={role.endedOn ?? ""}
                          placeholder="2023-12"
                          disabled={role.isCurrent}
                          onChange={(event) => setRole({ endedOn: event.target.value || null })}
                        />
                      </label>
                    </div>
                    <label className="jm-entity-card__checkbox">
                      <input
                        type="checkbox"
                        checked={role.isCurrent}
                        onChange={(event) =>
                          setRole({ isCurrent: event.target.checked, endedOn: event.target.checked ? null : role.endedOn })
                        }
                      />
                      I currently work here
                    </label>
                    <small style={{ opacity: 0.6, fontSize: "0.72rem" }}>
                      Dates as YYYY or YYYY-MM, e.g. 2021 or 2021-03.
                    </small>
                    <div className="jm-entity-card__fields jm-entity-card__fields--full" style={{ marginTop: "0.6rem" }}>
                      <label>
                        Highlights
                        <textarea
                          rows={2}
                          value={role.summary ?? ""}
                          maxLength={2000}
                          placeholder="A couple of achievements or responsibilities"
                          onChange={(event) => setRole({ summary: event.target.value || null })}
                        />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="jm-add-row">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={content.experience.length >= 60}
              onClick={() => {
                const blank: ExperienceEntry = {
                  title: "",
                  employer: null,
                  startedOn: null,
                  endedOn: null,
                  isCurrent: false,
                  summary: null,
                };
                update("experience", [...content.experience, blank]);
              }}
            >
              + Add role
            </Button>
          </div>
        </Card>

        <Card title="Education">
          {content.education.length === 0 ? (
            <p style={{ opacity: 0.75 }}>None read from your CV. Add a degree or qualification if it's relevant.</p>
          ) : (
            <ul className="jm-entity-list">
              {content.education.map((entry, index) => {
                const setEntry = (patch: Partial<EducationEntry>) =>
                  update("education", replaceAt(content.education, index, { ...entry, ...patch }));
                return (
                  <li key={index} className="jm-entity-card jm-entity-card--education jm-entity-card--stacked">
                    <div className="jm-entity-card__head">
                      <span className="jm-entity-card__icon">
                        <GraduationCapIcon />
                      </span>
                      <strong style={{ flex: 1 }}>Qualification {index + 1}</strong>
                      <button
                        type="button"
                        aria-label={`Remove ${entry.qualification || "this qualification"}`}
                        className="jm-icon-button"
                        onClick={() => update("education", removeAt(content.education, index))}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <div className="jm-entity-card__fields">
                      <label>
                        Qualification
                        <input
                          type="text"
                          value={entry.qualification}
                          maxLength={160}
                          placeholder="BSc Computer Science"
                          onChange={(event) => setEntry({ qualification: event.target.value })}
                        />
                      </label>
                      <label>
                        Institution
                        <input
                          type="text"
                          value={entry.institution ?? ""}
                          maxLength={160}
                          placeholder="University name"
                          onChange={(event) => setEntry({ institution: event.target.value || null })}
                        />
                      </label>
                      <label>
                        Completed
                        <input
                          type="text"
                          value={entry.completedOn ?? ""}
                          placeholder="2018"
                          onChange={(event) => setEntry({ completedOn: event.target.value || null })}
                          onBlur={(event) => {
                            const normalized = normalizeCompletedOn(event.target.value);
                            if (normalized !== event.target.value) setEntry({ completedOn: normalized || null });
                          }}
                        />
                        <span style={{ opacity: 0.6, fontSize: "0.78rem" }}>
                          The year you finished, e.g. 2018 — not a start–end range.
                        </span>
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="jm-add-row">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={content.education.length >= 30}
              onClick={() => {
                const blank: EducationEntry = { qualification: "", institution: null, completedOn: null };
                update("education", [...content.education, blank]);
              }}
            >
              + Add qualification
            </Button>
          </div>
        </Card>

        <Card title="Certifications">
          {content.certifications.length === 0 ? (
            <p style={{ opacity: 0.75 }}>None read from your CV. Add one if it's relevant to the roles you want.</p>
          ) : (
            <ul className="jm-entity-list">
              {content.certifications.map((entry, index) => {
                const setEntry = (patch: Partial<CertificationEntry>) =>
                  update("certifications", replaceAt(content.certifications, index, { ...entry, ...patch }));
                return (
                  <li key={index} className="jm-entity-card jm-entity-card--certifications jm-entity-card--stacked">
                    <div className="jm-entity-card__head">
                      <span className="jm-entity-card__icon">
                        <AwardIcon />
                      </span>
                      <strong style={{ flex: 1 }}>Certification {index + 1}</strong>
                      <button
                        type="button"
                        aria-label={`Remove ${entry.name || "this certification"}`}
                        className="jm-icon-button"
                        onClick={() => update("certifications", removeAt(content.certifications, index))}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <div className="jm-entity-card__fields">
                      <label>
                        Name
                        <input
                          type="text"
                          value={entry.name}
                          maxLength={160}
                          placeholder="AWS Certified Developer"
                          onChange={(event) => setEntry({ name: event.target.value })}
                        />
                      </label>
                      <label>
                        Issuer
                        <input
                          type="text"
                          value={entry.issuer ?? ""}
                          maxLength={160}
                          placeholder="Amazon Web Services"
                          onChange={(event) => setEntry({ issuer: event.target.value || null })}
                        />
                      </label>
                      <label>
                        Issued
                        <input
                          type="text"
                          value={entry.issuedOn ?? ""}
                          placeholder="2023-06"
                          onChange={(event) => setEntry({ issuedOn: event.target.value || null })}
                        />
                      </label>
                      <label>
                        Expires
                        <input
                          type="text"
                          value={entry.expiresOn ?? ""}
                          placeholder="2026-06"
                          onChange={(event) => setEntry({ expiresOn: event.target.value || null })}
                        />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="jm-add-row">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={content.certifications.length >= 40}
              onClick={() => {
                const blank: CertificationEntry = { name: "", issuer: null, issuedOn: null, expiresOn: null };
                update("certifications", [...content.certifications, blank]);
              }}
            >
              + Add certification
            </Button>
          </div>
        </Card>

        <Card title="Your preferences">
          {/* ResuMatch used to be JobMatch, a job-board aggregation product
              that actively searched postings and filtered them against
              these preferences. That pipeline is gone — a candidate now
              pastes one job URL and ResuMatch tailors toward it, nothing
              is searched or filtered on their behalf. These fields are
              kept (filling them in costs nothing, and they may feed a
              future feature) but honestly labeled as reference-only, the
              same way "Right to work" already is above, rather than
              promising filtering that no longer happens. */}
          <label className="jm-field">
            <span>Working arrangement</span>
            <select
              value={content.preferences.remote ?? ""}
              onChange={(event) =>
                update("preferences", {
                  ...content.preferences,
                  remote: (event.target.value || null) as CandidateProfileContent["preferences"]["remote"],
                })
              }
            >
              <option value="">No preference</option>
              <option value="onsite">On site</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
              <option value="any">Any</option>
            </select>
            <small>Kept for your own reference. Not currently used to filter or flag anything.</small>
          </label>

          <label className="jm-field">
            <span>Salary floor (annual gross)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={content.preferences.salaryFloor ?? ""}
              onChange={(event) =>
                update("preferences", {
                  ...content.preferences,
                  salaryFloor: event.target.value ? Number(event.target.value) : null,
                  salaryCurrency: content.preferences.salaryCurrency ?? "EUR",
                })
              }
            />
            <small>Kept for your own reference. Not currently checked against any job you tailor toward.</small>
          </label>

          <label className="jm-field">
            <span>Employers you'd rather not work for</span>
            <textarea
              rows={3}
              value={excludedEmployersText}
              onChange={(event) => {
                const raw = event.target.value;
                setExcludedEmployersText(raw);
                update("preferences", {
                  ...content.preferences,
                  excludedEmployers: parseEntries(raw).slice(0, 50),
                });
              }}
            />
            <small>
              Kept privately for your own reference. Not currently checked against any job you tailor
              toward.
              {parseEntries(excludedEmployersText).length > 50
                ? " Only the first 50 will be saved — trim the rest before saving."
                : null}
            </small>
          </label>
        </Card>
      </div>

      {state.kind === "error" ? <Alert tone="error">{state.message}</Alert> : null}
      {state.kind === "saved" ? (
        <Alert tone="info">
          {state.confirmed
            ? "Saved and confirmed. This is now the version ResuMatch tailors from."
            : "Saved as a new draft version. Confirm it when you are ready."}
        </Alert>
      ) : null}

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "1.5rem" }}>
        <Button type="submit" disabled={state.kind === "saving"}>
          {state.kind === "saving" ? "Saving…" : "Save and confirm"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={state.kind === "saving"}
          onClick={() => void save(false)}
        >
          Save without confirming
        </Button>
        {versionNumber !== null ? (
          <span className="jm-mono" style={{ opacity: 0.7, fontSize: "0.8rem" }}>
            editing v{versionNumber}
          </span>
        ) : null}
      </div>
    </form>
  );
}
