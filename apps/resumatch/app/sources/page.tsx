import type { Metadata } from "next";
import { Alert, Badge, Card, PageHeader } from "@asafarim/ui";
import { getIngestionHealth } from "../../lib/ingestion/status";
import { SHOWCASE_ATTRIBUTION, SHOWCASE_SOURCE_KEY } from "../../lib/ingestion/showcaseFixture";
import { getCurrentWorkspace } from "../../lib/workspace";

export const metadata: Metadata = { title: "Job sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker="Sources" title="Sign in to see where jobs come from." />
      </>
    );
  }

  const sources = await getIngestionHealth();

  return (
    <>
      <PageHeader
        kicker="Job sources"
        kickerIndex="M3"
        title="Where the jobs come from, and under what terms."
        description="Every posting JobMatch shows is traceable to a source and an agreement. A source that has no agreement on file does not get fetched."
      />

      {sources.length === 0 ? (
        <Alert tone="info">
          <strong>No source is configured.</strong> JobMatch does not scrape: a real source has to
          be chosen, its terms agreed and recorded, and only then enabled — commercial and legal
          work rather than engineering. For the showcase, a clearly-labelled{" "}
          <strong>synthetic demo source</strong> can be loaded instead (operator command{" "}
          <code className="jm-mono">showcase:load</code>); its postings are fabricated and are never
          real vacancies.
        </Alert>
      ) : (
        <div className="jm-grid" style={{ margin: "2rem 0" }}>
          {sources.map((source) => (
            <Card key={source.key} title={source.name}>
              <p className="jm-mono" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                {source.key}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
                {source.key === SHOWCASE_SOURCE_KEY ? (
                  <Badge tone="neutral">synthetic demo</Badge>
                ) : null}
                <Badge tone={source.canSync ? "success" : "warning"}>
                  {source.canSync ? "syncing" : "not syncing"}
                </Badge>
                {source.agreementExpiringSoon ? (
                  <Badge tone="warning">agreement expiring</Badge>
                ) : null}
              </div>

              {source.key === SHOWCASE_SOURCE_KEY ? (
                <p style={{ opacity: 0.85 }}>{SHOWCASE_ATTRIBUTION}</p>
              ) : null}

              {source.refusal ? <p style={{ opacity: 0.85 }}>{source.refusal}</p> : null}

              <p className="jm-mono" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                {source.activePostings} active · {source.duplicatePostings} duplicates
                {source.lastSyncFinishedAt
                  ? ` · last sync ${source.lastSyncFinishedAt.slice(0, 10)}`
                  : " · never synced"}
              </p>

              {source.recentRuns.length > 0 ? (
                <ul className="jm-list">
                  {source.recentRuns.map((run) => (
                    <li key={run.startedAt}>
                      <span className="jm-mono" style={{ fontSize: "0.75rem" }}>
                        {run.startedAt.slice(0, 16).replace("T", " ")} · {run.outcome ?? "running"}
                        {run.notModified ? " · unchanged" : ""}
                        {run.reasonCode ? ` · ${run.reasonCode}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
