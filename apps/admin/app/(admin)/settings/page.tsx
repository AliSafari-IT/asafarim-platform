import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader
        kicker="Configuration"
        kickerIndex="CFG"
        title="Settings"
        description="Platform-wide configuration switches."
      />
      <EmptyState
        glyph="[cfg]"
        title="Control panel pending"
        description="Site settings (SiteSetting model) migrate here with the CMS features."
      />
    </>
  );
}
