import { Alert } from "@asafarim/ui";

/**
 * The provenance disclaimer shown on every Testora demo page. Satisfies the
 * acceptance criterion that results never pretend fixture events are production.
 */
export function FixtureBanner() {
  return (
    <Alert tone="info">
      <strong>Fixture data, not production.</strong> These pages render a
      committed, reproducible snapshot distilled from a real Playwright run of a
      seeded sample app. Nothing here is executed live, and no event on this page
      is a real user event. The runnable harness lives in{" "}
      <code>benchmarks/testora</code>.
    </Alert>
  );
}
