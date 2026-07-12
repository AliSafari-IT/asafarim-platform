import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { Badge, Card, PageHeader } from "@asafarim/ui";
import { PasswordChangeForm } from "./_components/PasswordChangeForm";

export const metadata: Metadata = { title: "Settings" };

const plannedGroups = [
  {
    title: "Notifications",
    body: "Email preferences for platform and product updates.",
    note: "planned",
  },
  {
    title: "Sessions",
    body: "Active sessions across devices, with remote sign-out.",
    note: "planned",
  },
];

export default async function SettingsPage() {
  const session = await requireUser({ callbackUrl: "/settings" });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true, accounts: { select: { provider: true } } },
  });

  const hasPassword = Boolean(user?.password);
  const providers = user?.accounts.map((a) => a.provider) ?? [];

  return (
    <>
      <PageHeader
        kicker="System preferences"
        kickerIndex="01"
        title="Settings"
        description="Account, security, and notification preferences."
      />
      <div className="ui-grid">
        <Card title="Password">
          <PasswordChangeForm hasPassword={hasPassword} />
        </Card>

        <Card title="Connected accounts">
          {providers.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {providers.map((provider) => (
                <li key={provider} style={{ marginBottom: "0.4rem", textTransform: "capitalize" }}>
                  {provider} <Badge tone="success">Connected</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="u-muted">No third-party sign-in providers connected.</p>
          )}
        </Card>

        {plannedGroups.map((group) => (
          <Card key={group.title} title={group.title}>
            <p>{group.body}</p>
            <span className="u-mono">{group.note}</span>
          </Card>
        ))}
      </div>
    </>
  );
}
