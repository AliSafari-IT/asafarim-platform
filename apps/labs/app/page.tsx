import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@asafarim/ui";
import { experiments } from "../lib/experiments/registry";

export const metadata: Metadata = { title: "Workbench" };

const STATUS_TONE: Record<string, "success" | "info" | "warning" | "neutral" | "danger"> = {
  prototype: "info",
  active: "success",
  beta: "success",
  paused: "warning",
  archived: "danger",
};

export default function LabsHomePage() {
  const featured = experiments.find((e) => e.featured) ?? experiments[0];
  const counts = experiments.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        kicker="Experimental workbench"
        kickerIndex="01"
        title="Showcase explains what ASafarIM has built. Labs lets you touch what's next."
        description="A high-density workbench of prototypes, interactive canvases, and half-finished ideas — updated as they're built, paused, or promoted."
      />

      <section style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "1.5rem 0" }}>
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status} tone={STATUS_TONE[status] ?? "neutral"}>
            {count} {status}
          </Badge>
        ))}
      </section>

      {featured ? (
        <div style={{ marginBottom: "2rem" }}>
          <Card title={featured.title}>
            <div className="labs-mono" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              FEATURED · v{featured.version}
            </div>
            <p style={{ opacity: 0.85 }}>{featured.description}</p>
            <Link href={`/experiments/${featured.slug}`} className="labs-accent labs-mono">
              Open workbench →
            </Link>
          </Card>
        </div>
      ) : null}

      <section>
        <h3 className="labs-mono">All experiments</h3>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {experiments.map((experiment) => (
            <Card key={experiment.slug} title={experiment.title}>
              <div className="labs-mono" style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                {experiment.category}
              </div>
              <p style={{ fontSize: "0.85rem", opacity: 0.85 }}>{experiment.tagline}</p>
              <Badge tone={STATUS_TONE[experiment.status] ?? "neutral"}>{experiment.status}</Badge>{" "}
              <Link href={`/experiments/${experiment.slug}`}>Open →</Link>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
