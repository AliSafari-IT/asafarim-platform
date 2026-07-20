import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Metric, PageHeader, Panel, Section, Timeline } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
import { TestoraNav } from "../_components/TestoraNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { ResultTable } from "../_components/ResultTable";
import { ClusterCard } from "../_components/ClusterCard";
import { ArtifactViewer } from "../_components/ArtifactViewer";
import { runDetail } from "../_data/benchmark";
import { fmtDuration } from "../_components/format";
import styles from "../_components/testora.module.css";

export const metadata: Metadata = {
  title: "Latest run — Testora benchmark",
  description:
    "The reference Testora run: event timeline, per-case results, failure clusters with diagnostics, and a read-only artifact viewer.",
};

export default async function TestoraRunPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const { runId, ref, summary, scores, suites, clusters, timeline, durationMs } =
    runDetail;
  const artifactCases = suites
    .flatMap((s) => s.cases)
    .filter((c) => c.status !== "passed");

  return (
    <>
      <PageHeader
        kicker={`Run ${runId}`}
        kickerIndex="03"
        title={t("showcase.testora.run.pageHeader.title")}
        description={`${ref} · ${summary.total} cases · ${fmtDuration(durationMs)} · chromium, 1 worker`}
      />

      <TestoraNav active="/projects/testora/run" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.testora.run.summary.kicker")}
        kickerIndex="01"
        title={t("showcase.testora.run.summary.title")}
      >
        <div className="ui-grid ui-grid--metrics">
          <Metric
            label={t("showcase.testora.run.metrics.passed.label")}
            value={summary.passed}
            hint={t("showcase.testora.run.metrics.passed.hint", {
              total: summary.total,
            })}
          />
          <Metric
            label={t("showcase.testora.run.metrics.failed.label")}
            value={summary.failed}
            hint={t("showcase.testora.run.metrics.failed.hint")}
          />
          <Metric
            label={t("showcase.testora.run.metrics.flaky.label")}
            value={summary.flaky}
            hint={t("showcase.testora.run.metrics.flaky.hint")}
          />
          <Metric
            label={t("showcase.testora.run.metrics.detection.label")}
            value={`${scores.detectionRate}%`}
            hint={t("showcase.testora.run.metrics.detection.hint")}
          />
        </div>
      </Section>

      <Section
        kicker={t("showcase.testora.run.timeline.kicker")}
        kickerIndex="02"
        title={t("showcase.testora.run.timeline.title")}
      >
        <Panel title={t("showcase.testora.run.timeline.panelTitle")}>
          <Timeline items={timeline} />
        </Panel>
      </Section>

      <Section
        kicker={t("showcase.testora.run.results.kicker")}
        kickerIndex="03"
        title={t("showcase.testora.run.results.title")}
      >
        <ResultTable suites={suites} />
      </Section>

      <Section
        kicker={t("showcase.testora.run.diagnosis.kicker")}
        kickerIndex="04"
        title={t("showcase.testora.run.diagnosis.title")}
      >
        <div className={styles.clusterGrid}>
          {clusters.map((c) => (
            <ClusterCard key={c.key} cluster={c} />
          ))}
        </div>
      </Section>

      <Section
        kicker={t("showcase.testora.run.evidence.kicker")}
        kickerIndex="05"
        title={t("showcase.testora.run.evidence.title")}
      >
        <Panel title={t("showcase.testora.run.evidence.panelTitle")}>
          <ArtifactViewer cases={artifactCases} />
        </Panel>
      </Section>
    </>
  );
}
