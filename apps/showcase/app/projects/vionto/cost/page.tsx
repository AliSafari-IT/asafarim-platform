import type { Metadata } from "next";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import { ViontoNav } from "../_components/ViontoNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { fmtMs, fmtUsd } from "../_components/format";
import { runs, scores } from "../_data/benchmark";
import styles from "../_components/vionto.module.css";

export const metadata: Metadata = {
  title: "Cost — Vionto Studio",
  description:
    "Estimated vs. observed cost and latency for every Vionto Studio reference run, computed from fixed reference rates — never live provider pricing.",
};

export default function ViontoCostPage() {
  return (
    <>
      <PageHeader
        kicker="Cost"
        kickerIndex="05"
        title="Cost & latency, estimated before you spend it"
        description="Every run is estimated before any expensive stage executes. The acceptance criterion is that this benchmark reports cost/latency without fabricating live numbers — every figure below is either a fixed reference rate or recomputed from the same fixtures."
      />

      <ViontoNav active="/projects/vionto/cost" />

      <FixtureBanner />

      <Section kicker="Why zero delta" kickerIndex="01" title="Estimated vs. observed">
        <Panel title="fixture mode has no live variance">
          <p>{scores.dimensions.estimatedVsObservedCost.method}</p>
        </Panel>
      </Section>

      <Section kicker="Per run" kickerIndex="02" title="Estimate vs. observed, per reference run">
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Run</th>
                <th>Outcome</th>
                <th>Est. tokens</th>
                <th>Est. render seconds</th>
                <th>Estimated $</th>
                <th>Observed $</th>
                <th>Reference completion</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.briefId}>
                  <td>
                    <div>{run.title}</div>
                    <div className={styles.mono}>{run.briefId}</div>
                  </td>
                  <td>
                    <Badge tone={run.finalState === "succeeded" ? "success" : run.finalState === "cancelled" ? "warning" : "danger"}>
                      {run.finalState}
                    </Badge>
                  </td>
                  <td className={styles.num}>{run.costEstimate.scriptTokensEst}</td>
                  <td className={styles.num}>{run.costEstimate.renderSecondsEst.toFixed(1)}s</td>
                  <td className={styles.num}>{fmtUsd(run.costEstimate.usdEst)}</td>
                  <td className={styles.num}>{run.costObserved ? fmtUsd(run.costObserved.usdEst) : "—"}</td>
                  <td className={styles.num}>{run.finalState === "succeeded" ? fmtMs(run.referenceLatencyMs) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
