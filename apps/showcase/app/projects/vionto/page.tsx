import type { Metadata } from "next";
import { ButtonLink, Hero, Metric, Panel, Section } from "@asafarim/ui";
import { ViontoNav } from "./_components/ViontoNav";
import { FixtureBanner } from "./_components/FixtureBanner";
import { dimensions, methodology, scores } from "./_data/benchmark";
import { fmtMs, fmtUsd } from "./_components/format";

export const metadata: Metadata = {
  title: "Vionto Studio — transparent AI media-pipeline benchmark",
  description:
    "A deterministic AI media-pipeline benchmark: a schema-validated brief-to-render pipeline, an approval-gated job state machine with idempotent retry, seeded stage failures, and cost/latency estimation — all in fixture mode with no live providers.",
};

export default function ViontoOverviewPage() {
  const { dimensions: d } = scores;
  return (
    <>
      <Hero
        kicker="Exhibit № 05 · Benchmark"
        kickerIndex="05"
        title="Vionto Studio — an AI pipeline you can trust to fail honestly."
        lede="A schema-validated brief-to-render pipeline with explicit human approval gates and idempotent retry. Two stages are seeded to fail — and the benchmark proves the pipeline recovers, truthfully, every time."
        actions={
          <>
            <ButtonLink href="/projects/vionto/pipeline">Run the pipeline</ButtonLink>
            <ButtonLink href="/projects/vionto/case-study" variant="secondary">
              Read the case study
            </ButtonLink>
          </>
        }
      />

      <ViontoNav active="/projects/vionto" />

      <FixtureBanner />

      <Section kicker="Headline" kickerIndex="01" title="How the reference run scored">
        <div className="ui-grid ui-grid--metrics">
          <Metric
            label="Structured-output validity"
            value={`${d.structuredOutputValidity.value}%`}
            hint="schema-valid generation attempts"
          />
          <Metric
            label="Retry idempotency"
            value={`${d.retryIdempotencyCorrectness.value}%`}
            hint="new job, never a mutation"
          />
          <Metric
            label="Completion time"
            value={fmtMs(d.endToEndCompletionTime.value)}
            hint="reference, per successful run"
          />
          <Metric
            label="Cost delta"
            value={fmtUsd(d.estimatedVsObservedCost.value)}
            hint="estimated vs. observed"
          />
          <Metric
            label="Seeded-failure recovery"
            value={`${d.seededFailureRecovery.value}%`}
            hint="reaches succeeded via retry"
          />
        </div>
      </Section>

      <Section kicker="What it measures" kickerIndex="02" title="Five benchmark dimensions">
        <div className="ui-grid">
          {dimensions.map((dim) => (
            <Panel key={dim.key} title={dim.name}>
              <p>{dim.question}</p>
              <p className="u-muted" style={{ marginTop: "0.4rem" }}>
                {d[dim.key].method}
              </p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section kicker="Method" kickerIndex="03" title="Why the pipeline is trustworthy">
        <div className="ui-grid">
          <Panel title="Approval gates">
            <p>{methodology.approvalGates}</p>
          </Panel>
          <Panel title="Idempotent retry">
            <p>{methodology.idempotentRetry}</p>
          </Panel>
          <Panel title="Providers">
            <p>{methodology.providers}</p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Honesty" kickerIndex="04" title="Limitations">
        <Panel title="what this benchmark does not prove">
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {methodology.limitations.map((l) => (
              <li key={l} style={{ marginBottom: "0.4rem" }}>
                {l}
              </li>
            ))}
          </ul>
        </Panel>
      </Section>
    </>
  );
}
