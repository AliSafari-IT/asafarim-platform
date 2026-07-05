import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <>
      <PageHeader title="Users" description="Manage user accounts" />
      <EmptyState
        title="User management coming soon"
        description="Listing, editing, deactivating, and role assignment will be migrated from the portal admin."
      />
    </>
  );
}
