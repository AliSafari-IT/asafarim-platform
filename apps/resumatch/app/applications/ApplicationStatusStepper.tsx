"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import type { ApplicationStatusName } from "../../lib/applications/constants";

/**
 * Multi-step visual funnel for an application's status.
 *
 * Originally built on `@asafarim/progress-bars`' `StepProgress`, but that
 * package's published bundle (0.6.3) vendors its own copy of React's
 * `jsx-runtime` instead of importing it as an external/peer module — the
 * vendored copy references the pre-React-19
 * `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner`
 * shape, which React 19 restructured, so merely importing `StepProgress`
 * throws "Cannot read properties of undefined (reading
 * 'ReactCurrentDispatcher')" at module-evaluation time, before any
 * component even renders. That's a build-config bug in the library (its
 * bundler needs to mark `react/jsx-runtime` external), not something a
 * consuming app can work around. Built the same interaction here instead
 * so this feature isn't blocked on it — swap back to `StepProgress` once
 * a fixed version ships.
 *
 * SAVED -> APPLIED -> INTERVIEWING -> OFFER is a real forward progression,
 * so it maps onto a step index; REJECTED does not — the app can be
 * rejected from any of those stages, and `Application.status` only ever
 * stores the *current* value, never a history, so there is no honest step
 * to show it at. REJECTED gets its own compact badge instead of the
 * stepper, rather than a fabricated position.
 */
const FUNNEL: Exclude<ApplicationStatusName, "REJECTED">[] = ["SAVED", "APPLIED", "INTERVIEWING", "OFFER"];

export function ApplicationStatusStepper({
  status,
  disabled,
  onChange,
}: {
  status: ApplicationStatusName;
  disabled?: boolean;
  onChange: (status: ApplicationStatusName) => void;
}) {
  const { t } = useTranslation();
  if (status === "REJECTED") {
    return (
      <div className="rm-status-rejected">
        <span className="rm-badge rm-badge--rejected">{t("resumatch.app.status.REJECTED")}</span>
        <button
          type="button"
          className="rm-status-rejected__undo"
          disabled={disabled}
          onClick={() => onChange("SAVED")}
        >
          {t("resumatch.app.moveBack")}
        </button>
      </div>
    );
  }

  const currentIndex = FUNNEL.indexOf(status);

  return (
    <div className="rm-status-stepper">
      <ol className="rm-status-stepper__steps" aria-label={t("resumatch.app.statusAria")}>
        {FUNNEL.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={step} className={`rm-status-step rm-status-step--${state}`}>
              {index > 0 ? (
                <span className={`rm-status-step__connector${index <= currentIndex ? " rm-status-step__connector--filled" : ""}`} aria-hidden="true" />
              ) : null}
              <button
                type="button"
                className="rm-status-step__button"
                disabled={disabled}
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => onChange(step)}
              >
                <span className="rm-status-step__dot" aria-hidden="true">
                  {state === "done" ? "✓" : index + 1}
                </span>
                <span className="rm-status-step__label">{t(`resumatch.app.status.${step}`)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="rm-status-stepper__reject"
        disabled={disabled}
        onClick={() => onChange("REJECTED")}
      >
        {t("resumatch.app.markRejected")}
      </button>
    </div>
  );
}
