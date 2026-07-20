import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
import { TestoraNav } from "../_components/TestoraNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { TrendChart } from "../_components/TrendChart";
import { runsHistory } from "../_data/benchmark";
import { fmtDuration } from "../_components/format";
import styles from "../_components/testora.module.css";

export const metadata: Metadata = {
  title: "Trend — Testora benchmark",
  description:
    "Detection rate and pass rate across recorded fixture runs of the Testora benchmark.",
};

export default async function TestoraTrendPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const { runs } = runsHistory;
  return (
    <>
      <PageHeader
        kicker={t("showcase.testora.trend.pageHeader.kicker")}
        kickerIndex="03"
        title={t("showcase.testora.trend.pageHeader.title")}
        description={t("showcase.testora.trend.pageHeader.description")}
      />

      <TestoraNav active="/projects/testora/trend" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.testora.trend.chart.kicker")}
        kickerIndex="01"
        title={t("showcase.testora.trend.chart.title")}
      >
        <Panel title={t("showcase.testora.trend.chart.panelTitle")}>
          <TrendChart runs={runs} />
        </Panel>
      </Section>

      <Section
        kicker={t("showcase.testora.trend.runs.kicker")}
        kickerIndex="02"
        title={t("showcase.testora.trend.runs.title")}
      >
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("showcase.testora.trend.table.run")}</th>
                <th>{t("showcase.testora.trend.table.ref")}</th>
                <th>{t("showcase.testora.trend.table.when")}</th>
                <th>{t("showcase.testora.trend.table.detection")}</th>
                <th>{t("showcase.testora.trend.table.passRate")}</th>
                <th>{t("showcase.testora.trend.table.flakyId")}</th>
                <th>{t("showcase.testora.trend.table.duration")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId}>
                  <td className={styles.caseId}>{r.runId}</td>
                  <td className={styles.caseId}>{r.ref}</td>
                  <td className="u-muted">{r.at.slice(0, 10)}</td>
                  <td className={styles.num}>{r.detectionRate}%</td>
                  <td className={styles.num}>{r.passRate}%</td>
                  <td>
                    <Badge tone={r.flakyIdentified ? "success" : "neutral"}>
                      {t(
                        r.flakyIdentified
                          ? "showcase.common.yes"
                          : "showcase.common.no"
                      )}
                    </Badge>
                  </td>
                  <td className={styles.num}>{fmtDuration(r.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
