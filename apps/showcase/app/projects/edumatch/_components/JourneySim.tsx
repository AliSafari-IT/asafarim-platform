"use client";

import { useState } from "react";
import { Badge } from "@asafarim/ui";
import styles from "./edumatch.module.css";

type Role = "student" | "tutor" | "moderator";
type Step = 0 | 1 | 2 | 3;

const STEPS: Array<{ title: string; detail: string }> = [
  { title: "Inquiry", detail: "Student describes their need (subject, level, availability)." },
  { title: "Proposal", detail: "A matched tutor sends a proposal: rate, plan, and time slot." },
  { title: "Booking", detail: "Student accepts the proposal and the session is booked." },
  { title: "Session logged", detail: "Booking appears on every role's dashboard and in the audit trail." },
];

const ROLES: Array<{ key: Role; label: string }> = [
  { key: "student", label: "Student" },
  { key: "tutor", label: "Tutor" },
  { key: "moderator", label: "Moderator" },
];

/**
 * Inquiry → proposal → booking journey across the three roles the matching
 * factors ultimately serve. Pure local state — no network request, nothing
 * persisted, no payment processed. A "flag for review" action demonstrates
 * the moderator's trust & safety touchpoint without any real consequence.
 */
export function JourneySim() {
  const [role, setRole] = useState<Role>("student");
  const [step, setStep] = useState<Step>(0);
  const [flagged, setFlagged] = useState(false);

  function advance() {
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }
  function reset() {
    setStep(0);
    setFlagged(false);
  }

  const actionLabel =
    step === 0
      ? "Send inquiry"
      : step === 1
        ? "Tutor sends proposal"
        : step === 2
          ? "Accept & book"
          : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <div className={styles.roleTabs} role="tablist" aria-label="Perspective">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={role === r.key}
              className={styles.roleTab}
              onClick={() => setRole(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Badge tone="warning">Safe demo mode — no real booking or payment</Badge>
      </div>

      <div className={styles.journeySteps} aria-live="polite">
        {STEPS.map((s, i) => {
          // Booking (step 3) implies the final "Session logged" step too.
          const done = i < step || (step === 3 && i === 3);
          return (
            <div
              key={s.title}
              className={`${styles.journeyStep} ${done ? styles.journeyStepDone : ""}`}
            >
              <span className={styles.journeyStepIdx}>{String(i + 1).padStart(2, "0")}</span>
              <span>
                <strong>{s.title}</strong> — {s.detail}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        {actionLabel ? (
          <button type="button" className="ui-btn ui-btn--primary" onClick={advance}>
            {actionLabel}
          </button>
        ) : (
          <Badge tone="success">Booking complete</Badge>
        )}
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={reset}>
          Reset
        </button>

        {role === "moderator" && step >= 2 ? (
          <button
            type="button"
            className="ui-btn ui-btn--danger ui-btn--sm"
            onClick={() => setFlagged((f) => !f)}
          >
            {flagged ? "Unflag booking" : "Flag booking for review"}
          </button>
        ) : null}
      </div>

      {flagged ? (
        <p className={styles.factorNote} style={{ marginTop: "0.6rem" }}>
          Flagged for review — in production this would pause payout and notify trust &amp; safety.
          Here it only toggles local demo state.
        </p>
      ) : null}
    </div>
  );
}
