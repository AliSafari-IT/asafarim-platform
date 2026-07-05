import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Permissions" };

export default function PermissionsPage() {
  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="PRM"
        title="Permissions"
        description="The permission catalog, grouped by domain."
      />
      <EmptyState
        glyph="[prm]"
        title="Permission catalog surface pending"
        description="19 foundation permissions are seeded across users, roles, content, settings, audit, and profile groups."
      />
    </>
  );
}
