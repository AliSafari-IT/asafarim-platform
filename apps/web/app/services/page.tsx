import type { Metadata } from "next";
import { Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Services" };

const services = [
  {
    title: "Web platforms",
    body: "Full-stack web applications with Next.js, TypeScript, and PostgreSQL.",
  },
  {
    title: "APIs & integrations",
    body: "Backend services, data models, and third-party integrations.",
  },
  {
    title: "Deployment & operations",
    body: "Dockerized deployments, reverse proxies, and VPS operations.",
  },
];

export default function ServicesPage() {
  return (
    <>
      <PageHeader title="Services" description="What ASafarIM Digital offers" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          gap: "1rem",
        }}
      >
        {services.map((service) => (
          <Card key={service.title} title={service.title}>
            {service.body}
          </Card>
        ))}
      </div>
    </>
  );
}
