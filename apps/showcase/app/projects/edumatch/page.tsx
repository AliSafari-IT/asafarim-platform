import type { Metadata } from "next";
import { ButtonLink, Hero, Metric, Panel, Section } from "@asafarim/ui";
import { EdumatchNav } from "./_components/EdumatchNav";
import { FixtureBanner } from "./_components/FixtureBanner";
import { benchmarkScores, dimensions, methodology } from "./_data/benchmark";

export const metadata: Metadata = {
  title: "EduMatch — explainable matching benchmark",
  description:
    "A deterministic, explainable tutor-matching benchmark: synthetic students and tutors, a transparent weighted-factor engine, and fairness/stability checks.",
};

export default function EdumatchOverviewPage() {
  const { dimensions: d } = benchmarkScores;
  return (
    <>
      <Hero
        kicker="Exhibit № 04 · Benchmark"
        kickerIndex="04"
        title="EduMatch — matching you can inspect and argue with."
        lede="A transparent tutor-matching engine scored on relevance, constraint safety, explainability, fairness, and stability — every recommendation states exactly why it appears, and you can move the weights yourself."
        actions={
          <>
            <ButtonLink href="/projects/edumatch/explorer">Open the match explorer</ButtonLink>
            <ButtonLink href="/projects/edumatch/case-study" variant="secondary">
              Read the case study
            </ButtonLink>
          </>
        }
      />

      <EdumatchNav active="/projects/edumatch" />

      <FixtureBanner />

      <Section kicker="Headline" kickerIndex="01" title="How the reference run scored">
        <div className="ui-grid ui-grid--metrics">
          <Metric label="Match relevance" value={`${d.matchRelevance.value}%`} hint="vs. labeled fixture set" />
          <Metric label="Constraint satisfaction" value={`${d.constraintSatisfaction.value}%`} hint="hard requirements met" />
          <Metric label="Explainability" value={`${d.explainabilityCoverage.value}%`} hint="factors sum to composite" />
          <Metric label="Fairness" value={d.fairness.value.toFixed(3)} hint="max twin-pair score delta" />
          <Metric label="Ranking stability" value={`${d.rankingStability.value}%`} hint="order preserved under noise" />
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

      <Section kicker="Method" kickerIndex="03" title="Why the ranking is trustworthy">
        <div className="ui-grid">
          <Panel title="Determinism">
            <p>{methodology.determinism}</p>
          </Panel>
          <Panel title="Adjustable weights">
            <p>{methodology.weights}</p>
          </Panel>
          <Panel title="Sensitive attributes">
            <p>{methodology.sensitiveAttributes}</p>
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
