import type { Metadata } from "next";
import { requireUser, hasRole, ROLES } from "@asafarim/auth";
import {
  AppCard,
  Badge,
  Card,
  Metric,
  PageHeader,
  Section,
  getPlatformLinks,
} from "@asafarim/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireUser({ callbackUrl: "/dashboard" });
  const links = getPlatformLinks();
  const isAdminUser = hasRole(session, [ROLES.ADMIN]);

  return (
    <>
      <PageHeader
        kicker="Command center"
        kickerIndex="01"
        title="Dashboard"
        description="Status of your account and quick access to the platform."
      />

      <div className="ui-grid ui-grid--metrics">
        <Metric
          label="Session"
          value="Active"
          hint={session.user.email ?? undefined}
        />
        <Metric
          label="Roles"
          value={session.user.roles.length}
          hint={session.user.roles.join(", ") || "no roles assigned"}
        />
        <Metric
          label="Access level"
          value={isAdminUser ? "Admin" : "Standard"}
          hint={isAdminUser ? "elevated controls available" : "standard access"}
        />
      </div>

      <Section kicker="Identity" kickerIndex="02">
        <Card variant="elevated" title={session.user.name ?? "Your identity"}>
          <p>
            {session.user.email} · @{session.user.username ?? "—"}
          </p>
          <p>
            {session.user.roles.map((role) => (
              <span key={role} style={{ marginRight: "0.35rem" }}>
                <Badge tone={role === "superadmin" || role === "admin" ? "info" : "neutral"}>
                  {role}
                </Badge>
              </span>
            ))}
          </p>
          <a href="/profile">Manage profile →</a>
        </Card>
      </Section>

      <Section kicker="Launchpad" kickerIndex="03" title="Jump back in">
        <div className="ui-grid">
          <AppCard
            glyph="WB"
            name="ASafarIM Digital"
            description="The public studio website."
            href={links.web}
            meta="public"
          />
          <AppCard
            glyph="SC"
            name="Showcase"
            description="The gallery of projects and experiments."
            href={links.showcase}
            meta="public"
          />
          {isAdminUser ? (
            <AppCard
              glyph="AD"
              name="Admin Console"
              description="System operations and access control."
              href={links.admin}
              meta="restricted"
            />
          ) : null}
        </div>
      </Section>
    </>
  );
}
