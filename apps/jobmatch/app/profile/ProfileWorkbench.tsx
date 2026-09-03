"use client";

import { useCallback, useRef, useState } from "react";
import { Alert, Badge, Button, Card } from "@asafarim/ui";
import { LOW_CONFIDENCE_THRESHOLD } from "../../lib/profile/contract";
import type { CandidateProfileContent, ProfileConfidence } from "../../lib/profile/contract";

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
  const confidence = initialConfidence;
  const formRef = useRef<HTMLFormElement>(null);

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
      } catch {
        setState({ kind: "error", message: "This profile could not be saved. Check your connection and try again." });
      }
    },
    [content, versionId],
  );

  const listValue = (items: { name: string }[]) => items.map((item) => item.name).join(", ");

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
          <strong>This profile is confirmed.</strong> It is the version JobMatch will match against
          once job sources are connected. Editing it creates a new version — the confirmed one stays
          on record so past results remain explainable.
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
              Used only to filter out jobs you could not take. Leaving it blank means JobMatch will
              not exclude anything on this basis.
            </small>
          </label>
        </Card>

        <Card title="Skills">
          <label className="jm-field">
            <FieldLabel label="Skills" confidence={confidence} field="skills" />
            <textarea
              rows={6}
              value={listValue(content.skills)}
              onChange={(event) =>
                update(
                  "skills",
                  event.target.value
                    .split(",")
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .slice(0, 200)
                    .map((name) => ({ name, rawLabel: name, yearsExperience: null })),
                )
              }
            />
            <small>One per line or separated by commas.</small>
          </label>
        </Card>

        <Card title="Languages">
          <FieldLabel label="Languages" confidence={confidence} field="languages" />
          {content.languages.length === 0 ? (
            <p style={{ opacity: 0.75 }}>None read from your CV. Add them if they matter for the roles you want.</p>
          ) : (
            <ul className="jm-list">
              {content.languages.map((language, index) => (
                <li key={language.code}>
                  <span>{language.label}</span>
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
            <ul className="jm-list">
              {content.experience.map((role, index) => (
                <li key={`${role.title}-${index}`}>
                  <strong>{role.title}</strong>
                  {role.employer ? <span> — {role.employer}</span> : null}
                  <span className="jm-mono" style={{ opacity: 0.7, fontSize: "0.8rem" }}>
                    {" "}
                    {role.startedOn ?? "?"} to {role.isCurrent ? "now" : (role.endedOn ?? "?")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="What you are looking for">
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
              value={content.preferences.excludedEmployers.join(", ")}
              onChange={(event) =>
                update("preferences", {
                  ...content.preferences,
                  excludedEmployers: event.target.value
                    .split(",")
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .slice(0, 50),
                })
              }
            />
            <small>Kept private. Nobody is told you excluded them.</small>
          </label>
        </Card>
      </div>

      {state.kind === "error" ? <Alert tone="error">{state.message}</Alert> : null}
      {state.kind === "saved" ? (
        <Alert tone="info">
          {state.confirmed
            ? "Saved and confirmed. This is now the version JobMatch will match against."
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
