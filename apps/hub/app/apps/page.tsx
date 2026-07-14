import type { Metadata } from "next";
import {
  PLATFORM_APPS,
  canAccessApp,
  requireUser,
  type AppAccessContext,
} from "@asafarim/auth";
import { AppCard, PageHeader, getPlatformLinks } from "@asafarim/ui";

export const metadata: Metadata = { title: "Apps" };

export default async function AppsPage() {
  const session = await requireUser({ callbackUrl: "/apps" });
  const links = getPlatformLinks();

  const context: AppAccessContext = {
    roles: session.user.roles,
    authenticated: true,
  };

  // Registry-driven launcher: accessible apps become live tiles, deferred
  // apps show as coming-soon, and everything else stays hidden. Hub itself
  // is skipped — you are already standing in it.
  const tiles = PLATFORM_APPS.filter(
    (app) =>
      app.key !== "hub" &&
      (canAccessApp(app, context) || app.status === "coming-soon")
  );

  return (
    <>
      <PageHeader
        kicker="Launchpad"
        kickerIndex="01"
        title="Apps"
        description="Every tool on the workbench — more arrive as products are migrated."
      />
      <div className="ui-grid">
        {tiles.map((app) => (
          <AppCard
            key={app.key}
            glyph={app.glyph}
            name={app.name}
            description={app.description}
            meta={app.meta}
            href={
              app.key in links
                ? links[app.key as keyof typeof links]
                : undefined
            }
            disabled={app.status === "coming-soon"}
          />
        ))}
      </div>
    </>
  );
}
