import { Alert } from "@asafarim/ui";

/**
 * The provenance disclaimer shown on every Vionto Studio demo page. Satisfies
 * the acceptance criteria that this runs fully in fixture mode, uses only
 * synthetic/clearly-licensed assets, and makes no live provider calls.
 */
export function FixtureBanner() {
  return (
    <Alert tone="info">
      <strong>Fixture mode, no live providers.</strong> Every script, storyboard,
      and asset here is a deterministic, committed fixture — no LLM call, no
      render worker, no API keys. Assets are synthetic placeholders (CC0,
      described in <code>fixtures/assets.json</code>). The interactive pipeline
      below runs the real engine in your browser, with zero network calls.
      Runnable harness: <code>benchmarks/vionto</code>.
    </Alert>
  );
}
