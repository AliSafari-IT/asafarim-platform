import { pct, scoreTone } from "./format";
import styles from "./ai-eval.module.css";

/**
 * A 0–1 score as a bar + numeric percent. The percent is the non-color cue, so
 * the value is legible without relying on the tone color (accessibility).
 */
export function ScoreBar({ value }: { value: number | null }) {
  if (value == null) {
    return <span className={styles.scoreNA} title="not applicable to this scenario">n/a</span>;
  }
  const tone = scoreTone(value);
  return (
    <span
      className={styles.score}
      role="meter"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`score ${pct(value)}`}
    >
      <span className={styles.scoreTrack}>
        <span
          className={`${styles.scoreFill} ${styles[tone]}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      <span className={styles.scoreVal}>{pct(value)}</span>
    </span>
  );
}
