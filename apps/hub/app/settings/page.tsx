import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Settings" };

const groups = [
  {
    title: "Security",
    body: "Password change and connected sign-in providers (Google, email codes).",
    note: "arrives with profile migration",
  },
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
  await requireUser({ callbackUrl: "/settings" });

  return (
    <>
      <PageHeader
        kicker="System preferences"
        kickerIndex="01"
        title="Settings"
        description="Account, security, and notification preferences."
      />
      <div className="ui-grid">
        {groups.map((group) => (
          <Card key={group.title} title={group.title}>
            <p>{group.body}</p>
            <span className="u-mono">{group.note}</span>
          </Card>
        ))}
      </div>
    </>
  );
}
