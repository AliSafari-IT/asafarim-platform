"use client";

import { useState } from "react";
import { Badge } from "@asafarim/ui";
import { useTranslation } from "@asafarim/shared-i18n";
import styles from "./edumatch.module.css";

type Role = "student" | "tutor" | "moderator";
type Step = 0 | 1 | 2 | 3;

const STEPS: Array<{ key: string }> = [
  { key: "inquiry" },
  { key: "proposal" },
  { key: "booking" },
  { key: "logged" },
];

const ROLES: Array<{ key: Role }> = [
  { key: "student" },
  { key: "tutor" },
  { key: "moderator" },
];

/**
 * Inquiry → proposal → booking journey across the three roles the matching
 * factors ultimately serve. Pure local state — no network request, nothing
 * persisted, no payment processed. A "flag for review" action demonstrates
 * the moderator's trust & safety touchpoint without any real consequence.
 */
export function JourneySim() {
  const { t } = useTranslation();
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
      ? t("showcase.edumatch.journeySim.action.sendInquiry")
      : step === 1
        ? t("showcase.edumatch.journeySim.action.tutorSendsProposal")
        : step === 2
          ? t("showcase.edumatch.journeySim.action.acceptBook")
          : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <div className={styles.roleTabs} role="tablist" aria-label={t("showcase.edumatch.journeySim.aria.perspective")}>
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={role === r.key}
              className={styles.roleTab}
              onClick={() => setRole(r.key)}
            >
              {t(`showcase.edumatch.journeySim.role.${r.key}`)}
            </button>
          ))}
        </div>
        <Badge tone="warning">{t("showcase.edumatch.journeySim.demoBadge")}</Badge>
      </div>

      <div className={styles.journeySteps} aria-live="polite">
        {STEPS.map((s, i) => {
          // Booking (step 3) implies the final "Session logged" step too.
          const done = i < step || (step === 3 && i === 3);
          return (
            <div
              key={s.key}
              className={`${styles.journeyStep} ${done ? styles.journeyStepDone : ""}`}
            >
              <span className={styles.journeyStepIdx}>{String(i + 1).padStart(2, "0")}</span>
              <span>
                <strong>{t(`showcase.edumatch.journeySim.step.${s.key}.title`)}</strong> — {t(`showcase.edumatch.journeySim.step.${s.key}.detail`)}
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
          <Badge tone="success">{t("showcase.edumatch.journeySim.bookingComplete")}</Badge>
        )}
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={reset}>
          {t("showcase.edumatch.journeySim.reset")}
        </button>

        {role === "moderator" && step >= 2 ? (
          <button
            type="button"
            className="ui-btn ui-btn--danger ui-btn--sm"
            onClick={() => setFlagged((f) => !f)}
          >
            {flagged
              ? t("showcase.edumatch.journeySim.flag.unflag")
              : t("showcase.edumatch.journeySim.flag.flagForReview")}
          </button>
        ) : null}
      </div>

      {flagged ? (
        <p className={styles.factorNote} style={{ marginTop: "0.6rem" }}>
          {t("showcase.edumatch.journeySim.flaggedNotice")}
        </p>
      ) : null}
    </div>
  );
}
