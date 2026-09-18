import type { Metadata } from "next";
import { Roadmap } from "@asafarim/ui";
import { roadmapItems } from "./data";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return (
    <main className="jm-roadmap-page">
      <Roadmap
        kicker="Project direction"
        title="The ResuMatch journey"
        description="An outcome-led view of what has shipped, what is mid-stream, and where the AI-tailoring tool is heading. ResuMatch is an experimental portfolio showcase — every milestone is complete only when its exit evidence is demonstrated, not when its code merges."
        items={roadmapItems}
        labels={{
          changelogTitle: "Delivered & in progress",
          changelogSubtitle: "M1–M5 · docs/business-plan.md",
          roadmapTitle: "What's next",
          roadmapSubtitle: "More layouts, real model providers, production readiness",
        }}
      />
    </main>
  );
}
