import { Badge, Card } from "@asafarim/ui";
import type { Regression } from "../_data/types";
import { ScoreBar } from "./ScoreBar";
import { pretty } from "./format";
import styles from "./ai-eval.module.css";

/** Side-by-side v1→v2 comparison for the model that regressed. */
export function RegressionDiff({ regression }: { regression: Regression }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {regression.rows.map((row) => (
        <Card key={row.caseId} variant="console">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <strong className={styles.mono}>{row.caseId}</strong>
            {row.regressed ? (
              <Badge tone="danger">Regressed</Badge>
            ) : (
              <Badge tone="neutral">No change</Badge>
            )}
          </div>
          <div className={styles.diffGrid}>
            <div>
              <p className={styles.mono}>prompt v1</p>
              <pre className={styles.code}>{pretty(row.v1.output)}</pre>
              <div className={styles.scoreRow}>
                <span>correct <ScoreBar value={row.v1.scores.correctness} /></span>
                <span>format <ScoreBar value={row.v1.scores.format} /></span>
              </div>
            </div>
            <div>
              <p className={styles.mono}>prompt v2</p>
              <pre className={styles.code}>{pretty(row.v2.output)}</pre>
              <div className={styles.scoreRow}>
                <span>correct <ScoreBar value={row.v2.scores.correctness} /></span>
                <span>format <ScoreBar value={row.v2.scores.format} /></span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
