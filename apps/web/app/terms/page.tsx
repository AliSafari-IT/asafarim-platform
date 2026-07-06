import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { legalDisclaimer, termsSections } from "../../content/legal";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms of use for the ASafarIM Digital website and ASafarIM Platform accounts.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <PageHeader
        kicker="Legal"
        title="Terms of Service"
        description="The ground rules for using the website and platform accounts."
      />
      <Alert tone="info">{legalDisclaimer}</Alert>
      <div style={{ display: "grid", gap: "var(--space-4)", maxWidth: "46rem" }}>
        {termsSections.map((section) => (
          <Card key={section.title} title={section.title}>
            {section.body}
          </Card>
        ))}
      </div>
    </>
  );
}
