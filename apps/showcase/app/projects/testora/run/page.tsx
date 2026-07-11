import type { Metadata } from "next";
import { Metric, PageHeader, Panel, Section, Timeline } from "@asafarim/ui";
import { TestoraNav } from "../_components/TestoraNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { ResultTable } from "../_components/ResultTable";
import { ClusterCard } from "../_components/ClusterCard";
import { ArtifactViewer } from "../_components/ArtifactViewer";
import { runDetail } from "../_data/benchmark";
import { fmtDuration } from "../_components/format";
import styles from "../_components/testora.module.css";

export const metadata: Metadata = {
  title: "Latest run — Testora benchmark",
  description:
    "The reference Testora run: event timeline, per-case results, failure clusters with diagnostics, and a read-only artifact viewer.",
};

export default function TestoraRunPage() {
  const { runId, ref, summary, scores, suites, clusters, timeline, durationMs } =
    runDetail;
  const artifactCases = suites
    .flatMap((s) => s.cases)
    .filter((c) => c.status !== "passed");

  return (
    <>
      <PageHeader
        kicker={`Run ${runId}`}
        kickerIndex="03"
        title="Latest benchmark run"
        description={`${ref} · ${summary.total} cases · ${fmtDuration(durationMs)} · chromium, 1 worker`}
      />

      <TestoraNav active="/projects/testora/run" />

      <FixtureBanner />

      <Section kicker="At a glance" kickerIndex="01" title="Run summary">
        <div className="ui-grid ui-grid--metrics">
          <Metric label="Passed" value={summary.passed} hint={`of ${summary.total}`} />
          <Metric label="Failed" value={summary.failed} hint="seeded regressions" />
          <Metric label="Flaky" value={summary.flaky} hint="fail-then-pass" />
          <Metric label="Detection" value={`${scores.detectionRate}%`} hint="of seeded regressions" />
        </div>
      </Section>

      <Section kicker="Sequence" kickerIndex="02" title="Run timeline">
        <Panel title="event stream">
          <Timeline items={timeline} />
        </Panel>
      </Section>

      <Section kicker="Results" kickerIndex="03" title="Every case, every dimension">
        <ResultTable suites={suites} />
      </Section>

      <Section
        kicker="Diagnosis"
        kickerIndex="04"
        title="Failure clusters"
      >
        <div className={styles.clusterGrid}>
          {clusters.map((c) => (
            <ClusterCard key={c.key} cluster={c} />
          ))}
        </div>
      </Section>

      <Section kicker="Evidence" kickerIndex="05" title="Artifact viewer">
        <Panel title="recorded artifacts (read-only)">
          <ArtifactViewer cases={artifactCases} />
        </Panel>
      </Section>
    </>
  );
}
