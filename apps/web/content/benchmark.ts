/**
 * Compact homepage benchmark card for the AI Evaluation Lab (full demo lives in
 * Showcase). Numbers are the reference fixture-mode results — clearly labelled
 * as a fixture benchmark, never presented as live. No employer/customer data.
 */
export const aiEvalCard = {
  kicker: "Benchmark",
  title: "AI Evaluation Lab",
  blurb:
    "A provider-neutral, fixture-mode benchmark: versioned prompts and synthetic datasets scored for correctness, groundedness, format compliance, latency, cost, and safety — reproducibly, with no API keys.",
  stats: [
    { label: "Scenarios", value: "3" },
    { label: "Scoring axes", value: "6" },
    { label: "API keys", value: "0" },
  ],
  note: "Fixture benchmark · synthetic data · provider-neutral aliases",
  linkLabel: "Explore the AI Evaluation Lab",
  /** Path under the Showcase origin (resolved via getPlatformLinks().showcase). */
  href: "/projects/ai-eval",
} as const;
