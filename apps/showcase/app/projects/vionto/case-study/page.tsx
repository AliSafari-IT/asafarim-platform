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
import styles from "../_components/vionto.module.css";

export const metadata: Metadata = {
  title: "Case study — Vionto Studio",
  description:
    "From a personal AI video-story app to a transparent pipeline benchmark: architecture, tradeoffs, and lessons about building reliable AI workflows.",
};

const evolutionKeys = ["personalProject", "benchmark"];
const towardProductionKeys = [
  "showcase.vionto.caseStudy.towardProduction.0",
  "showcase.vionto.caseStudy.towardProduction.1",
  "showcase.vionto.caseStudy.towardProduction.2",
  "showcase.vionto.caseStudy.towardProduction.3",
];

export default async function ViontoCaseStudyPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const evolution = evolutionKeys.map((key) => ({
    key,
    stage: t(`showcase.vionto.caseStudy.evolution.${key}.stage`),
    stack: t(`showcase.vionto.caseStudy.evolution.${key}.stack`),
    idea: t(`showcase.vionto.caseStudy.evolution.${key}.idea`),
    limit: t(`showcase.vionto.caseStudy.evolution.${key}.limit`),
  }));
  const towardProduction = towardProductionKeys.map((key) => t(key));
  return (
    <>
      <PageHeader
        kicker={t("showcase.vionto.caseStudy.pageHeader.kicker")}
        kickerIndex="05"
        title={t("showcase.vionto.caseStudy.pageHeader.title")}
        description={t("showcase.vionto.caseStudy.pageHeader.description")}
      />

      <ViontoNav active="/projects/vionto/case-study" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.vionto.caseStudy.section.evolution.kicker")}
        kickerIndex="01"
        title={t("showcase.vionto.caseStudy.section.evolution.title")}
      >
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("showcase.vionto.caseStudy.table.stage")}</th>
                <th>{t("showcase.vionto.caseStudy.table.stack")}</th>
                <th>{t("showcase.vionto.caseStudy.table.idea")}</th>
                <th>{t("showcase.vionto.caseStudy.table.limit")}</th>
              </tr>
            </thead>
            <tbody>
              {evolution.map((e) => (
                <tr key={e.key}>
                  <td>
                    <strong>{e.stage}</strong>
                  </td>
                  <td className={styles.mono}>{e.stack}</td>
                  <td>{e.idea}</td>
                  <td className="u-muted">{e.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        kicker={t("showcase.vionto.caseStudy.section.architecture.kicker")}
        kickerIndex="02"
        title={t("showcase.vionto.caseStudy.section.architecture.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.vionto.caseStudy.architecture.constraintsFirst.title")}>
            <p>{t("showcase.vionto.caseStudy.architecture.constraintsFirst.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.caseStudy.architecture.approval.title")}>
            <p>{t("showcase.vionto.caseStudy.architecture.approval.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.caseStudy.architecture.retry.title")}>
            <p>{t("showcase.vionto.caseStudy.architecture.retry.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.caseStudy.architecture.oneEngine.title")}>
            <p>{t("showcase.vionto.caseStudy.architecture.oneEngine.body")}</p>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.vionto.caseStudy.section.tradeoffs.kicker")}
        kickerIndex="03"
        title={t("showcase.vionto.caseStudy.section.tradeoffs.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.vionto.caseStudy.tradeoffs.noLiveGeneration.title")}>
            <p>{t("showcase.vionto.caseStudy.tradeoffs.noLiveGeneration.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.caseStudy.tradeoffs.structuredReports.title")}>
            <p>{t("showcase.vionto.caseStudy.tradeoffs.structuredReports.body")}</p>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.vionto.caseStudy.section.lessons.kicker")}
        kickerIndex="04"
        title={t("showcase.vionto.caseStudy.section.lessons.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.vionto.caseStudy.lessons.stateMachine.title")}>
            <p>{t("showcase.vionto.caseStudy.lessons.stateMachine.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.caseStudy.lessons.costEstimate.title")}>
            <p>{t("showcase.vionto.caseStudy.lessons.costEstimate.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.caseStudy.lessons.production.title")}>
            <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
              {towardProduction.map((item, i) => (
                <li key={i} style={{ marginBottom: "0.3rem" }}>
                  {item}
                </li>
              ))}
            </ul>
            <Badge tone="info">{t("showcase.vionto.caseStudy.lessons.production.badge")}</Badge>
          </Panel>
        </div>
      </Section>
    </>
  );
}
