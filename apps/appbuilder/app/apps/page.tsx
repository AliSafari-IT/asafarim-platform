import type { Metadata } from "next";
import { ButtonLink, EmptyState, PageHeader } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Apps" };

export default async function AppsPage() {
  // Session enforcement — proxy.ts already blocks unauthenticated/deactivated
  // requests at the edge; this is defense-in-depth for direct server-side
  // rendering, matching Hub/Admin's page-level convention. The catalog UI
  // (listing the actor's own apps) ships in M05; this route stays a defined
  // empty shell until then.
  await requireActor({ callbackUrl: "/apps" });

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
