import { Alert } from "@asafarim/ui";

/**
 * The provenance disclaimer shown on every EduMatch demo page. Satisfies the
 * acceptance criteria that identities/scenarios are synthetic and that demo
 * bookings/payments create no external side effects.
 */
export function FixtureBanner() {
  return (
    <Alert tone="info">
      <strong>Synthetic data, safe demo mode.</strong> Every tutor and student
      here is invented for this benchmark — no real people, no real bookings,
      no real payments, no external side effects. Ranking runs entirely in
      your browser against committed fixtures. The runnable harness lives in{" "}
      <code>benchmarks/edumatch</code>.
    </Alert>
  );
}
