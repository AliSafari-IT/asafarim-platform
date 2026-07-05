import type { Metadata } from "next";
import { EmptyState, PageHeader, getPlatformLinks } from "@asafarim/ui";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  const links = getPlatformLinks();

  return (
    <>
      <PageHeader
        title="Projects"
        description="Client work and products from the ASafarIM ecosystem"
      />
      <EmptyState
        title="Portfolio coming soon"
        description="Project content will be migrated from the existing websites. Live demos are available in the Showcase."
        action={
          <a href={links.showcase} style={{ color: "#38bdf8" }}>
            Visit the Showcase →
          </a>
        }
      />
    </>
  );
}
