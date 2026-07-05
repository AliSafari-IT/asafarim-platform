import type { Metadata } from "next";
import { Card, PageHeader, Section, ButtonLink } from "@asafarim/ui";

export const metadata: Metadata = { title: "Services" };

const services = [
  {
    title: "Web platforms",
    body: "Full-stack web applications with Next.js, TypeScript, and PostgreSQL — designed, built, and shipped.",
    note: "design → build → deploy",
  },
  {
    title: "APIs & integrations",
    body: "Backend services, data models, authentication, and third-party integrations that hold up in production.",
    note: "REST · auth · data",
  },
  {
    title: "Deployment & operations",
    body: "Dockerized deployments, reverse proxies, monitoring, and calm VPS operations.",
    note: "docker · caddy · vps",
  },
];

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        kicker="Studio services"
        kickerIndex="02"
        title="Services"
        description="Selected client work, taken end to end — not staff augmentation."
      />
      <div className="ui-grid">
        {services.map((service) => (
          <Card key={service.title} variant="studio" title={service.title}>
            <p>{service.body}</p>
            <span className="u-mono">{service.note}</span>
          </Card>
        ))}
      </div>
      <Section>
        <ButtonLink href="/contact">Discuss a project</ButtonLink>
      </Section>
    </>
  );
}
