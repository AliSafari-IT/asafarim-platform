import type { Metadata } from "next";
import { EmptyState, PageHeader, getPlatformLinks } from "@asafarim/ui";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  const links = getPlatformLinks();

  return (
    <>
      <PageHeader
        kicker="The wall"
        kickerIndex="03"
        title="Projects"
        description="A curated wall of client work and studio products."
      />
      <EmptyState
        glyph="[ wall ]"
        title="The wall is being curated"
        description="Portfolio pieces from the existing sites are being selected and rewritten. Live demos are already on display in the Showcase."
        action={
          <a href={links.showcase}>Visit the Showcase →</a>
        }
      />
    </>
  );
}
