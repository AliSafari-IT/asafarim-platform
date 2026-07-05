import { auth } from "@asafarim/auth";
import { ButtonLink, Kicker, Panel, getPlatformLinks } from "@asafarim/ui";

export default async function DeniedPage() {
  const session = await auth();
  const links = getPlatformLinks();

  return (
    <div style={{ maxWidth: "30rem", margin: "4rem auto", padding: "0 1rem" }}>
      <Kicker index="403">Access control</Kicker>
      <h1 style={{ marginBottom: "var(--space-5)" }}>Access denied</h1>
      <Panel title="authorization required">
        <p>
          {session?.user
            ? `Account ${session.user.email} does not hold the admin role.`
            : "No active session."}
        </p>
        <p className="u-muted">
          System access is limited to authorized roles. Contact a platform
          administrator if you believe this is a mistake.
        </p>
        <ButtonLink href={links.hub} variant="console" size="sm">
          return to hub
        </ButtonLink>
      </Panel>
    </div>
  );
}
