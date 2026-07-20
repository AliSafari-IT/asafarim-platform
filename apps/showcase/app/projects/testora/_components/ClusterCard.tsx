"use client";

import { Badge, Card } from "@asafarim/ui";
import { useTranslation } from "@asafarim/shared-i18n";
import type { FailureCluster } from "../_data/types";
import styles from "./testora.module.css";

/** One failure cluster: title, why it groups, member cases, and a diagnosis. */
export function ClusterCard({ cluster }: { cluster: FailureCluster }) {
  const { t } = useTranslation();
  return (
    <Card variant="console">
      <div className={styles.clusterHead}>
        <strong>{cluster.title}</strong>
        <Badge tone={cluster.kind === "flaky" ? "warning" : "danger"}>
          {cluster.kind === "flaky"
            ? t("showcase.testora.clusterCard.flaky")
            : t("showcase.testora.clusterCard.regression")}
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
