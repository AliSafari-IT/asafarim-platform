import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="USR"
        title="Users"
        description="Accounts, activation, and role assignment."
      />
      <EmptyState
        glyph="[usr]"
        title="User management surface pending"
        description="Listing, editing, deactivation, and role assignment migrate here from the portal admin."
      />
    </>
  );
}
