import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Labs" };

export default function LabsPage() {
  return (
    <>
      <PageHeader
        kicker="Experimental shelf"
        kickerIndex="02"
        title="Labs"
        description="Half-built ideas, prototypes, and things that might break."
      />
      <EmptyState
        glyph="( ~ )"
        title="The shelf is empty — for now"
        description="Experiments from labs.asafarim.be will appear here as they are dusted off and rebuilt on the platform."
      />
    </>
  );
}
