import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
import { EdumatchNav } from "../_components/EdumatchNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import styles from "../_components/edumatch.module.css";

export const metadata: Metadata = {
  title: "Case study — EduMatch",
  description:
    "From a marketplace app to a focused, explainable matching benchmark: architecture, tradeoffs, and lessons.",
};

const evolutionKeys = ["personalProject", "benchmark"];
const towardProductionKeys = [
  "showcase.edumatch.caseStudy.towardProduction.0",
  "showcase.edumatch.caseStudy.towardProduction.1",
  "showcase.edumatch.caseStudy.towardProduction.2",
  "showcase.edumatch.caseStudy.towardProduction.3",
];

export default async function EdumatchCaseStudyPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const evolution = evolutionKeys.map((key) => ({
    key,
    stage: t(`showcase.edumatch.caseStudy.evolution.${key}.stage`),
    stack: t(`showcase.edumatch.caseStudy.evolution.${key}.stack`),
    idea: t(`showcase.edumatch.caseStudy.evolution.${key}.idea`),
    limit: t(`showcase.edumatch.caseStudy.evolution.${key}.limit`),
  }));
  const towardProduction = towardProductionKeys.map((key) => t(key));
  return (
    <>
      <PageHeader
        kicker={t("showcase.edumatch.caseStudy.pageHeader.kicker")}
        kickerIndex="04"
        title={t("showcase.edumatch.caseStudy.pageHeader.title")}
        description={t("showcase.edumatch.caseStudy.pageHeader.description")}
      />

      <EdumatchNav active="/projects/edumatch/case-study" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.edumatch.caseStudy.section.evolution.kicker")}
        kickerIndex="01"
        title={t("showcase.edumatch.caseStudy.section.evolution.title")}
      >
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("showcase.edumatch.caseStudy.table.stage")}</th>
                <th>{t("showcase.edumatch.caseStudy.table.stack")}</th>
                <th>{t("showcase.edumatch.caseStudy.table.idea")}</th>
                <th>{t("showcase.edumatch.caseStudy.table.limit")}</th>
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
        kicker={t("showcase.edumatch.caseStudy.section.architecture.kicker")}
        kickerIndex="02"
        title={t("showcase.edumatch.caseStudy.section.architecture.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.edumatch.caseStudy.architecture.constraintsFirst.title")}>
            <p>{t("showcase.edumatch.caseStudy.architecture.constraintsFirst.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.caseStudy.architecture.explainable.title")}>
            <p>{t("showcase.edumatch.caseStudy.architecture.explainable.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.caseStudy.architecture.oneEngine.title")}>
            <p>{t("showcase.edumatch.caseStudy.architecture.oneEngine.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.caseStudy.architecture.dampedRating.title")}>
            <p>{t("showcase.edumatch.caseStudy.architecture.dampedRating.body")}</p>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.edumatch.caseStudy.section.tradeoffs.kicker")}
        kickerIndex="03"
        title={t("showcase.edumatch.caseStudy.section.tradeoffs.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.edumatch.caseStudy.tradeoffs.noLiveMarketplace.title")}>
            <p>{t("showcase.edumatch.caseStudy.tradeoffs.noLiveMarketplace.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.caseStudy.tradeoffs.smallFixture.title")}>
            <p>{t("showcase.edumatch.caseStudy.tradeoffs.smallFixture.body")}</p>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.edumatch.caseStudy.section.lessons.kicker")}
        kickerIndex="04"
        title={t("showcase.edumatch.caseStudy.section.lessons.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.edumatch.caseStudy.lessons.explainability.title")}>
            <p>{t("showcase.edumatch.caseStudy.lessons.explainability.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.caseStudy.lessons.fairness.title")}>
            <p>{t("showcase.edumatch.caseStudy.lessons.fairness.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.caseStudy.lessons.production.title")}>
            <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
              {towardProduction.map((item, i) => (
                <li key={i} style={{ marginBottom: "0.3rem" }}>
                  {item}
                </li>
              ))}
            </ul>
            <Badge tone="info">{t("showcase.edumatch.caseStudy.lessons.production.badge")}</Badge>
          </Panel>
        </div>
      </Section>
    </>
  );
}
