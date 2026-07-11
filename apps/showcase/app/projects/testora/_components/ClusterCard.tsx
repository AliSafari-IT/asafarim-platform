import { Badge, Card } from "@asafarim/ui";
import type { FailureCluster } from "../_data/types";
import styles from "./testora.module.css";

/** One failure cluster: title, why it groups, member cases, and a diagnosis. */
export function ClusterCard({ cluster }: { cluster: FailureCluster }) {
  return (
    <Card variant="console">
      <div className={styles.clusterHead}>
        <strong>{cluster.title}</strong>
        <Badge tone={cluster.kind === "flaky" ? "warning" : "danger"}>
          {cluster.kind === "flaky" ? "Flaky" : "Regression"}
        </Badge>
      </div>
      <p className={styles.clusterHint}>{cluster.hint}</p>
      {cluster.diagnosis ? (
        <div className={styles.diagnosis}>{cluster.diagnosis}</div>
      ) : null}
      <div className={styles.clusterCases}>
        {cluster.caseIds.map((id) => (
          <span key={id} className={styles.caseId}>
            {id}
          </span>
        ))}
      </div>
    </Card>
  );
}
