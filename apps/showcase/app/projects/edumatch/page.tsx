import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ButtonLink, Hero, Metric, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../lib/i18n-dictionaries";
import { EdumatchNav } from "./_components/EdumatchNav";
import { FixtureBanner } from "./_components/FixtureBanner";
import { benchmarkScores, getDimensions } from "./_data/benchmark";

export const metadata: Metadata = {
  title: "EduMatch — explainable matching benchmark",
  description:
    "A deterministic, explainable tutor-matching benchmark: synthetic students and tutors, a transparent weighted-factor engine, and fairness/stability checks.",
};

export default async function EdumatchOverviewPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const { dimensions: d } = benchmarkScores;
  const dimensions = getDimensions((key) => t(key));
  return (
    <>
      <Hero
        kicker={t("showcase.edumatch.overview.hero.kicker")}
        kickerIndex="04"
        title={t("showcase.edumatch.overview.hero.title")}
        lede={t("showcase.edumatch.overview.hero.lede")}
        actions={
          <>
            <ButtonLink href="/projects/edumatch/explorer">
              {t("showcase.edumatch.overview.hero.ctaPrimary")}
            </ButtonLink>
            <ButtonLink href="/projects/edumatch/case-study" variant="secondary">
              {t("showcase.edumatch.overview.hero.ctaSecondary")}
            </ButtonLink>
          </>
        }
      />

      <EdumatchNav active="/projects/edumatch" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.edumatch.overview.headline.kicker")}
        kickerIndex="01"
        title={t("showcase.edumatch.overview.headline.title")}
      >
        <div className="ui-grid ui-grid--metrics">
          <Metric
            label={t("showcase.edumatch.overview.metrics.matchRelevance.label")}
            value={`${d.matchRelevance.value}%`}
            hint={t("showcase.edumatch.overview.metrics.matchRelevance.hint")}
          />
          <Metric
            label={t(
              "showcase.edumatch.overview.metrics.constraintSatisfaction.label"
            )}
            value={`${d.constraintSatisfaction.value}%`}
            hint={t(
              "showcase.edumatch.overview.metrics.constraintSatisfaction.hint"
            )}
          />
          <Metric
            label={t("showcase.edumatch.overview.metrics.explainability.label")}
            value={`${d.explainabilityCoverage.value}%`}
            hint={t("showcase.edumatch.overview.metrics.explainability.hint")}
          />
          <Metric
            label={t("showcase.edumatch.overview.metrics.fairness.label")}
            value={d.fairness.value.toFixed(3)}
            hint={t("showcase.edumatch.overview.metrics.fairness.hint")}
          />
          <Metric
            label={t(
              "showcase.edumatch.overview.metrics.rankingStability.label"
            )}
            value={`${d.rankingStability.value}%`}
            hint={t(
              "showcase.edumatch.overview.metrics.rankingStability.hint"
            )}
          />
        </div>
      </Section>

      <Section
        kicker={t("showcase.edumatch.overview.dimensions.kicker")}
        kickerIndex="02"
        title={t("showcase.edumatch.overview.dimensions.title")}
      >
        <div className="ui-grid">
          {dimensions.map((dim) => (
            <Panel key={dim.key} title={dim.name}>
              <p>{dim.question}</p>
              <p className="u-muted" style={{ marginTop: "0.4rem" }}>
                {t(`showcase.edumatch.overview.scores.${dim.key}.method`)}
              </p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section
        kicker={t("showcase.edumatch.overview.method.kicker")}
        kickerIndex="03"
        title={t("showcase.edumatch.overview.method.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.edumatch.overview.method.determinism.title")}>
            <p>{t("showcase.edumatch.overview.method.determinism.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.overview.method.adjustableWeights.title")}>
            <p>{t("showcase.edumatch.overview.method.adjustableWeights.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.overview.method.sensitiveAttributes.title")}>
            <p>{t("showcase.edumatch.overview.method.sensitiveAttributes.body")}</p>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.edumatch.overview.honesty.kicker")}
        kickerIndex="04"
        title={t("showcase.edumatch.overview.honesty.title")}
      >
        <Panel title={t("showcase.edumatch.overview.honesty.panelTitle")}>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {[
              t("showcase.edumatch.overview.honesty.limitations.p1"),
              t("showcase.edumatch.overview.honesty.limitations.p2"),
              t("showcase.edumatch.overview.honesty.limitations.p3"),
            ].map((l) => (
              <li key={l} style={{ marginBottom: "0.4rem" }}>
                {l}
              </li>
            ))}
          </ul>
        </Panel>
      </Section>
    </>
  );
}
