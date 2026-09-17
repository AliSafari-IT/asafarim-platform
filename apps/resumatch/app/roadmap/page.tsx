import type { Metadata } from "next";
import { Roadmap } from "@asafarim/ui";
import { roadmapItems } from "./data";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return (
    <main className="jm-roadmap-page">
      <Roadmap
        kicker="Project direction"
        title="The JobMatch journey"
        description="An outcome-led view of what has shipped, what is mid-stream, and where the assistant is heading. JobMatch is an experimental portfolio showcase — every milestone is complete only when its exit evidence is demonstrated, not when its code merges."
        items={roadmapItems}
        labels={{
          changelogTitle: "Delivered & in progress",
          changelogSubtitle: "M0–M7 · docs/business-plan.md",
          roadmapTitle: "What's next",
          roadmapSubtitle: "Later milestones + the M5 matching queue (#256)",
        }}
      />
    </main>
  );
}
