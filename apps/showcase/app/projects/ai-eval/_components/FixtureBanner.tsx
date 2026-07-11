import { Alert } from "@asafarim/ui";

/**
 * Provenance disclaimer on every AI-Eval page. Covers the issue's constraints:
 * synthetic data, provider-neutral aliases, no employer/customer IP, and no
 * live inference — latency/cost are representative fixtures, not live numbers.
 */
export function FixtureBanner() {
  return (
    <Alert tone="info">
      <strong>Fixture mode — synthetic data, no live models.</strong> These
      pages render committed, reproducible results from the runnable harness in{" "}
      <code>benchmarks/ai-eval</code>. Models are provider-neutral aliases;
      datasets are synthetic and openly licensed. Latency and cost are
      representative fixtures, never live measurements. No employer or customer
      data, prompts, or IP appear anywhere.
    </Alert>
  );
}
