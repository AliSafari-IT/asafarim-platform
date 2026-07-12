import type { Metadata } from "next";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import { EdumatchNav } from "../_components/EdumatchNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { JourneySim } from "../_components/JourneySim";

export const metadata: Metadata = {
  title: "Journey — EduMatch",
  description:
    "The inquiry -> proposal -> booking journey across student, tutor, and moderator perspectives, in a safe demo mode with no external side effects.",
};

export default function EdumatchJourneyPage() {
  return (
    <>
      <PageHeader
        kicker="Journey"
        kickerIndex="04"
        title="Inquiry → proposal → booking"
        description="The same journey, viewed from three roles. This is where matching output meets trust, permissions, and business workflow — the part a bare ranking algorithm never has to solve."
      />

      <EdumatchNav active="/projects/edumatch/journey" />

      <FixtureBanner />

      <Section kicker="Multi-role" kickerIndex="01" title="Walk the journey">
        <Panel title="safe demo mode — no network calls, nothing stored">
          <JourneySim />
        </Panel>
      </Section>

      <Section kicker="Why it matters" kickerIndex="02" title="Trust, not just ranking">
        <div className="ui-grid">
          <Panel title="Student">
            <p>Trusts that a recommended tutor is genuinely qualified and available — not just highly rated.</p>
          </Panel>
          <Panel title="Tutor">
            <p>Trusts that proposals reach students whose needs they can actually meet, and that ratings reflect real match quality.</p>
          </Panel>
          <Panel title="Moderator">
            <p>Needs visibility into every booking and a way to intervene — the flag action here stands in for a real trust &amp; safety workflow.</p>
          </Panel>
        </div>
      </Section>
    </>
  );
}
