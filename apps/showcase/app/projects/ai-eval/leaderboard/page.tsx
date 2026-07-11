import type { Metadata } from "next";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import { AiEvalNav } from "../_components/AiEvalNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { Leaderboard } from "../_components/Leaderboard";
import { leaderboard } from "../_data/benchmark";

export const metadata: Metadata = {
  title: "Leaderboard — AI Evaluation Lab",
  description:
    "Provider-neutral model aliases ranked by overall score across correctness, groundedness, format compliance, and safety, with latency and estimated cost.",
};

export default function AiEvalLeaderboardPage() {
  return (
    <>
      <PageHeader
        kicker="Leaderboard"
        kickerIndex="04"
        title="Model leaderboard"
        description={`Ranked over checked-in fixture results · prompt ${leaderboard.version} · ${leaderboard.models[0].cases} cases per model.`}
      />

      <AiEvalNav active="/projects/ai-eval/leaderboard" />

      <FixtureBanner />

      <Section kicker="Ranking" kickerIndex="01" title="Overall, then by dimension">
        <Panel title="fixture leaderboard">
          <Leaderboard rows={leaderboard.models} />
        </Panel>
        <p className="u-muted" style={{ marginTop: "var(--space-4)", maxWidth: "44rem" }}>
          Aliases are capability-tier stand-ins, not specific vendors. The point
          is the evaluation method — where each tier gains and loses points — not
          a vendor ranking. Latency and cost are representative fixtures.
        </p>
      </Section>
    </>
  );
}
