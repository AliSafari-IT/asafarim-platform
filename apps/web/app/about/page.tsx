import type { Metadata } from "next";
import { Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About"
        description="Who is behind ASafarIM Digital"
      />
      <Card>
        ASafarIM Digital is the umbrella brand for the software products,
        platforms, and consultancy work of Ali Safari. Content will be migrated
        from the existing websites in a later phase.
      </Card>
    </>
  );
}
