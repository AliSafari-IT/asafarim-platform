import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader, Section } from "@asafarim/ui";
import { engagement, services } from "../../content/services";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Freelance services from ASafarIM Digital: full-stack web applications, APIs and platform architecture, dashboards, deployment, test automation, and AI-assisted tools.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        kicker="Studio services"
        kickerIndex="02"
        title="Services"
        description="The studio helps businesses and startups build robust, practical web software — taken end to end, not staff augmentation."
      />

      <div className="ui-grid">
        {services.map((service) => (
          <Card key={service.title} variant="studio" title={service.title}>
            <p>{service.body}</p>
            <span className="u-mono">{service.note}</span>
          </Card>
        ))}
      </div>

      <Section kicker="Working together" kickerIndex="03" title={engagement.heading}>
        <div className="ui-grid">
          {engagement.points.map((point) => (
            <Card key={point.title} title={point.title}>
              {point.body}
            </Card>
          ))}
        </div>
        <p style={{ marginTop: "var(--space-5)" }}>
          <ButtonLink href="/contact">Discuss a project</ButtonLink>
        </p>
      </Section>
    </>
  );
}
