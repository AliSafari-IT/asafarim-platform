import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
import { AiEvalNav } from "../_components/AiEvalNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { leaderboard } from "../_data/benchmark";
import styles from "../_components/ai-eval.module.css";

export const metadata: Metadata = {
  title: "Case study — AI Evaluation Lab",
  description:
    "Evaluation design, tradeoffs, and failure analysis behind the provider-neutral, fixture-mode AI benchmark.",
};

const failuresBase = [
  { model: "Compact C", scenario: "groundedQa" },
  { model: "Compact C", scenario: "extraction" },
  { model: "Compact C", scenario: "toolSelection" },
];

export default async function AiEvalCaseStudyPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const failures = failuresBase.map((f) => ({
    ...f,
    what: t(`showcase.aiEval.caseStudy.failure.failures.${f.scenario}.what`),
    lesson: t(`showcase.aiEval.caseStudy.failure.failures.${f.scenario}.lesson`),
  }));
  return (
    <>
      <PageHeader
        kicker={t("showcase.aiEval.caseStudy.pageHeader.kicker")}
        kickerIndex="04"
        title={t("showcase.aiEval.caseStudy.pageHeader.title")}
        description={t("showcase.aiEval.caseStudy.pageHeader.description")}
      />

      <AiEvalNav active="/projects/ai-eval/case-study" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.aiEval.caseStudy.design.kicker")}
        kickerIndex="01"
        title={t("showcase.aiEval.caseStudy.design.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.aiEval.caseStudy.design.groundTruthFirst.title")}>
            <p>{t("showcase.aiEval.caseStudy.design.groundTruthFirst.body")}</p>
          </Panel>
          <Panel title={t("showcase.aiEval.caseStudy.design.providerNeutral.title")}>
            <p>{t("showcase.aiEval.caseStudy.design.providerNeutral.body")}</p>
          </Panel>
          <Panel title={t("showcase.aiEval.caseStudy.design.sixAxes.title")}>
            <p>{t("showcase.aiEval.caseStudy.design.sixAxes.body")}</p>
          </Panel>
          <Panel title={t("showcase.aiEval.caseStudy.design.versionedPrompts.title")}>
            <p>{t("showcase.aiEval.caseStudy.design.versionedPrompts.body")}</p>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.aiEval.caseStudy.tradeoffs.kicker")}
        kickerIndex="02"
        title={t("showcase.aiEval.caseStudy.tradeoffs.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.aiEval.caseStudy.tradeoffs.noLiveNumbers.title")}>
            <p>{t("showcase.aiEval.caseStudy.tradeoffs.noLiveNumbers.body")}</p>
          </Panel>
          <Panel title={t("showcase.aiEval.caseStudy.tradeoffs.smallData.title")}>
            <p>{t("showcase.aiEval.caseStudy.tradeoffs.smallData.body")}</p>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.aiEval.caseStudy.failure.kicker")}
        kickerIndex="03"
        title={t("showcase.aiEval.caseStudy.failure.title")}
      >
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("showcase.aiEval.caseStudy.failure.table.model")}</th>
                <th>{t("showcase.aiEval.caseStudy.failure.table.scenario")}</th>
                <th>{t("showcase.aiEval.caseStudy.failure.table.what")}</th>
                <th>{t("showcase.aiEval.caseStudy.failure.table.lesson")}</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={`${f.model}-${f.scenario}`}>
                  <td><strong>{f.model}</strong></td>
                  <td className={styles.mono}>{f.scenario}</td>
                  <td>{f.what}</td>
                  <td className="u-muted">{f.lesson}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="u-muted" style={{ marginTop: "var(--space-4)", maxWidth: "46rem" }}>
          {t("showcase.aiEval.caseStudy.failure.summary")
            .replace(
              "{score}",
              String(
                Math.round(
                  leaderboard.models[leaderboard.models.length - 1].overall * 100
                )
              )
            )}
        </p>
      </Section>
    </>
  );
}
