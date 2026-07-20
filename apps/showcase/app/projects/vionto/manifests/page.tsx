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
import { StoryboardStrip } from "../_components/StoryboardStrip";
import { stateBadge } from "../_components/format";
import { runs } from "../_data/benchmark";
import styles from "../_components/vionto.module.css";

export const metadata: Metadata = {
  title: "Manifests — Vionto Studio",
  description:
    "Every stage artifact from a Vionto Studio run, with its recorded configuration version and inputs fingerprint — the versioned-artifact record the benchmark requires.",
};

const STAGE_ORDER = ["script", "storyboard", "assetPlan", "renderReport"] as const;
const STAGE_KEY: Record<(typeof STAGE_ORDER)[number], string> = {
  script: "showcase.vionto.manifests.stage.script",
  storyboard: "showcase.vionto.manifests.stage.storyboard",
  assetPlan: "showcase.vionto.manifests.stage.assetPlan",
  renderReport: "showcase.vionto.manifests.stage.renderReport",
};

export default async function ViontoManifestsPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  return (
    <>
      <PageHeader
        kicker={t("showcase.vionto.manifests.pageHeader.kicker")}
        kickerIndex="05"
        title={t("showcase.vionto.manifests.pageHeader.title")}
        description={t("showcase.vionto.manifests.pageHeader.description")}
      />

      <ViontoNav active="/projects/vionto/manifests" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.vionto.manifests.section.runs.kicker")}
        kickerIndex="01"
        title={t("showcase.vionto.manifests.section.runs.title")}
      >
        <div className={styles.artifactGrid}>
          {runs.map((run) => {
            const badge = stateBadge(run.finalState);
            return (
              <Panel key={run.briefId} title={`${run.briefId} — ${run.title}`}>
                <div className={styles.artifactHead}>
                  <Badge tone={badge.tone}>{t(badge.labelKey)}</Badge>
                  <span className="u-muted">{run.note}</span>
                </div>

                {run.artifacts.renderReport ? (
                  <div style={{ margin: "0.75rem 0" }}>
                    <StoryboardStrip report={run.artifacts.renderReport.value} />
                  </div>
                ) : null}

                <div style={{ overflowX: "auto" }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{t("showcase.vionto.manifests.table.stage")}</th>
                        <th>{t("showcase.vionto.manifests.table.configVersion")}</th>
                        <th>{t("showcase.vionto.manifests.table.inputsFingerprint")}</th>
                        <th>{t("showcase.vionto.manifests.table.value")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STAGE_ORDER.map((key) => {
                        const artifact = run.artifacts[key];
                        if (!artifact) return null;
                        return (
                          <tr key={key}>
                            <td>{t(STAGE_KEY[key])}</td>
                            <td className={styles.mono}>{artifact.configVersion}</td>
                            <td className={styles.mono}>{artifact.inputsHash}</td>
                            <td>
                              <pre className={styles.code}>{JSON.stringify(artifact.value, null, 2)}</pre>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
        </div>
      </Section>
    </>
  );
}
