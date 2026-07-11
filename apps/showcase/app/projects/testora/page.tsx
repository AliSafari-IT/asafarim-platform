import type { Metadata } from "next";
import { ButtonLink, Hero, Metric, Panel, Section } from "@asafarim/ui";
import { TestoraNav } from "./_components/TestoraNav";
import { FixtureBanner } from "./_components/FixtureBanner";
import { dimensions, methodology, runDetail } from "./_data/benchmark";
import { fmtDuration } from "./_components/format";
import styles from "./_components/testora.module.css";

export const metadata: Metadata = {
  title: "Testora — test-automation benchmark",
  description:
    "A deterministic Playwright benchmark: a seeded sample app with intentional pass/fail/flaky tests, scored on detection, flake identification, diagnosis speed, artifact completeness, and reproducibility.",
};

export default function TestoraOverviewPage() {
  const { scores, summary } = runDetail;
  return (
    <>
      <Hero
        kicker="Exhibit № 03 · Benchmark"
        kickerIndex="03"
        title="Testora — an observable test-automation benchmark."
        lede="A fixed, offline sample application carries intentional, seeded defects. Testora proves a good suite catches every one of them — deterministically, with complete artifacts — and shows the evidence."
        actions={
          <>
            <ButtonLink href="/projects/testora/run">See the latest run</ButtonLink>
            <ButtonLink href="/projects/testora/case-study" variant="secondary">
              Read the case study
            </ButtonLink>
          </>
        }
      />

      <TestoraNav active="/projects/testora" />

      <FixtureBanner />

      <Section kicker="Headline" kickerIndex="01" title="How the reference run scored">
        <div className="ui-grid ui-grid--metrics">
          <Metric
            label="Detection rate"
            value={`${scores.detectionRate}%`}
            hint={`${scores.regressionsDetected}/${scores.seededRegressions} seeded regressions`}
          />
          <Metric
            label="Flaky identified"
            value={scores.flakyIdentified ? "Yes" : "No"}
            hint="fail-then-pass told apart from a regression"
          />
          <Metric
            label="Time to diagnosis"
            value={fmtDuration(scores.meanTimeToDiagnosisMs)}
            hint="mean across failing scenarios"
          />
          <Metric
            label="Artifact completeness"
            value={`${scores.artifactCompleteness}%`}
            hint="trace · screenshot · video"
          />
          <Metric
            label="CI reproducibility"
            value={`${scores.ciReproducibility}%`}
            hint="byte-stable across runs"
          />
          <Metric
            label="Pass rate"
            value={`${summary.passRate}%`}
            hint={`${summary.passed}/${summary.total} cases green`}
          />
        </div>
      </Section>

      <Section kicker="What it measures" kickerIndex="02" title="Five benchmark dimensions">
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Question</th>
                <th>How it's measured</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((d) => (
                <tr key={d.key}>
                  <td className={styles.caseTitle}>{d.name}</td>
                  <td>{d.question}</td>
                  <td className="u-muted">{d.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section kicker="Method" kickerIndex="03" title="Why the numbers are trustworthy">
        <div className="ui-grid">
          <Panel title="Determinism">
            <p>{methodology.determinism}</p>
          </Panel>
          <Panel title="Provenance">
            <p>{methodology.provenance}</p>
          </Panel>
        </div>
      </Section>
    </>
  );
}
