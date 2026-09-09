import type { Metadata } from "next";
import { Roadmap } from "@asafarim/ui";
import { roadmapItems } from "./data";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "What runs in Testora today, and the autonomous quality loop with TasksAI that comes next.",
};

export default function RoadmapPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <Roadmap
        kicker="Project direction"
        title="The Testora journey"
        description="What already runs in the app, and where it is heading — an autonomous quality loop with TasksAI where a regression diagnoses itself into a task and a planned feature cannot ship until its tests pass reliably."
        items={roadmapItems}
        labels={{
          changelogTitle: "In the app today",
          changelogSubtitle: "Authoring, execution, triage",
          roadmapTitle: "What's next",
          roadmapSubtitle: "The autonomous quality loop (#269)",
        }}
      />
    </main>
  );
}
