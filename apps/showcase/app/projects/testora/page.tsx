import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ButtonLink, Hero, Metric, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../lib/i18n-dictionaries";
import { TestoraNav } from "./_components/TestoraNav";
import { FixtureBanner } from "./_components/FixtureBanner";
import { getDimensions, getMethodology, runDetail } from "./_data/benchmark";
import { fmtDuration } from "./_components/format";
import styles from "./_components/testora.module.css";

export const metadata: Metadata = {
  title: "Testora — test-automation benchmark",
  description:
    "A deterministic Playwright benchmark: a seeded sample app with intentional pass/fail/flaky tests, scored on detection, flake identification, diagnosis speed, artifact completeness, and reproducibility.",
};

export default async function TestoraOverviewPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const { scores, summary } = runDetail;
  const dimensions = getDimensions((key) => t(key));
  const methodology = getMethodology((key) => t(key));
  return (
    <>
      <Hero
        kicker={t("showcase.testora.overview.hero.kicker")}
        kickerIndex="03"
        title={t("showcase.testora.overview.hero.title")}
        lede={t("showcase.testora.overview.hero.lede")}
        actions={
          <>
            <ButtonLink href="/projects/testora/run">
              {t("showcase.testora.overview.hero.ctaPrimary")}
            </ButtonLink>
            <ButtonLink href="/projects/testora/case-study" variant="secondary">
              {t("showcase.testora.overview.hero.ctaSecondary")}
            </ButtonLink>
          </>
        }
      />

      <TestoraNav active="/projects/testora" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.testora.overview.headline.kicker")}
        kickerIndex="01"
        title={t("showcase.testora.overview.headline.title")}
      >
        <div className="ui-grid ui-grid--metrics">
          <Metric
            label={t("showcase.testora.overview.metrics.detectionRate.label")}
            value={`${scores.detectionRate}%`}
            hint={t(
              "showcase.testora.overview.metrics.detectionRate.hint",
              {
                detected: scores.regressionsDetected,
                total: scores.seededRegressions,
              }
            )}
          />
          <Metric
            label={t("showcase.testora.overview.metrics.flakyIdentified.label")}
            value={t(
              scores.flakyIdentified
                ? "showcase.common.yes"
                : "showcase.common.no"
            )}
            hint={t("showcase.testora.overview.metrics.flakyIdentified.hint")}
          />
          <Metric
            label={t("showcase.testora.overview.metrics.timeToDiagnosis.label")}
            value={fmtDuration(scores.meanTimeToDiagnosisMs)}
            hint={t("showcase.testora.overview.metrics.timeToDiagnosis.hint")}
          />
          <Metric
            label={t(
              "showcase.testora.overview.metrics.artifactCompleteness.label"
            )}
            value={`${scores.artifactCompleteness}%`}
            hint={t(
              "showcase.testora.overview.metrics.artifactCompleteness.hint"
            )}
          />
          <Metric
            label={t(
              "showcase.testora.overview.metrics.ciReproducibility.label"
            )}
            value={`${scores.ciReproducibility}%`}
            hint={t(
              "showcase.testora.overview.metrics.ciReproducibility.hint"
            )}
          />
          <Metric
            label={t("showcase.testora.overview.metrics.passRate.label")}
            value={`${summary.passRate}%`}
            hint={t(
              "showcase.testora.overview.metrics.passRate.hint",
              { passed: summary.passed, total: summary.total }
            )}
          />
        </div>
      </Section>

      <Section
        kicker={t("showcase.testora.overview.dimensions.kicker")}
        kickerIndex="02"
        title={t("showcase.testora.overview.dimensions.title")}
      >
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("showcase.testora.overview.dimensions.table.dimension")}</th>
                <th>{t("showcase.testora.overview.dimensions.table.question")}</th>
                <th>{t("showcase.testora.overview.dimensions.table.measured")}</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((d) => (
                <tr key={d.key}>
                  <td className={styles.caseTitle}>{d.name}</td>
                  <td>{d.question}</td>
                  <td className="u-muted">{d.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        kicker={t("showcase.testora.overview.method.kicker")}
        kickerIndex="03"
        title={t("showcase.testora.overview.method.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.testora.overview.method.determinism.title")}>
            <p>{methodology.determinism}</p>
          </Panel>
          <Panel title={t("showcase.testora.overview.method.provenance.title")}>
            <p>{methodology.provenance}</p>
          </Panel>
        </div>
      </Section>
    </>
  );
}
