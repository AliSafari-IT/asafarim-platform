import type { Metadata } from "next";
import { Roadmap } from "@asafarim/ui";
import { roadmapItems } from "./data";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "What runs in Testora today — including the completed autonomous quality loop with TasksAI — and the AI-native quality assistant that comes next.",
};

export default function RoadmapPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <Roadmap
        kicker="Project direction"
        title="The Testora journey"
        description="What already runs in the app — authoring, execution, triage, and the now-complete autonomous quality loop with TasksAI — and where it's heading next: AI that helps find and explain a failure, not just write it up after the fact."
        items={roadmapItems}
        labels={{
          changelogTitle: "In the app today",
          changelogSubtitle: "Authoring, execution, triage, and the completed TasksAI quality loop (#269)",
          roadmapTitle: "What's next",
          roadmapSubtitle: "The AI-native quality assistant epic (#629)",
        }}
      />
    </main>
  );
}
