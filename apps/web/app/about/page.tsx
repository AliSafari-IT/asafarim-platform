import type { Metadata } from "next";
import { Card, PageHeader, Section } from "@asafarim/ui";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader
        kicker="The studio"
        kickerIndex="01"
        title="About ASafarIM Digital"
        description="A personal technology brand, run like a workshop."
      />
      <Section>
        <div className="ui-grid">
          <Card variant="studio" title="One craftsman, full stack">
            ASafarIM Digital is the umbrella for the products, platforms, and
            consultancy work of Ali Safari — from database schema to deployment
            pipeline.
          </Card>
          <Card variant="studio" title="Built in the open">
            The platform you are reading this on is itself a project: a public
            monorepo where every part of the stack is on display.
          </Card>
          <Card variant="studio" title="Useful over flashy">
            The studio favors software that removes real friction. Full story
            and background will be migrated from the existing sites.
          </Card>
        </div>
      </Section>
    </>
  );
}
