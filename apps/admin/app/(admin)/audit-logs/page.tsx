import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Audit Logs" };

export default function AuditLogsPage() {
  return (
    <>
      <PageHeader title="Audit Logs" description="Administrative and security events" />
      <EmptyState
        title="Audit log viewer coming soon"
        description="The AuditLog model is in place; the viewer arrives with the admin feature migration."
      />
    </>
  );
}
