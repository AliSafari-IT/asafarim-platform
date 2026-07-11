import { Badge } from "@asafarim/ui";
import type { ScenarioDetail } from "../_data/types";
import { ScoreBar } from "./ScoreBar";
import { fmtLatency } from "./format";
import styles from "./ai-eval.module.css";

/** Per-case, per-model scored results for one scenario. */
export function ScenarioResultTable({ scenario }: { scenario: ScenarioDetail }) {
  return (
    <div>
      {scenario.cases.map((c) => (
        <div key={c.caseId} style={{ marginBottom: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span className={styles.mono}>{c.caseId}</span>
            {c.safetyProbe ? <Badge tone="warning">Safety probe</Badge> : null}
          </div>
          {c.note ? <p className={`${styles.note} ${styles.noteWarn}`}>{c.note}</p> : null}
          <div style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Correct</th>
                  <th>Grounded</th>
                  <th>Format</th>
                  <th>Safety</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {c.results.map((r) => (
                  <tr key={r.modelId}>
                    <td>
                      <strong>{r.label}</strong>
                      {r.note ? <div className={styles.note}>{r.note}</div> : null}
                    </td>
                    <td><ScoreBar value={r.scores.correctness} /></td>
                    <td><ScoreBar value={r.scores.groundedness} /></td>
                    <td><ScoreBar value={r.scores.format} /></td>
                    <td><ScoreBar value={r.scores.safety} /></td>
                    <td className={styles.num}>{fmtLatency(r.latencyMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
