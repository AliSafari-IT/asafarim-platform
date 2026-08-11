import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Metric, PageHeader, Panel, Section, Timeline } from "@asafarim/ui";
import {
  ARCHITECTURE_NODES,
  DEPLOYMENT_TOPOLOGY,
  SECURITY_BOUNDARIES,
  getChangelog,
  getCiMetrics,
  getLiveHealth,
  getPackageCards,
} from "./data";
import styles from "./proof.module.css";
import { RequestFlowDiagram } from "./_components/RequestFlowDiagram";
import { SecurityFlowDiagram } from "./_components/SecurityFlowDiagram";

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
  const ciMetrics = await getCiMetrics();
  const liveHealth = await getLiveHealth();

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
        <RequestFlowDiagram />
        <div className="ui-grid" style={{ marginTop: "var(--space-5)" }}>
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
        <SecurityFlowDiagram />
        <div className="ui-grid" style={{ marginTop: "var(--space-5)" }}>
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

      <Section kicker="Live status" kickerIndex="04" title="Is it actually up right now">
        <p className={styles.blurb}>
          Polled from each app&rsquo;s public <code>/api/status</code> endpoint at the moment you loaded this
          page — genuinely live, not a cached number.
        </p>
        <div className={styles.packageGrid}>
          {liveHealth.map((health) => (
            <div key={health.app} className={styles.packageCard}>
              <span className={styles.packageName}>{health.app}</span>
              <Badge tone={health.status === "ok" ? "success" : health.status === "degraded" ? "warning" : "danger"}>
                {health.status}
                {health.responseTimeMs !== null ? ` · ${health.responseTimeMs}ms` : ""}
              </Badge>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="Quality" kickerIndex="05" title="Build, accessibility, performance">
        <div className="ui-grid">
          {ciMetrics.map((metric) => (
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

      <Section kicker="Versions" kickerIndex="06" title="Shipped packages and apps">
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

      <Section kicker="Changelog" kickerIndex="07" title="Recently shipped">
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
