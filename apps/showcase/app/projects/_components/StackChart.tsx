import type { ShowcaseProject } from "../data";
import styles from "./analysis.module.css";

/**
 * Horizontal bar chart of how often each technology appears across the wall.
 * Bars are <div>s sized with a percentage width, which keeps them readable at
 * any container width, and every bar states its own count as text so the chart
 * is not the only way to read the number.
 */
export function StackChart({ projects }: { projects: ShowcaseProject[] }) {
  const counts = new Map<string, number>();
  for (const project of projects) {
    for (const tech of project.stack) {
      counts.set(tech, (counts.get(tech) ?? 0) + 1);
    }
  }

  const rows = [...counts.entries()]
    // Most-used first; ties broken alphabetically so the order is stable
    // between renders rather than dependent on insertion order.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10);
  const max = Math.max(1, ...rows.map(([, count]) => count));

  return (
    <ul className={styles.barList}>
      {rows.map(([tech, count]) => (
        <li key={tech} className={styles.barRow}>
          <span className={styles.barLabel}>{tech}</span>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className={styles.barValue}>
            {count}
            <span className={styles.srOnly}> {count === 1 ? "project" : "projects"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Status mix across the wall, as a single stacked bar plus a legend. */
export function StatusChart({ projects }: { projects: ShowcaseProject[] }) {
  const order = ["live", "beta", "planned", "archived"] as const;
  const counts = order.map((status) => ({
    status,
    count: projects.filter((project) => project.status === status).length,
  }));
  const total = Math.max(1, projects.length);
  const present = counts.filter((entry) => entry.count > 0);

  return (
    <div>
      <div className={styles.stack} role="img" aria-label={present.map((e) => `${e.count} ${e.status}`).join(", ")}>
        {present.map((entry) => (
          <span
            key={entry.status}
            className={styles.stackSeg}
            data-status={entry.status}
            style={{ width: `${(entry.count / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {present.map((entry) => (
          <li key={entry.status} className={styles.legendItem}>
            <span className={styles.legendSwatch} data-status={entry.status} aria-hidden="true" />
            <span className={styles.legendLabel}>{entry.status}</span>
            <span className={styles.legendValue}>{entry.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
