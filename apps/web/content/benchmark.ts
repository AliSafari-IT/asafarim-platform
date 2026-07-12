/**
 * Compact homepage benchmark cards (full demos live in Showcase). Numbers are
 * the reference fixture-mode results — clearly labelled as fixture benchmarks,
 * never presented as live. No employer/customer data in either.
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

export const eduMatchCard = {
  kicker: "Benchmark",
  title: "EduMatch",
  blurb:
    "An explainable tutor-matching benchmark: synthetic students and tutors, a transparent weighted-factor engine you can adjust live, and a provable fairness check via a constraint-identical twin pair.",
  stats: [
    { label: "Match relevance", value: "100%" },
    { label: "Twin-pair delta", value: "0.000" },
    { label: "Matching factors", value: "5" },
  ],
  note: "Fixture benchmark · synthetic identities · safe demo mode",
  linkLabel: "Explore EduMatch",
  /** Path under the Showcase origin (resolved via getPlatformLinks().showcase). */
  href: "/projects/edumatch",
} as const;

/** Stage labels for the homepage's compact animated pipeline diagram. */
export const viontoPipelineStages = [
  { label: "Brief" },
  { label: "Script" },
  { label: "Storyboard" },
  { label: "Assets" },
  { label: "Render" },
] as const;

export const viontoCard = {
  kicker: "Benchmark",
  title: "Vionto Studio",
  blurb:
    "A schema-validated AI media pipeline with explicit human approval gates, idempotent retry, and seeded stage failures — proven to recover honestly, with no live providers.",
  stats: [
    { label: "Structured validity", value: "93%" },
    { label: "Failure recovery", value: "100%" },
    { label: "Live providers", value: "0" },
  ],
  note: "Fixture benchmark · synthetic assets · no live providers",
  linkLabel: "Explore Vionto Studio",
  /** Path under the Showcase origin (resolved via getPlatformLinks().showcase). */
  href: "/projects/vionto",
} as const;
