import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser({ callbackUrl: "/settings" });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Account, security, and notification preferences"
      />
      <EmptyState
        title="Settings coming soon"
        description="Password change, email preferences, and connected accounts will live here."
      />
    </>
  );
}
