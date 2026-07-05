import type { Metadata } from "next";
import { Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Terms of Service" />
      <Card>
        Placeholder for the ASafarIM Digital terms of service. The final text
        will be added when the public website content is migrated.
      </Card>
    </>
  );
}
