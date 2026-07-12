import type { MatchFactor } from "../_data/types";
import styles from "./edumatch.module.css";

const LABELS: Record<MatchFactor["key"], string> = {
  distance: "Distance",
  subject: "Subject",
  level: "Level",
  rating: "Rating",
  verified: "Verified",
};

/** One factor's raw value, weight, and resulting contribution — the "why". */
export function FactorBar({ factor }: { factor: MatchFactor }) {
  const pct = Math.round(factor.value * 100);
  return (
    <div>
      <div className={styles.factorRow}>
        <span className={styles.factorLabel}>{LABELS[factor.key]}</span>
        <span className={styles.factorTrack}>
          <span className={styles.factorFill} style={{ width: `${pct}%` }} />
        </span>
        <span className={styles.factorVal}>
          {factor.value.toFixed(2)} × {factor.weight.toFixed(2)}
        </span>
      </div>
      <p className={styles.factorNote}>
        {factor.note} — contributes {factor.contribution.toFixed(3)}
      </p>
    </div>
  );
}
