import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ButtonLink, Hero, Metric, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../lib/i18n-dictionaries";
import { ViontoNav } from "./_components/ViontoNav";
import { FixtureBanner } from "./_components/FixtureBanner";
import { getDimensions, scores } from "./_data/benchmark";
import { fmtMs, fmtUsd } from "./_components/format";

export const metadata: Metadata = {
  title: "Vionto Studio — transparent AI media-pipeline benchmark",
  description:
    "A deterministic AI media-pipeline benchmark: a schema-validated brief-to-render pipeline, an approval-gated job state machine with idempotent retry, seeded stage failures, and cost/latency estimation — all in fixture mode with no live providers.",
};

export default async function ViontoOverviewPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const { dimensions: d } = scores;
  const dimensions = getDimensions((key) => t(key));
  return (
    <>
      <Hero
        kicker={t("showcase.vionto.overview.hero.kicker")}
        kickerIndex="05"
        title={t("showcase.vionto.overview.hero.title")}
        lede={t("showcase.vionto.overview.hero.lede")}
        actions={
          <>
            <ButtonLink href="/projects/vionto/pipeline">
              {t("showcase.vionto.overview.hero.ctaPrimary")}
            </ButtonLink>
            <ButtonLink href="/projects/vionto/case-study" variant="secondary">
              {t("showcase.vionto.overview.hero.ctaSecondary")}
            </ButtonLink>
          </>
        }
      />

      <ViontoNav active="/projects/vionto" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.vionto.overview.headline.kicker")}
        kickerIndex="01"
        title={t("showcase.vionto.overview.headline.title")}
      >
        <div className="ui-grid ui-grid--metrics">
          <Metric
            label={t("showcase.vionto.overview.metrics.structuredOutputValidity.label")}
            value={`${d.structuredOutputValidity.value}%`}
            hint={t("showcase.vionto.overview.metrics.structuredOutputValidity.hint")}
          />
          <Metric
            label={t("showcase.vionto.overview.metrics.retryIdempotency.label")}
            value={`${d.retryIdempotencyCorrectness.value}%`}
            hint={t("showcase.vionto.overview.metrics.retryIdempotency.hint")}
          />
          <Metric
            label={t("showcase.vionto.overview.metrics.completionTime.label")}
            value={fmtMs(d.endToEndCompletionTime.value)}
            hint={t("showcase.vionto.overview.metrics.completionTime.hint")}
          />
          <Metric
            label={t("showcase.vionto.overview.metrics.costDelta.label")}
            value={fmtUsd(d.estimatedVsObservedCost.value)}
            hint={t("showcase.vionto.overview.metrics.costDelta.hint")}
          />
          <Metric
            label={t("showcase.vionto.overview.metrics.seededFailureRecovery.label")}
            value={`${d.seededFailureRecovery.value}%`}
            hint={t("showcase.vionto.overview.metrics.seededFailureRecovery.hint")}
          />
        </div>
      </Section>

      <Section
        kicker={t("showcase.vionto.overview.dimensions.kicker")}
        kickerIndex="02"
        title={t("showcase.vionto.overview.dimensions.title")}
      >
        <div className="ui-grid">
          {dimensions.map((dim) => (
            <Panel key={dim.key} title={dim.name}>
              <p>{dim.question}</p>
              <p className="u-muted" style={{ marginTop: "0.4rem" }}>
                {t(`showcase.vionto.overview.scores.${dim.key}.method`)}
              </p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section
        kicker={t("showcase.vionto.overview.method.kicker")}
        kickerIndex="03"
        title={t("showcase.vionto.overview.method.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.vionto.overview.method.approvalGates.title")}>
            <p>{t("showcase.vionto.overview.method.approvalGates.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.overview.method.idempotentRetry.title")}>
            <p>{t("showcase.vionto.overview.method.idempotentRetry.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.overview.method.providers.title")}>
            <p>{t("showcase.vionto.overview.method.providers.body")}</p>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.vionto.overview.honesty.kicker")}
        kickerIndex="04"
        title={t("showcase.vionto.overview.honesty.title")}
      >
        <Panel title={t("showcase.vionto.overview.honesty.panelTitle")}>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {[
              t("showcase.vionto.overview.honesty.limitations.p1"),
              t("showcase.vionto.overview.honesty.limitations.p2"),
              t("showcase.vionto.overview.honesty.limitations.p3"),
              t("showcase.vionto.overview.honesty.limitations.p4"),
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
