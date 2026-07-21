import type { Metadata } from "next";
import { ButtonLink, EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Apps" };

export default function AppsPage() {
  // The application registry/metadata store ships in M02; until then this
  // route is a defined, empty shell rather than a placeholder 404.
  return (
    <>
      <PageHeader
        kicker="Catalog"
        kickerIndex="01"
        title="Your apps"
        description="Every application you've generated, with its current specification version and status."
      />
      <EmptyState
        glyph="[ + ]"
        title="No applications yet"
        description="Start one from a plain-language description. Persistence and the app registry ship in M02."
        action={<ButtonLink href="/apps/new">Start a new app</ButtonLink>}
      />
    </>
  );
}
