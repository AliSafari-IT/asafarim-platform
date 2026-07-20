"use client";

import { Badge } from "@asafarim/ui";
import { useTranslation } from "@asafarim/shared-i18n";
import type { CaseArtifacts, SuiteGroup } from "../_data/types";
import { fmtDuration, statusTone } from "./format";
import styles from "./testora.module.css";

function ArtifactChips({ artifacts }: { artifacts: CaseArtifacts }) {
  const { t } = useTranslation();
  const items: Array<[keyof CaseArtifacts, string]> = [
    ["trace", t("showcase.testora.resultTable.artifact.trace")],
    ["screenshot", t("showcase.testora.resultTable.artifact.screenshot")],
    ["video", t("showcase.testora.resultTable.artifact.video")],
    ["log", t("showcase.testora.resultTable.artifact.log")],
  ];
  return (
    <span className={styles.artifacts}>
      {items.map(([key, label]) => (
        <span
          key={key}
          className={`${styles.chip} ${artifacts[key] ? styles.chipOn : ""}`}
          title={
            artifacts[key]
              ? t("showcase.testora.resultTable.artifact.captured", { label })
              : t("showcase.testora.resultTable.artifact.notCaptured", { label })
          }
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/** Per-suite result table with status, dimension, timing, artifacts, diagnosis. */
export function ResultTable({ suites }: { suites: SuiteGroup[] }) {
  const { t } = useTranslation();
  return (
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t("showcase.testora.resultTable.status")}</th>
            <th>{t("showcase.testora.resultTable.case")}</th>
            <th>{t("showcase.testora.resultTable.dimension")}</th>
            <th>{t("showcase.testora.resultTable.duration")}</th>
            <th>{t("showcase.testora.resultTable.artifacts")}</th>
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
  const { t } = useTranslation();
  return (
    <>
      <tr>
        <td
          colSpan={5}
          className={styles.caseId}
          style={{ paddingTop: "1rem" }}
        >
          {t("showcase.testora.resultTable.suite")} · {group.suite}
        </td>
      </tr>
      {group.cases.map((c) => {
        const tone = statusTone(c.status);
        return (
          <tr key={c.id}>
            <td>
              <Badge tone={tone}>
                {t(`showcase.testora.status.${c.status}`)}
              </Badge>
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
