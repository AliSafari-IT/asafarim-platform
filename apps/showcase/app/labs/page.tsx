import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Labs" };

export default function LabsPage() {
  return (
    <>
      <PageHeader
        title="Labs"
        description="Experimental apps and works in progress"
      />
      <EmptyState
        title="Nothing brewing yet"
        description="Future experiments (labs.asafarim.be) will appear here."
      />
    </>
  );
}
