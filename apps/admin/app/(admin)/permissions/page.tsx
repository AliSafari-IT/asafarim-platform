import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Permissions" };

export default function PermissionsPage() {
  return (
    <>
      <PageHeader title="Permissions" description="Permission catalog per group" />
      <EmptyState
        title="Permission catalog coming soon"
        description="19 foundation permissions are seeded across users, roles, content, settings, audit, and profile groups."
      />
    </>
  );
}
