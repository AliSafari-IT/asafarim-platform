import type { Metadata } from "next";
import { Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader kicker="Legal" title="Privacy Policy" />
      <Card>
        Placeholder for the ASafarIM Digital privacy policy. The final text will
        be added when the public website content is migrated.
      </Card>
    </>
  );
}
