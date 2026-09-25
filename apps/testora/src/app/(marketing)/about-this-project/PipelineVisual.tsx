import { Kicker } from "@asafarim/ui";

export interface PipelineStat {
  label: string;
  value: number;
}

const STEPS = [
  { title: "Requirement", detail: "What must work" },
  { title: "Suite", detail: "Groups fixtures" },
  { title: "Fixture", detail: "One page/flow" },
  { title: "Case", detail: "One assertion" },
  { title: "Run", detail: "Real TestCafe" },
  { title: "Result", detail: "Pass, fail, screenshot" },
  { title: "Issue", detail: "Filed on GitHub" },
] as const;

/**
 * A chart-first supplement to the plain-text "what actually works" cards
 * above it: the real authoring→execution→triage pipeline as a labeled flow,
 * plus live counts straight from Testora's own database — not illustrative
 * numbers, the actual current totals — so "the full authoring model is
 * real and persisted" (the claim made in prose just above) is backed by a
 * number instead of asking the reader to take it on faith.
 */
export function PipelineVisual({ stats }: { stats: PipelineStat[] }) {
  return (
    <section className="ui-showcase-about__section">
      <Kicker index="02">Live, not illustrative</Kicker>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card/60 px-4 py-3 text-center"
          >
            <p className="text-2xl font-bold text-foreground sm:text-3xl">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 mb-3 text-sm text-muted-foreground">
        One event model, seven stages, no step skipped or simulated:
      </p>
      <div className="flex items-stretch overflow-x-auto pb-2">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex shrink-0 items-stretch">
            <div className="flex w-32 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 py-3 text-center sm:w-36">
              <span className="text-sm font-semibold text-foreground">{step.title}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{step.detail}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex w-6 shrink-0 items-center justify-center text-muted-foreground sm:w-8">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path
                    d="M4 12h14m0 0-5-5m5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
