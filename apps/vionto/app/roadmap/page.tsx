import type { Metadata } from "next";
import { Roadmap } from "@asafarim/ui";
import { ViontoNav } from "@/components/ViontoNav";
import { roadmapItems } from "./data";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "An evidence-led view of Vionto's delivered capabilities, current hardening work, and reusable superadmin console plan.",
};

export default function RoadmapPage() {
  return (
    <>
      <ViontoNav />
      <main className="vi-roadmap-page">
        <Roadmap
          kicker="Product & operations"
          title="The Vionto journey"
          description="A code-backed view of what Vionto can do today and what it needs next. The forward plan prioritizes a secure, auditable superadmin area whose authorization and shell can be reused by future ASafarIM apps."
          items={roadmapItems}
          labels={{
            changelogTitle: "Delivered & in progress",
            changelogSubtitle:
              "Capabilities verified against the current application and architecture",
            roadmapTitle: "What's next",
            roadmapSubtitle:
              "Hardening priorities and the Vionto superadmin workstream",
          }}
        />
      </main>
    </>
  );
}
