import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@asafarim/ui";
import { experiments, type ExperimentCategory, type ExperimentStatus } from "../../lib/experiments/registry";

export const metadata: Metadata = { title: "Experiments" };

const CATEGORIES: ExperimentCategory[] = ["AI", "UI", "Audio", "Data", "DevTools"];
const STATUSES: ExperimentStatus[] = ["prototype", "active", "beta", "paused", "archived"];

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const { category, status } = await searchParams;
  const filtered = experiments.filter(
    (e) => (!category || e.category === category) && (!status || e.status === status)
  );

  return (
    <>
      <PageHeader
        kicker="Catalogue"
        kickerIndex="02"
        title="Experiments"
        description="Filter by category and status. Every card links to its own interactive workspace."
      />

      <div className="labs-mono" style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
        <div>
          <span style={{ opacity: 0.6 }}>Category: </span>
          <Link href="/experiments" style={{ fontWeight: category ? 400 : 700 }}>
            all
          </Link>{" "}
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/experiments?category=${c}${status ? `&status=${status}` : ""}`}
              style={{ fontWeight: category === c ? 700 : 400, marginRight: "0.5rem" }}
            >
              {c}
            </Link>
          ))}
        </div>
        <div>
          <span style={{ opacity: 0.6 }}>Status: </span>
          <Link href={category ? `/experiments?category=${category}` : "/experiments"} style={{ fontWeight: status ? 400 : 700 }}>
            all
          </Link>{" "}
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/experiments?status=${s}${category ? `&category=${category}` : ""}`}
              style={{ fontWeight: status === s ? 700 : 400, marginRight: "0.5rem" }}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {filtered.map((experiment) => (
          <Card key={experiment.slug} title={experiment.title}>
            <div className="labs-mono" style={{ fontSize: "0.7rem", opacity: 0.6 }}>
              {experiment.category}
            </div>
            <p style={{ fontSize: "0.85rem", opacity: 0.85 }}>{experiment.tagline}</p>
            <Badge>{experiment.status}</Badge> <Link href={`/experiments/${experiment.slug}`}>Open →</Link>
          </Card>
        ))}
        {filtered.length === 0 ? <p>No experiments match these filters.</p> : null}
      </div>
    </>
  );
}
