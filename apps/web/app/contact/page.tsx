import type { Metadata } from "next";
import { Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <PageHeader
        kicker="Open door"
        kickerIndex="04"
        title="Contact"
        description="Have something practical in mind? The studio answers."
      />
      <div className="ui-grid">
        <Card variant="studio" title="Project inquiries">
          <p>
            A contact form (stored via the platform database) arrives in a later
            phase. Until then, reach out through the channels on the existing
            website.
          </p>
          <span className="u-mono">response within a few days</span>
        </Card>
        <Card variant="studio" title="Collaboration">
          <p>
            Open-source ideas, showcase submissions, or platform questions are
            equally welcome.
          </p>
          <span className="u-mono">github.com/AliSafari-IT</span>
        </Card>
      </div>
    </>
  );
}
