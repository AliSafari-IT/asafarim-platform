import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { PageHeader } from "@asafarim/ui";
import { ProfileEditor } from "./_components/ProfileEditor";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireUser({ callbackUrl: "/profile" });

  const [user, locations] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        image: true,
        bio: true,
        jobTitle: true,
        company: true,
        website: true,
        phone: true,
        preferredLocale: true,
        timezone: true,
      },
    }),
    prisma.userLocation.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  if (!user) {
    // requireUser already guarantees an active session/user row; this is
    // only reachable if the account was deleted in the same instant.
    return null;
  }

  return (
    <>
      <PageHeader
        kicker="Identity card"
        kickerIndex="01"
        title="Profile"
        description="Who you are across the whole platform."
      />
      <ProfileEditor
        user={user}
        roles={session.user.roles}
        initialLocations={locations}
      />
    </>
  );
}
