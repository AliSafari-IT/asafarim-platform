"use client";

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
const FUNNEL: { status: Exclude<ApplicationStatusName, "REJECTED">; label: string }[] = [
  { status: "SAVED", label: "Saved" },
  { status: "APPLIED", label: "Applied" },
  { status: "INTERVIEWING", label: "Interviewing" },
  { status: "OFFER", label: "Offer" },
];

export function ApplicationStatusStepper({
  status,
  disabled,
  onChange,
}: {
  status: ApplicationStatusName;
  disabled?: boolean;
  onChange: (status: ApplicationStatusName) => void;
}) {
  if (status === "REJECTED") {
    return (
      <div className="rm-status-rejected">
        <span className="rm-badge rm-badge--rejected">Rejected</span>
        <button
          type="button"
          className="rm-status-rejected__undo"
          disabled={disabled}
          onClick={() => onChange("SAVED")}
        >
          Move back to Saved
        </button>
      </div>
    );
  }

  const currentIndex = FUNNEL.findIndex((step) => step.status === status);

  return (
    <div className="rm-status-stepper">
      <ol className="rm-status-stepper__steps" aria-label="Application status">
        {FUNNEL.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={step.status} className={`rm-status-step rm-status-step--${state}`}>
              {index > 0 ? (
                <span className={`rm-status-step__connector${index <= currentIndex ? " rm-status-step__connector--filled" : ""}`} aria-hidden="true" />
              ) : null}
              <button
                type="button"
                className="rm-status-step__button"
                disabled={disabled}
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => onChange(step.status)}
              >
                <span className="rm-status-step__dot" aria-hidden="true">
                  {state === "done" ? "✓" : index + 1}
                </span>
                <span className="rm-status-step__label">{step.label}</span>
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
        Mark as rejected
      </button>
    </div>
  );
}
