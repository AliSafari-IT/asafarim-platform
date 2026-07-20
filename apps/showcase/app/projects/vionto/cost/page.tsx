import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
import { ViontoNav } from "../_components/ViontoNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { fmtMs, fmtUsd } from "../_components/format";
import { runs, scores } from "../_data/benchmark";
import styles from "../_components/vionto.module.css";

export const metadata: Metadata = {
  title: "Cost — Vionto Studio",
  description:
    "Estimated vs. observed cost and latency for every Vionto Studio reference run, computed from fixed reference rates — never live provider pricing.",
};

export default async function ViontoCostPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const stateKey = (state: string) => `showcase.vionto.state.${state}`;
  return (
    <>
      <PageHeader
        kicker={t("showcase.vionto.cost.pageHeader.kicker")}
        kickerIndex="05"
        title={t("showcase.vionto.cost.pageHeader.title")}
        description={t("showcase.vionto.cost.pageHeader.description")}
      />

      <ViontoNav active="/projects/vionto/cost" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.vionto.cost.section.why.kicker")}
        kickerIndex="01"
        title={t("showcase.vionto.cost.section.why.title")}
      >
        <Panel title={t("showcase.vionto.cost.panel.title")}>
          <p>{scores.dimensions.estimatedVsObservedCost.method}</p>
        </Panel>
      </Section>

      <Section
        kicker={t("showcase.vionto.cost.section.perRun.kicker")}
        kickerIndex="02"
        title={t("showcase.vionto.cost.section.perRun.title")}
      >
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("showcase.vionto.cost.table.run")}</th>
                <th>{t("showcase.vionto.cost.table.outcome")}</th>
                <th>{t("showcase.vionto.cost.table.estTokens")}</th>
                <th>{t("showcase.vionto.cost.table.estRenderSeconds")}</th>
                <th>{t("showcase.vionto.cost.table.estUsd")}</th>
                <th>{t("showcase.vionto.cost.table.obsUsd")}</th>
                <th>{t("showcase.vionto.cost.table.refCompletion")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.briefId}>
                  <td>
                    <div>{run.title}</div>
                    <div className={styles.mono}>{run.briefId}</div>
                  </td>
                  <td>
                    <Badge tone={run.finalState === "succeeded" ? "success" : run.finalState === "cancelled" ? "warning" : "danger"}>
                      {t(stateKey(run.finalState))}
                    </Badge>
                  </td>
                  <td className={styles.num}>{run.costEstimate.scriptTokensEst}</td>
                  <td className={styles.num}>{run.costEstimate.renderSecondsEst.toFixed(1)}s</td>
                  <td className={styles.num}>{fmtUsd(run.costEstimate.usdEst)}</td>
                  <td className={styles.num}>{run.costObserved ? fmtUsd(run.costObserved.usdEst) : "—"}</td>
                  <td className={styles.num}>{run.finalState === "succeeded" ? fmtMs(run.referenceLatencyMs) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
