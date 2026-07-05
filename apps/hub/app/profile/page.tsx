import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireUser({ callbackUrl: "/profile" });

  return (
    <>
      <PageHeader title="Profile" description="Your public profile information" />
      <Card title={session.user.name ?? session.user.email ?? "Profile"}>
        <p>Email: {session.user.email}</p>
        <p>Username: {session.user.username ?? "—"}</p>
        <p>
          Profile editing (name, bio, avatar, links) will be added when the
          profile features are migrated from the portal.
        </p>
      </Card>
    </>
  );
}
