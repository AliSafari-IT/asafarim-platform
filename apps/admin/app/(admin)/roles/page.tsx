import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Roles" };

export default function RolesPage() {
  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="ROL"
        title="Roles"
        description="Role definitions and their permission grants."
      />
      <EmptyState
        glyph="[rol]"
        title="Role management surface pending"
        description="System roles (superadmin, admin, standard_user, guest) are seeded; the management UI arrives with the admin migration."
      />
    </>
  );
}
