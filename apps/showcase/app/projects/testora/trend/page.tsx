import type { Metadata } from "next";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import { TestoraNav } from "../_components/TestoraNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { TrendChart } from "../_components/TrendChart";
import { runsHistory } from "../_data/benchmark";
import { fmtDuration } from "../_components/format";
import styles from "../_components/testora.module.css";

export const metadata: Metadata = {
  title: "Trend — Testora benchmark",
  description:
    "Detection rate and pass rate across recorded fixture runs of the Testora benchmark.",
};

export default function TestoraTrendPage() {
  const { runs } = runsHistory;
  return (
    <>
      <PageHeader
        kicker="History"
        kickerIndex="03"
        title="Benchmark trend"
        description="Detection rate and pass rate across recorded fixture runs. Fixture history — not production telemetry."
      />

      <TestoraNav active="/projects/testora/trend" />

      <FixtureBanner />

      <Section kicker="Over time" kickerIndex="01" title="Detection climbs to 100%">
        <Panel title="detection vs. pass rate">
          <TrendChart runs={runs} />
        </Panel>
      </Section>

      <Section kicker="Runs" kickerIndex="02" title="Recorded fixture runs">
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Run</th>
                <th>Ref</th>
                <th>When</th>
                <th>Detection</th>
                <th>Pass rate</th>
                <th>Flaky ID</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId}>
                  <td className={styles.caseId}>{r.runId}</td>
                  <td className={styles.caseId}>{r.ref}</td>
                  <td className="u-muted">{r.at.slice(0, 10)}</td>
                  <td className={styles.num}>{r.detectionRate}%</td>
                  <td className={styles.num}>{r.passRate}%</td>
                  <td>
                    <Badge tone={r.flakyIdentified ? "success" : "neutral"}>
                      {r.flakyIdentified ? "Yes" : "No"}
                    </Badge>
                  </td>
                  <td className={styles.num}>{fmtDuration(r.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
