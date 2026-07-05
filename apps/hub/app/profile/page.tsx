import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { Badge, Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireUser({ callbackUrl: "/profile" });

  return (
    <>
      <PageHeader
        kicker="Identity card"
        kickerIndex="01"
        title="Profile"
        description="Who you are across the whole platform."
      />
      <div className="ui-grid">
        <Card variant="elevated" title={session.user.name ?? "Unnamed"}>
          <p className="u-mono">@{session.user.username ?? "—"}</p>
          <p>{session.user.email}</p>
          <p>
            {session.user.roles.map((role) => (
              <span key={role} style={{ marginRight: "0.35rem" }}>
                <Badge tone={role === "superadmin" || role === "admin" ? "info" : "neutral"}>
                  {role}
                </Badge>
              </span>
            ))}
          </p>
        </Card>
        <Card title="Editing">
          Name, bio, avatar, and links become editable when the profile
          features are migrated from the portal.
        </Card>
      </div>
    </>
  );
}
