"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card } from "@asafarim/ui";
import { LOW_CONFIDENCE_THRESHOLD } from "../../lib/profile/contract";
import type { CandidateProfileContent, ProfileConfidence } from "../../lib/profile/contract";
import { BriefcaseIcon, CompassIcon, GlobeIcon } from "./icons";

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

  const update = useCallback(<K extends keyof CandidateProfileContent>(key: K, value: CandidateProfileContent[K]) => {
    setContent((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  }, []);

  const save = useCallback(
    async (confirm: boolean) => {
      setState({ kind: "saving" });
      try {
        const response = await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content, parentVersionId: versionId, confirm }),
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
                update(
                  "skills",
                  parseEntries(raw)
                    .slice(0, 200)
                    .map((name) => ({ name, rawLabel: name, yearsExperience: null })),
                );
              }}
            />
            <small>
              One per line or separated by commas.
              {parseEntries(skillsText).length > 200
                ? " Only the first 200 will be saved — trim the rest before saving."
                : null}
            </small>
          </label>
          {content.skills.length > 0 ? (
            <div className="jm-chip-row" style={{ ["--category-tint" as string]: "99, 102, 241" }}>
              {content.skills.map((skill, index) => (
                <span className="jm-chip" key={`${skill.name}-${index}`}>
                  {skill.name}
                  {skill.yearsExperience ? ` · ${skill.yearsExperience}y` : ""}
                </span>
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
                <li key={language.code} className="jm-entity-card jm-entity-card--languages">
                  <span className="jm-entity-card__icon">
                    <GlobeIcon />
                  </span>
                  <span className="jm-entity-card__body">
                    <span className="jm-entity-card__title">{language.label}</span>
                    <span className="jm-entity-card__actions">
                      <select
                        aria-label={`${language.label} proficiency`}
                        value={language.proficiency ?? ""}
                        onChange={(event) => {
                          const next = [...content.languages];
                          next[index] = {
                            ...language,
                            proficiency: (event.target.value || null) as (typeof language)["proficiency"],
                          };
                          update("languages", next);
                        }}
                      >
                        <option value="">Not stated</option>
                        <option value="basic">Basic</option>
                        <option value="conversational">Conversational</option>
                        <option value="professional">Professional</option>
                        <option value="native">Native</option>
                      </select>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Experience">
          <FieldLabel label="Roles" confidence={confidence} field="experience" />
          {content.experience.length === 0 ? (
            <p style={{ opacity: 0.75 }}>No roles were read from your CV.</p>
          ) : (
            <ul className="jm-entity-list">
              {content.experience.map((role, index) => (
                <li key={`${role.title}-${index}`} className="jm-entity-card jm-entity-card--experience">
                  <span className="jm-entity-card__icon">
                    <BriefcaseIcon />
                  </span>
                  <span className="jm-entity-card__body">
                    <span className="jm-entity-card__title">
                      {role.title}
                      {role.employer ? <span style={{ fontWeight: 400, opacity: 0.75 }}> — {role.employer}</span> : null}
                    </span>
                    <span className="jm-entity-card__meta">
                      <span className="jm-mono">
                        {role.startedOn ?? "?"} to {role.isCurrent ? "now" : (role.endedOn ?? "?")}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="What you are looking for">
          <span
            className="jm-entity-card__icon"
            style={{ ["--category-tint" as string]: "139, 92, 246", marginBottom: "0.75rem" }}
          >
            <CompassIcon />
          </span>
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
            <small>A floor, not a target. Jobs below it are excluded, and the reason is shown.</small>
          </label>

          <label className="jm-field">
            <span>Employers to never show me</span>
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
              Kept private. Nobody is told you excluded them.
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
