import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { legalDisclaimer, privacySections } from "../../content/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How ASafarIM Digital and the ASafarIM Platform handle personal data, cookies, and contact messages.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        kicker="Legal"
        title="Privacy Policy"
        description="How the studio and the platform handle your data."
      />
      <Alert tone="info">{legalDisclaimer}</Alert>
      <div style={{ display: "grid", gap: "var(--space-4)", maxWidth: "46rem" }}>
        {privacySections.map((section) => (
          <Card key={section.title} title={section.title}>
            {section.body}
          </Card>
        ))}
      </div>
    </>
  );
}
