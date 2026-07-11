import type { LeaderboardRow } from "../_data/types";
import { ScoreBar } from "./ScoreBar";
import { fmtCostPer1k, fmtLatency } from "./format";
import styles from "./ai-eval.module.css";

/** Ranked leaderboard over the checked-in fixture results. */
export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Model</th>
            <th>Overall</th>
            <th>Correct</th>
            <th>Grounded</th>
            <th>Format</th>
            <th>Safety</th>
            <th>Latency</th>
            <th>$/1k</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={m.id}>
              <td className={styles.rank}>{i + 1}</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <strong>{m.label}</strong>
                  <span className={styles.tierBadge}>{m.tier}</span>
                </div>
                <div className={styles.mono}>{m.note}</div>
              </td>
              <td><ScoreBar value={m.overall} /></td>
              <td><ScoreBar value={m.correctness} /></td>
              <td><ScoreBar value={m.groundedness} /></td>
              <td><ScoreBar value={m.format} /></td>
              <td><ScoreBar value={m.safety} /></td>
              <td className={styles.num}>{fmtLatency(m.meanLatencyMs)}</td>
              <td className={styles.num}>{fmtCostPer1k(m.costPer1kUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
