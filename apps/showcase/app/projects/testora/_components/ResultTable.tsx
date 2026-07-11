import { Badge } from "@asafarim/ui";
import type { CaseArtifacts, SuiteGroup } from "../_data/types";
import { fmtDuration, statusBadge } from "./format";
import styles from "./testora.module.css";

function ArtifactChips({ artifacts }: { artifacts: CaseArtifacts }) {
  const items: Array<[keyof CaseArtifacts, string]> = [
    ["trace", "trace"],
    ["screenshot", "shot"],
    ["video", "video"],
    ["log", "log"],
  ];
  return (
    <span className={styles.artifacts}>
      {items.map(([key, label]) => (
        <span
          key={key}
          className={`${styles.chip} ${artifacts[key] ? styles.chipOn : ""}`}
          title={artifacts[key] ? `${label} captured` : `${label} not captured`}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/** Per-suite result table with status, dimension, timing, artifacts, diagnosis. */
export function ResultTable({ suites }: { suites: SuiteGroup[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Status</th>
            <th>Case</th>
            <th>Dimension</th>
            <th>Duration</th>
            <th>Artifacts</th>
          </tr>
        </thead>
        <tbody>
          {suites.map((group) => (
            <SuiteRows key={group.suite} group={group} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuiteRows({ group }: { group: SuiteGroup }) {
  return (
    <>
      <tr>
        <td colSpan={5} className={styles.caseId} style={{ paddingTop: "1rem" }}>
          {group.suite}
        </td>
      </tr>
      {group.cases.map((c) => {
        const badge = statusBadge(c.status);
        return (
          <tr key={c.id}>
            <td>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </td>
            <td>
              <div className={styles.caseTitle}>{c.title}</div>
              <div className={styles.caseId}>{c.id}</div>
              {c.diagnosis ? (
                <div className={styles.diagnosis}>{c.diagnosis}</div>
              ) : null}
            </td>
            <td className={styles.caseId}>{c.dimension}</td>
            <td className={styles.num}>{fmtDuration(c.durationMs)}</td>
            <td>
              <ArtifactChips artifacts={c.artifacts} />
            </td>
          </tr>
        );
      })}
    </>
  );
}
