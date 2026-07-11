import type { Metadata } from "next";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import { AiEvalNav } from "../_components/AiEvalNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { RegressionDiff } from "../_components/RegressionDiff";
import { regression } from "../_data/benchmark";
import styles from "../_components/ai-eval.module.css";

export const metadata: Metadata = {
  title: "Regression — AI Evaluation Lab",
  description:
    "A documented failed regression: a stricter prompt revision breaks format compliance for the compact model on tool selection.",
};

export default function AiEvalRegressionPage() {
  const regressed = regression.rows.filter((r) => r.regressed);
  return (
    <>
      <PageHeader
        kicker="Regression"
        kickerIndex="04"
        title="A prompt change that made things worse"
        description={`${regression.label} · ${regression.scenario} · prompt ${regression.promptFrom} → ${regression.promptTo}`}
      />

      <AiEvalNav active="/projects/ai-eval/regression" />

      <FixtureBanner />

      <Section kicker="What happened" kickerIndex="01" title="The stricter prompt backfired">
        <p style={{ maxWidth: "48rem" }}>
          Revising the tool-selection prompt from <code>v1</code> to a stricter{" "}
          <code>v2</code> (&ldquo;arguments only, no prose&rdquo;) helped the
          larger models but pushed <strong>{regression.label}</strong> to emit an
          enum-invalid argument on <code>{regressed[0]?.caseId}</code> — dropping
          that case from passing to failing on format compliance. This is exactly
          the kind of change a prompt-level regression test must catch.
        </p>
        <div className="ui-grid">
          <Panel title="prompt v1">
            <pre className={styles.code}>{`# system\n${regression.promptDiff.v1.system}\n\n# instruction\n${regression.promptDiff.v1.instruction}`}</pre>
          </Panel>
          <Panel title="prompt v2 (regressed)">
            <pre className={styles.code}>{`# system\n${regression.promptDiff.v2.system}\n\n# instruction\n${regression.promptDiff.v2.instruction}`}</pre>
          </Panel>
        </div>
      </Section>

      <Section kicker="Case by case" kickerIndex="02" title="v1 → v2 outputs">
        <RegressionDiff regression={regression} />
      </Section>
    </>
  );
}
