import type { Metadata } from "next";
import { ButtonLink, Card, Hero, Metric, Panel, Section } from "@asafarim/ui";
import { AiEvalNav } from "./_components/AiEvalNav";
import { FixtureBanner } from "./_components/FixtureBanner";
import {
  dimensions,
  leaderboard,
  methodology,
  scenarioMeta,
} from "./_data/benchmark";
import styles from "./_components/ai-eval.module.css";

export const metadata: Metadata = {
  title: "AI Evaluation Lab",
  description:
    "A provider-neutral, fixture-mode AI benchmark: versioned prompts and synthetic datasets scored for correctness, groundedness, format compliance, latency, cost, and safety — reproducibly, with no API keys.",
};

export default function AiEvalOverviewPage() {
  const top = leaderboard.models[0];
  return (
    <>
      <Hero
        kicker="Exhibit № 04 · AI Evaluation"
        kickerIndex="04"
        title="An AI Evaluation Lab — reproducible, not a chatbot demo."
        lede="Provider-neutral model aliases scored against versioned prompts and synthetic datasets across three neutral scenarios. It runs offline in fixture mode with no API keys, and it produces the same numbers every time."
        actions={
          <>
            <ButtonLink href="/projects/ai-eval/leaderboard">See the leaderboard</ButtonLink>
            <ButtonLink href="/projects/ai-eval/case-study" variant="secondary">
              Read the case study
            </ButtonLink>
          </>
        }
      />

      <AiEvalNav active="/projects/ai-eval" />

      <FixtureBanner />

      <Section kicker="Headline" kickerIndex="01" title="What the reference run shows">
        <div className="ui-grid ui-grid--metrics">
          <Metric label="Top overall" value={`${Math.round(top.overall * 100)}%`} hint={top.label} />
          <Metric label="Models" value={leaderboard.models.length} hint="provider-neutral aliases" />
          <Metric label="Scenarios" value={scenarioMeta.length} hint="neutral tasks" />
          <Metric label="Dimensions" value={dimensions.length} hint="scored per case" />
          <Metric label="Prompt" value={leaderboard.version} hint="version under test" />
          <Metric label="API keys" value="0" hint="fixture mode, offline" />
        </div>
      </Section>

      <Section kicker="Tasks" kickerIndex="02" title="Three neutral scenarios">
        <div className="ui-grid ui-grid--wide">
          {scenarioMeta.map((s, i) => (
            <Card key={s.key} variant="gallery" title={`${String(i + 1).padStart(2, "0")} · ${s.name}`}>
              {s.summary}
            </Card>
          ))}
        </div>
      </Section>

      <Section kicker="Scoring" kickerIndex="03" title="Six dimensions">
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Question</th>
                <th>How it's measured</th>
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

      <Section kicker="Method" kickerIndex="04" title="Methodology & limitations">
        <div className="ui-grid">
          <Panel title="Reproducibility">
            <p>{methodology.determinism}</p>
          </Panel>
          <Panel title="Provenance">
            <p>{methodology.provenance}</p>
          </Panel>
        </div>
        <Panel title="Limitations">
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
