import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Roles" };

export default function RolesPage() {
  return (
    <>
      <PageHeader title="Roles" description="Define and assign roles" />
      <EmptyState
        title="Role management coming soon"
        description="System roles (superadmin, admin, standard_user, guest) are seeded; management UI arrives in a later PR."
      />
    </>
  );
}
