import { Alert } from "@asafarim/ui";

const CONTACT = "mailto:asafarim@gmail.com?subject=JobMatch%20showcase%20%E2%80%94%20building%20something%20similar";

/**
 * The single source of the showcase disclosure required by JM-001 / issue
 * #205. It must appear before or at the point a visitor uploads a CV, so it
 * is rendered on the landing page and again directly above the upload
 * control on the profile page. `variant="compact"` is the short form shown
 * at the upload point itself, where the full text has already been seen.
 *
 * The licensing decision this notice implements is recorded in
 * `docs/jm-001-licensing-decision.md`.
 */
export function ShowcaseNotice({ variant = "full" }: { variant?: "full" | "compact" }) {
  if (variant === "compact") {
    return (
      <Alert tone="warning">
        <strong>Showcase demo.</strong> This is an experimental portfolio MVP, not a real recruiting
        service — no accuracy, privacy, security, or availability guarantees. Upload a CV only with
        information you are comfortable putting in a public demo.
      </Alert>
    );
  }

  return (
    <Alert tone="warning">
      <strong>This is a portfolio showcase, not a hiring service.</strong>{" "}
      JobMatch is an experimental MVP built to demonstrate how an explainable job-search assistant
      can work. It is not a recruiting, hiring, employment-screening, HR, legal, compliance, or
      career-advice service, and must never be the sole or automated basis for an employment or
      other consequential decision. Results can be incomplete, inaccurate, stale, or unavailable,
      some features are not implemented, and nothing here promises accuracy, security, uptime, or
      support. CV upload and profile extraction are experimental — do not include sensitive
      information that is not needed to try the showcase.{" "}
      <a href={CONTACT} className="jm-mono">
        Want something like this for your team? Let’s talk →
      </a>
    </Alert>
  );
}
