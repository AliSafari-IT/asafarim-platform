import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Metric, PageHeader, Panel, Section, Timeline } from "@asafarim/ui";
import {
  ARCHITECTURE_NODES,
  CI_METRICS,
  DEPLOYMENT_TOPOLOGY,
  SECURITY_BOUNDARIES,
  getChangelog,
  getPackageCards,
} from "./data";
import styles from "./proof.module.css";

export const metadata: Metadata = {
  title: "Engineering Proof",
  description:
    "How the ASafarIM platform is actually built: architecture, security boundaries, deployment topology, shipped versions, and quality status — with sources, not just claims.",
};

const freshnessLabel = {
  live: "Live",
  "last-known": "Last known",
  "not-yet-measured": "Not yet measured",
} as const;

/**
 * Public proof board (issue #13). Every number on this page traces to an
 * allow-listed field in ./data.ts — nothing here reads a private host, a
 * database value, or a live admin endpoint. Degraded/unmeasured data says so
 * plainly instead of being hidden or faked.
 */
export default async function ProofPage() {
  const packages = getPackageCards();
  const changelog = getChangelog();

  return (
    <>
      <PageHeader
        kicker="Engineering proof"
        kickerIndex="05"
        title="What actually backs this platform"
        description="Architecture, security boundaries, deployment shape, shipped versions, and quality status — each with a source and a timestamp, not just an assertion. Operational details (hosts, credentials, internal logs) are deliberately excluded."
        actions={<Link href="/">← Back to showcase</Link>}
      />

      <Section kicker="Architecture" kickerIndex="01" title="How the pieces connect">
        <div className="ui-grid">
          {ARCHITECTURE_NODES.map((node) => (
            <Panel key={node.id} title={node.name}>
              <Badge tone={node.tier === "data" ? "warning" : node.tier === "shared" ? "info" : "neutral"}>
                {node.tier}
              </Badge>
              <p className={styles.blurb}>{node.blurb}</p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section kicker="Security" kickerIndex="02" title="SSO and RBAC boundaries">
        <div className="ui-grid">
          {SECURITY_BOUNDARIES.map((item) => (
            <Panel key={item.title} title={item.title}>
              <p className={styles.blurb}>{item.body}</p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section kicker="Deployment" kickerIndex="03" title="Delivery topology">
        <Panel title="Summary">
          <p className={styles.blurb}>{DEPLOYMENT_TOPOLOGY.summary}</p>
          <ol className={styles.steps}>
            {DEPLOYMENT_TOPOLOGY.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className={styles.note}>{DEPLOYMENT_TOPOLOGY.note}</p>
        </Panel>
      </Section>

      <Section kicker="Quality" kickerIndex="04" title="Build, accessibility, performance">
        <div className="ui-grid">
          {CI_METRICS.map((metric) => (
            <Panel key={metric.label} title={metric.label}>
              <Badge tone={metric.freshness === "live" ? "success" : "neutral"}>
                {freshnessLabel[metric.freshness]}
              </Badge>
              <p className={styles.blurb}>{metric.value}</p>
              <p className={styles.note}>
                Method: {metric.method}
                <br />
                As of {metric.measuredAt}
              </p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section kicker="Versions" kickerIndex="05" title="Shipped packages and apps">
        <div className="ui-grid">
          <Metric label="Packages" value={packages.filter((p) => p.kind === "package").length} hint="in packages/*" />
          <Metric label="Apps" value={packages.filter((p) => p.kind === "app").length} hint="in apps/*" />
        </div>
        <div className={styles.packageGrid}>
          {packages.map((pkg) => (
            <div key={pkg.name} className={styles.packageCard}>
              <span className={styles.packageName}>{pkg.name}</span>
              <span className={styles.packageVersion}>v{pkg.version}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="Changelog" kickerIndex="06" title="Recently shipped">
        <Timeline
          items={changelog.map((entry) => ({
            time: entry.date,
            title: entry.title,
            meta: entry.sha,
          }))}
        />
      </Section>
    </>
  );
}
