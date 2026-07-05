import type { Metadata } from "next";
import { Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Contact" description="Get in touch with ASafarIM Digital" />
      <Card title="Contact us">
        A contact form (stored via the platform database) arrives in a later
        phase. Until then, reach out via email or the channels on the existing
        website.
      </Card>
    </>
  );
}
