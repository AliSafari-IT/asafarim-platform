import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ButtonLink, Card, Hero, Metric, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../lib/i18n-dictionaries";
import { AiEvalNav } from "./_components/AiEvalNav";
import { FixtureBanner } from "./_components/FixtureBanner";
import {
  getScenarioMeta,
  getDimensions,
  getMethodology,
  leaderboard,
} from "./_data/benchmark";
import styles from "./_components/ai-eval.module.css";

export const metadata: Metadata = {
  title: "AI Evaluation Lab",
  description:
    "A provider-neutral, fixture-mode AI benchmark: versioned prompts and synthetic datasets scored for correctness, groundedness, format compliance, latency, cost, and safety — reproducibly, with no API keys.",
};

export default async function AiEvalOverviewPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const top = leaderboard.models[0];
  const scenarioMeta = getScenarioMeta((key) => t(key));
  const dimensions = getDimensions((key) => t(key));
  const methodology = getMethodology((key) => t(key));
  return (
    <>
      <Hero
        kicker={t("showcase.aiEval.overview.hero.kicker")}
        kickerIndex="04"
        title={t("showcase.aiEval.overview.hero.title")}
        lede={t("showcase.aiEval.overview.hero.lede")}
        actions={
          <>
            <ButtonLink href="/projects/ai-eval/leaderboard">
              {t("showcase.aiEval.overview.hero.ctaPrimary")}
            </ButtonLink>
            <ButtonLink href="/projects/ai-eval/case-study" variant="secondary">
              {t("showcase.aiEval.overview.hero.ctaSecondary")}
            </ButtonLink>
          </>
        }
      />

      <AiEvalNav active="/projects/ai-eval" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.aiEval.overview.headline.kicker")}
        kickerIndex="01"
        title={t("showcase.aiEval.overview.headline.title")}
      >
        <div className="ui-grid ui-grid--metrics">
          <Metric
            label={t("showcase.aiEval.overview.metrics.topOverall.label")}
            value={`${Math.round(top.overall * 100)}%`}
            hint={top.label}
          />
          <Metric
            label={t("showcase.aiEval.overview.metrics.models.label")}
            value={leaderboard.models.length}
            hint={t("showcase.aiEval.overview.metrics.models.hint")}
          />
          <Metric
            label={t("showcase.aiEval.overview.metrics.scenarios.label")}
            value={scenarioMeta.length}
            hint={t("showcase.aiEval.overview.metrics.scenarios.hint")}
          />
          <Metric
            label={t("showcase.aiEval.overview.metrics.dimensions.label")}
            value={dimensions.length}
            hint={t("showcase.aiEval.overview.metrics.dimensions.hint")}
          />
          <Metric
            label={t("showcase.aiEval.overview.metrics.prompt.label")}
            value={leaderboard.version}
            hint={t("showcase.aiEval.overview.metrics.prompt.hint")}
          />
          <Metric
            label={t("showcase.aiEval.overview.metrics.apiKeys.label")}
            value="0"
            hint={t("showcase.aiEval.overview.metrics.apiKeys.hint")}
          />
        </div>
      </Section>

      <Section
        kicker={t("showcase.aiEval.overview.tasks.kicker")}
        kickerIndex="02"
        title={t("showcase.aiEval.overview.tasks.title")}
      >
        <div className="ui-grid ui-grid--wide">
          {scenarioMeta.map((s, i) => (
            <Card key={s.key} variant="gallery" title={`${String(i + 1).padStart(2, "0")} · ${s.name}`}>
              {s.summary}
            </Card>
          ))}
        </div>
      </Section>

      <Section
        kicker={t("showcase.aiEval.overview.scoring.kicker")}
        kickerIndex="03"
        title={t("showcase.aiEval.overview.scoring.title")}
      >
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("showcase.aiEval.overview.scoring.table.dimension")}</th>
                <th>{t("showcase.aiEval.overview.scoring.table.question")}</th>
                <th>{t("showcase.aiEval.overview.scoring.table.measure")}</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((d) => (
                <tr key={d.key}>
                  <td><strong>{d.name}</strong></td>
                  <td>{d.question}</td>
                  <td className="u-muted">{d.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        kicker={t("showcase.aiEval.overview.method.kicker")}
        kickerIndex="04"
        title={t("showcase.aiEval.overview.method.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.aiEval.overview.method.determinism.title")}>
            <p>{methodology.determinism}</p>
          </Panel>
          <Panel title={t("showcase.aiEval.overview.method.provenance.title")}>
            <p>{methodology.provenance}</p>
          </Panel>
        </div>
        <Panel title={t("showcase.aiEval.overview.method.limitations.title")}>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.4rem" }}>
            {methodology.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Panel>
      </Section>
    </>
  );
}
