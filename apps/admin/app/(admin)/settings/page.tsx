import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Platform-wide configuration" />
      <EmptyState
        title="Platform settings coming soon"
        description="Site settings (SiteSetting model) will be migrated with the CMS features."
      />
    </>
  );
}
