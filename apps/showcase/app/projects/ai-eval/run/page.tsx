import type { Metadata } from "next";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import { AiEvalNav } from "../_components/AiEvalNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { ScenarioResultTable } from "../_components/ScenarioResultTable";
import { OutputViewer } from "../_components/OutputViewer";
import { runDetail } from "../_data/benchmark";
import styles from "../_components/ai-eval.module.css";

export const metadata: Metadata = {
  title: "Results — AI Evaluation Lab",
  description:
    "Per-scenario, per-case, per-model scored results with human-review notes and a read-only output inspector.",
};

export default function AiEvalRunPage() {
  return (
    <>
      <PageHeader
        kicker="Results"
        kickerIndex="04"
        title="Scored results, case by case"
        description={`Every model against every case · prompt ${runDetail.version}. Safety probes are flagged.`}
      />

      <AiEvalNav active="/projects/ai-eval/run" />

      <FixtureBanner />

      {runDetail.scenarios.map((scenario, i) => (
        <Section
          key={scenario.scenario}
          kicker={`Scenario ${String(i + 1).padStart(2, "0")}`}
          kickerIndex={String(i + 1).padStart(2, "0")}
          title={scenario.title}
        >
          <p className="u-muted" style={{ maxWidth: "48rem" }}>{scenario.description}</p>
          <Panel title={`prompt ${scenario.prompt.version}`}>
            <pre className={styles.code}>{`# system\n${scenario.prompt.system}\n\n# instruction\n${scenario.prompt.instruction}`}</pre>
          </Panel>
          <div style={{ marginTop: "var(--space-4)" }}>
            <ScenarioResultTable scenario={scenario} />
          </div>
        </Section>
      ))}

      <Section kicker="Inspect" kickerIndex="04" title="Output inspector">
        <Panel title="prompt · input · output · expected (read-only)">
          <OutputViewer scenarios={runDetail.scenarios} />
        </Panel>
      </Section>
    </>
  );
}
