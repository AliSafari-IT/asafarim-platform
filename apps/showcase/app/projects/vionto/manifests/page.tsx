import type { Metadata } from "next";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
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
const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  script: "Script",
  storyboard: "Storyboard",
  assetPlan: "Asset plan",
  renderReport: "Render report",
};

export default function ViontoManifestsPage() {
  return (
    <>
      <PageHeader
        kicker="Manifests"
        kickerIndex="05"
        title="Versioned artifact inspector"
        description="Every artifact a run produces records its configuration version and an inputs fingerprint — the acceptance criterion that every generated artifact records its inputs and configuration version, made concrete."
      />

      <ViontoNav active="/projects/vionto/manifests" />

      <FixtureBanner />

      <Section kicker="Runs" kickerIndex="01" title="Every reference run">
        <div className={styles.artifactGrid}>
          {runs.map((run) => {
            const badge = stateBadge(run.finalState);
            return (
              <Panel key={run.briefId} title={`${run.briefId} — ${run.title}`}>
                <div className={styles.artifactHead}>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
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
                        <th>Stage</th>
                        <th>Config version</th>
                        <th>Inputs fingerprint</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STAGE_ORDER.map((key) => {
                        const artifact = run.artifacts[key];
                        if (!artifact) return null;
                        return (
                          <tr key={key}>
                            <td>{STAGE_LABEL[key]}</td>
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
