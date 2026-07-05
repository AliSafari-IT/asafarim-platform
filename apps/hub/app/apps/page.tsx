import type { Metadata } from "next";
import { requireUser, hasRole, ROLES } from "@asafarim/auth";
import { AppCard, PageHeader, getPlatformLinks } from "@asafarim/ui";

export const metadata: Metadata = { title: "Apps" };

export default async function AppsPage() {
  const session = await requireUser({ callbackUrl: "/apps" });
  const links = getPlatformLinks();
  const isAdminUser = hasRole(session, [ROLES.ADMIN]);

  return (
    <>
      <PageHeader
        kicker="Launchpad"
        kickerIndex="01"
        title="Apps"
        description="Every tool on the workbench — more arrive as products are migrated."
      />
      <div className="ui-grid">
        <AppCard
          glyph="WB"
          name="ASafarIM Digital"
          description="The public studio website: services, projects, and contact."
          href={links.web}
          meta="asafarim.com"
        />
        <AppCard
          glyph="SC"
          name="Showcase"
          description="The exhibition wall: demos, case studies, and experiments."
          href={links.showcase}
          meta="showcase.asafarim.be"
        />
        {isAdminUser ? (
          <AppCard
            glyph="AD"
            name="Admin Console"
            description="Users, roles, permissions, and the audit stream."
            href={links.admin}
            meta="admin.asafarim.com · restricted"
          />
        ) : null}
      </div>
    </>
  );
}
