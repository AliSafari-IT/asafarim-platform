import { Check, X, Search, Bug, BellRing } from "lucide-react";
import styles from "./live-test-board.module.css";

/**
 * Hero illustration of what Testora is for: E2E suites exercising every
 * ASafarIM app like an end user, one failure surfacing, and the one-click
 * report flow — including the duplicate check that tells the reporter the bug
 * is already tracked. Clearly labelled as an illustrative preview: Testora is
 * not running live yet, so none of these numbers are real.
 *
 * Pure CSS animation (see the module), server-rendered; reduced-motion users
 * get the final state.
 */
const ROWS = [
  { app: "Hub", glyph: "HB", passed: 18, total: 18 },
  { app: "Vionto", glyph: "VN", passed: 23, total: 24, failing: true },
  { app: "EduMatch", glyph: "EM", passed: 31, total: 31 },
  { app: "AppBuilder", glyph: "AB", passed: 12, total: 12 },
  { app: "TimelineAI", glyph: "TL", passed: 9, total: 9 },
];

export function LiveTestBoard() {
  return (
    <div className={styles.board} aria-hidden="true">
      <div className={styles.bar}>
        <span className={styles.dots}>
          <span />
          <span />
          <span />
        </span>
        <span className={styles.title}>Live test board</span>
        <span className={styles.sample}>Illustrative preview</span>
      </div>

      <ul className={styles.rows}>
        {ROWS.map((row, i) => (
          <li
            key={row.app}
            className={row.failing ? styles.rowFail : styles.row}
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className={styles.glyph}>{row.glyph}</span>
            <span className={styles.app}>{row.app}</span>
            <span className={styles.track}>
              <span
                className={row.failing ? styles.fillFail : styles.fill}
                style={{ "--w": `${(row.passed / row.total) * 100}%` } as React.CSSProperties}
              />
            </span>
            <span className={styles.count}>
              {row.passed}/{row.total}
            </span>
            <span className={row.failing ? styles.badgeFail : styles.badgeOk}>
              {row.failing ? <X size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.failure}>
        <div className={styles.failHead}>
          <X size={13} strokeWidth={3} className={styles.failIcon} />
          <span className={styles.failPath}>Vionto › Export › download MP4</span>
        </div>
        <p className={styles.failMsg}>Expected 200, received 403 after render completed.</p>

        {/* Three states cycle: report → checking open issues → already tracked. */}
        <div className={styles.flow}>
          <span className={`${styles.state} ${styles.s1}`}>
            <span className={styles.reportBtn}>
              <Bug size={13} /> Report bug
            </span>
          </span>
          <span className={`${styles.state} ${styles.s2}`}>
            <Search size={13} className={styles.spin} /> Checking open issues on GitHub…
          </span>
          <span className={`${styles.state} ${styles.s3}`}>
            <BellRing size={13} /> Already tracked as <strong>#598</strong> — we’re on it.
          </span>
        </div>
        <p className={styles.flowNote}>No match? It’s filed as a new issue, evidence attached.</p>
      </div>
    </div>
  );
}
