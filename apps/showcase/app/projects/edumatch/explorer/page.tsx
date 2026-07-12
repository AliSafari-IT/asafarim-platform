import type { Metadata } from "next";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import { EdumatchNav } from "../_components/EdumatchNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { MatchExplorer } from "../_components/MatchExplorer";

export const metadata: Metadata = {
  title: "Match explorer — EduMatch",
  description:
    "Inspect and adjust the EduMatch matching factors live: pick a student need, see the ranked tutors with a full factor breakdown, and move the weights yourself.",
};

export default function EdumatchExplorerPage() {
  return (
    <>
      <PageHeader
        kicker="Explorer"
        kickerIndex="04"
        title="Match explorer"
        description="Runs the real matching engine in your browser against synthetic fixtures. Pick a need, inspect why each tutor ranks where they do, and move the weights to see the ranking change live."
      />

      <EdumatchNav active="/projects/edumatch/explorer" />

      <FixtureBanner />

      <Section kicker="Live" kickerIndex="01" title="Rank, inspect, adjust">
        <Panel title="match explorer">
          <MatchExplorer />
        </Panel>
      </Section>
    </>
  );
}
