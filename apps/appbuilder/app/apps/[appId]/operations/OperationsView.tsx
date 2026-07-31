"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button } from "@asafarim/ui";
import type { BadgeTone } from "@asafarim/ui";
import {
  fetchJson,
  formatBytes,
  type AppReadinessSnapshot,
  type FeatureFlagState,
  type M13ReadinessSnapshot,
  type ReadinessStatus,
} from "./types";

const POLL_MS = 5_000;

const STATUS_TONE: Record<ReadinessStatus, BadgeTone> = {
  healthy: "success",
  degraded: "warning",
  unhealthy: "danger",
  not_configured: "warning",
  unknown: "neutral",
};

const STATUS_LABEL: Record<ReadinessStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  not_configured: "Not configured",
  unknown: "Unknown",
};

function StatusBadge({ status }: { status: ReadinessStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        display: "grid",
        gap: "var(--space-2)",
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
      }}
    >
      <h2 style={{ fontSize: "var(--text-sm)", margin: 0, fontWeight: 600 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--space-2)",
        fontSize: "var(--text-sm)",
      }}
    >
      <span className="ui-hint">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/**
 * M13 slice G — rendered in this fixed order rather than by iterating the
 * object, so the list reads dependency-first (can we store, extract, and scan
 * a file at all) before capability (vision, URL import) and then hygiene
 * (cleanup, evaluation).
 */
const M13_SECTIONS = [
  { key: "storage", label: "Attachment storage" },
  { key: "extraction", label: "Text extraction" },
  { key: "malwareScanning", label: "Content scanning" },
  { key: "modelVision", label: "Image analysis" },
  { key: "urlImport", label: "Public URL import" },
  { key: "cleanupLag", label: "Retention cleanup" },
  { key: "evaluation", label: "Quality evaluation" },
] as const satisfies ReadonlyArray<{
  key: keyof M13ReadinessSnapshot;
  label: string;
}>;

const FLAG_LABELS: Record<FeatureFlagState["key"], string> = {
  attachments: "Attachments",
  vision: "Image analysis",
  contextualMemory: "Conversation memory",
  planning: "Multi-step plans",
  urlImports: "Public URL import",
};

/**
 * A rate that was never measured renders as an em dash, never as "0%".
 * Reporting "0% of clarifying questions were answered" when none were ever
 * asked is the same misreport the `unknown` readiness status exists to
 * prevent (see lib/observability/status.ts).
 */
function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export interface OperationsViewProps {
  appId: string;
  canManageCustomDomain: boolean;
}

/**
 * The M12 launch-readiness dashboard. Every value below comes straight from
 * `GET /api/apps/{appId}/operations` (lib/observability/readiness.ts) — a
 * `null` section or an explicit "Unknown"/"Not configured" badge means
 * exactly that: this was never optimistically defaulted to a healthy-
 * looking state. Polls only while a job/deployment is actively in flight.
 */
export function OperationsView({
  appId,
  canManageCustomDomain,
}: OperationsViewProps) {
  const [snapshot, setSnapshot] = useState<AppReadinessSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestingDomain, setRequestingDomain] = useState(false);
  const [domainHost, setDomainHost] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ snapshot: AppReadinessSnapshot }>(
        `/api/apps/${appId}/operations`
      );
      setSnapshot(data.snapshot);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load the readiness snapshot."
      );
    }
  }, [appId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasActiveWork =
    snapshot?.deployment.activeDeployment != null ||
    (snapshot?.jobs?.active.length ?? 0) > 0;

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (hasActiveWork) {
      pollRef.current = setInterval(load, POLL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasActiveWork, load]);

  const requestCustomDomain = async () => {
    setRequestingDomain(true);
    try {
      await fetchJson(`/api/apps/${appId}/custom-domain`, {
        method: "POST",
        body: JSON.stringify({
          requestedHost: domainHost,
          acknowledgeNotEnabled: true,
        }),
      });
      setDomainHost("");
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to record the custom-domain request."
      );
    } finally {
      setRequestingDomain(false);
    }
  };

  const cancelCustomDomain = async (requestId: string) => {
    setRequestingDomain(true);
    try {
      await fetchJson(`/api/apps/${appId}/custom-domain`, {
        method: "DELETE",
        body: JSON.stringify({ requestId }),
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to cancel the custom-domain request."
      );
    } finally {
      setRequestingDomain(false);
    }
  };

  if (error && !snapshot) {
    return <Alert tone="error">{error}</Alert>;
  }

  if (!snapshot) {
    return <p className="ui-hint">Loading readiness snapshot…</p>;
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)", maxWidth: "1100px" }}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {snapshot.restricted ? (
        <Alert tone="info">
          You&apos;re viewing a restricted summary (viewer role). Quota,
          storage, backup, security, and job-internals detail are only shown to
          owners and editors.
        </Alert>
      ) : null}

      <Card title="Launch-blocking issues">
        {snapshot.launchBlockingIssues.length === 0 ? (
          <Alert tone="info">No known launch-blocking issues right now.</Alert>
        ) : (
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.25rem",
              display: "grid",
              gap: "var(--space-1)",
            }}
          >
            {snapshot.launchBlockingIssues.map((issue, i) => (
              <li key={i} style={{ fontSize: "var(--text-sm)" }}>
                {issue}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        <Card title="Versions">
          <Row
            label="Current draft"
            value={`v${snapshot.versions.draftVersionNumber}`}
          />
          <Row
            label="Preview build"
            value={
              snapshot.versions.previewBuild ? (
                <Badge tone="success">
                  {snapshot.versions.previewBuild.status}
                </Badge>
              ) : (
                <Badge tone="neutral">None yet</Badge>
              )
            }
          />
          <Row
            label="Approved release"
            value={
              snapshot.versions.approvedRelease ? (
                snapshot.versions.approvedRelease.versionLabel
              ) : (
                <Badge tone="neutral">None</Badge>
              )
            }
          />
          <Row
            label="Production release"
            value={
              snapshot.versions.productionRelease ? (
                snapshot.versions.productionRelease.versionLabel
              ) : (
                <Badge tone="neutral">Never deployed</Badge>
              )
            }
          />
        </Card>

        <Card title="Validation">
          <Row
            label="Status"
            value={<StatusBadge status={snapshot.validation.status} />}
          />
          {snapshot.validation.latestRun ? (
            <>
              <Row
                label="Mandatory gates"
                value={`${snapshot.validation.latestRun.mandatoryGatesPassed} / ${snapshot.validation.latestRun.mandatoryGatesTotal}`}
              />
              <Row
                label="Release-eligible"
                value={
                  snapshot.validation.latestRun.releaseEligible ? "Yes" : "No"
                }
              />
              <Row
                label="Last run"
                value={new Date(
                  snapshot.validation.latestRun.createdAt
                ).toLocaleString()}
              />
            </>
          ) : (
            <p className="ui-hint">This app has never been validated.</p>
          )}
        </Card>

        <Card title="Deployment health">
          <Row
            label="Status"
            value={<StatusBadge status={snapshot.deployment.status} />}
          />
          {snapshot.deployment.activeDeployment ? (
            <Row
              label="In progress"
              value={
                <Badge tone="info">
                  {snapshot.deployment.activeDeployment.phase.replace(
                    /_/g,
                    " "
                  )}
                  {snapshot.deployment.activeDeployment.isRollback
                    ? " (rollback)"
                    : ""}
                </Badge>
              }
            />
          ) : null}
          <div
            style={{ display: "grid", gap: "2px", marginTop: "var(--space-1)" }}
          >
            {snapshot.deployment.recentEvents.slice(0, 5).map((event) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "var(--text-xs)",
                }}
              >
                <span>
                  {event.isRollback ? "Rollback" : "Deploy"} —{" "}
                  {new Date(event.createdAt).toLocaleDateString()}
                </span>
                <Badge
                  tone={
                    event.status === "succeeded"
                      ? "success"
                      : event.status === "failed"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {event.status}
                </Badge>
              </div>
            ))}
            {snapshot.deployment.recentEvents.length === 0 ? (
              <p className="ui-hint">No deployments yet.</p>
            ) : null}
          </div>
        </Card>

        {snapshot.aiUsage ? (
          <Card title="AI generation & repair usage">
            <Row
              label="Requests today (owner-wide)"
              value={`${snapshot.aiUsage.requestsToday} / ${snapshot.aiUsage.limit}`}
            />
            <Row
              label="Last generation job"
              value={
                snapshot.aiUsage.lastGenerationJob ? (
                  <Badge tone="neutral">
                    {snapshot.aiUsage.lastGenerationJob.status}
                  </Badge>
                ) : (
                  "None yet"
                )
              }
            />
          </Card>
        ) : null}

        {snapshot.storage ? (
          <Card title="Storage usage">
            <Row
              label="Used / limit"
              value={
                <Badge tone={snapshot.storage.exceeded ? "danger" : "neutral"}>
                  {formatBytes(snapshot.storage.usedBytes)} /{" "}
                  {formatBytes(snapshot.storage.limitBytes)}
                </Badge>
              }
            />
          </Card>
        ) : null}

        {snapshot.workflows ? (
          <Card title="Workflow executions">
            <Row
              label="Today"
              value={`${snapshot.workflows.executionsToday} / ${snapshot.workflows.limit}`}
            />
          </Card>
        ) : null}

        {snapshot.quotas ? (
          <Card title="Quota consumption">
            <div style={{ display: "grid", gap: "4px" }}>
              {snapshot.quotas.map((q) => (
                <div
                  key={q.metric}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  <span>{q.label}</span>
                  <Badge tone={q.exceeded ? "danger" : "neutral"}>
                    {q.metric === "storage_bytes_per_app"
                      ? `${formatBytes(q.current)} / ${formatBytes(q.limit)}`
                      : `${q.current} / ${q.limit}`}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {snapshot.jobs ? (
          <Card title="Jobs">
            <Row label="Active" value={snapshot.jobs.active.length} />
            <Row
              label="Stuck (lease expired)"
              value={
                <Badge
                  tone={snapshot.jobs.stuck.length > 0 ? "danger" : "success"}
                >
                  {snapshot.jobs.stuck.length}
                </Badge>
              }
            />
            {snapshot.jobs.stuck.length > 0 ? (
              <div style={{ display: "grid", gap: "2px" }}>
                {snapshot.jobs.stuck.map((j) => (
                  <span
                    key={j.id}
                    className="ui-hint"
                    style={{ fontSize: "var(--text-xs)" }}
                  >
                    {j.kind} {j.id.slice(0, 8)} — {j.status}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>
        ) : null}

        {snapshot.backup ? (
          <Card title="Backup & restore">
            <Row
              label="Database backup"
              value={<StatusBadge status={snapshot.backup.status} />}
            />
            {snapshot.backup.lastBackup ? (
              <Row
                label="Last backup"
                value={
                  snapshot.backup.lastBackup.ageHours != null
                    ? `${snapshot.backup.lastBackup.ageHours.toFixed(1)}h ago (${snapshot.backup.lastBackup.status})`
                    : snapshot.backup.lastBackup.status
                }
              />
            ) : (
              <p className="ui-hint">No backup has ever been recorded.</p>
            )}
            {snapshot.backup.lastRestoreRehearsal ? (
              <Row
                label="Last restore rehearsal"
                value={
                  <Badge
                    tone={
                      snapshot.backup.lastRestoreRehearsal.status ===
                      "succeeded"
                        ? "success"
                        : "danger"
                    }
                  >
                    {snapshot.backup.lastRestoreRehearsal.status}
                  </Badge>
                }
              />
            ) : (
              <p className="ui-hint">Restore has never been rehearsed.</p>
            )}
          </Card>
        ) : null}

        {snapshot.security ? (
          <Card title="Security, privacy & retention">
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                display: "grid",
                gap: "4px",
              }}
            >
              {snapshot.security.notes.map((note, i) => (
                <li key={i} style={{ fontSize: "var(--text-xs)" }}>
                  {note}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {snapshot.m13 ? (
          <Card title="Assistant dependencies">
            <p className="ui-hint" style={{ fontSize: "var(--text-xs)", margin: 0 }}>
              A dependency that is switched off reads &ldquo;Not configured&rdquo;.
              Only a dependency that is switched <em>on</em> but missing
              something reads &ldquo;Unhealthy&rdquo;, and only those block a
              launch.
            </p>
            <dl style={{ display: "grid", gap: "var(--space-2)", margin: 0 }}>
              {M13_SECTIONS.map(({ key, label }) => {
                const section = snapshot.m13![key];
                return (
                  <div key={key} style={{ display: "grid", gap: "2px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        flexWrap: "wrap",
                      }}
                    >
                      <dt style={{ fontSize: "var(--text-sm)", margin: 0 }}>{label}</dt>
                      <StatusBadge status={section.status} />
                    </div>
                    <dd
                      className="ui-hint"
                      style={{ fontSize: "var(--text-xs)", margin: 0 }}
                    >
                      {section.summary}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        ) : null}

        {snapshot.m13 ? (
          <Card title="Assistant feature flags">
            <p className="ui-hint" style={{ fontSize: "var(--text-xs)", margin: 0 }}>
              Deploy-time switches. Turning one off stops new work of that kind;
              everything already created stays readable and downloadable.
            </p>
            {snapshot.m13.featureFlags.map((flag) => (
              <div key={flag.key} style={{ display: "grid", gap: "2px" }}>
                <Row
                  label={FLAG_LABELS[flag.key] ?? flag.key}
                  value={
                    <Badge tone={flag.enabled ? "success" : "neutral"}>
                      {flag.enabled ? "On" : "Off"}
                      {flag.usingDefault ? " (default)" : ""}
                    </Badge>
                  }
                />
                {!flag.enabled ? (
                  <p
                    className="ui-hint"
                    style={{ fontSize: "var(--text-xs)", margin: 0 }}
                  >
                    {flag.disabledEffect}
                  </p>
                ) : null}
              </div>
            ))}
          </Card>
        ) : null}

        {snapshot.m13Metrics ? (
          <Card
            title={`Assistant activity (last ${snapshot.m13Metrics.windowDays} days)`}
          >
            <Row
              label="Attachments stored"
              value={formatBytes(snapshot.m13Metrics.attachments.readyBytes)}
            />
            <Row
              label="Quarantined / unscanned commits"
              value={`${snapshot.m13Metrics.attachments.quarantined} / ${snapshot.m13Metrics.attachments.unscannedCommits}`}
            />
            <Row
              label="Uploads past their 24h cleanup deadline"
              value={
                snapshot.m13Metrics.attachments.overdueUnclaimed > 0 ? (
                  <Badge tone="warning">
                    {snapshot.m13Metrics.attachments.overdueUnclaimed}
                  </Badge>
                ) : (
                  "0"
                )
              }
            />
            <Row
              label="Target resolved on first try"
              value={formatRate(snapshot.m13Metrics.resolver.resolutionRate)}
            />
            <Row
              label="Clarifying questions answered"
              value={formatRate(snapshot.m13Metrics.clarification.answerRate)}
            />
            <Row
              label="Staged plans completed"
              value={formatRate(snapshot.m13Metrics.plans.completionRate)}
            />
            <Row
              label="References imported / blocked"
              value={`${snapshot.m13Metrics.references.imported} / ${snapshot.m13Metrics.references.blocked}`}
            />
            <Row
              label="Model calls"
              value={snapshot.m13Metrics.tokens.providerCalls.toLocaleString()}
            />
            <Row
              label="Estimated model cost"
              value={`~$${snapshot.m13Metrics.cost.totalUsd.toFixed(2)}`}
            />
            {snapshot.m13Metrics.cost.unratedModels.length > 0 ? (
              <p className="ui-hint" style={{ fontSize: "var(--text-xs)", margin: 0 }}>
                Excludes {snapshot.m13Metrics.cost.unratedModels.join(", ")} — no
                price is configured for{" "}
                {snapshot.m13Metrics.cost.unratedModels.length === 1
                  ? "that model"
                  : "those models"}
                , so their usage is counted but their cost is not.
              </p>
            ) : null}
            <p className="ui-hint" style={{ fontSize: "var(--text-xs)", margin: 0 }}>
              A dash means nothing has happened yet — not zero. Cost is an
              estimate from configured rates, never a bill.
            </p>
          </Card>
        ) : null}

        <Card title="Custom-domain readiness">
          <Alert tone="info">
            {snapshot.customDomain.enabled
              ? "Custom domains are enabled on this platform."
              : "Custom domains are NOT enabled yet. This section only records readiness data — no DNS, TLS, or routing changes occur."}
          </Alert>
          {snapshot.customDomain.request ? (
            <>
              <Row
                label="Requested host"
                value={snapshot.customDomain.request.requestedHost}
              />
              <Row
                label="Verification status"
                value={
                  <Badge tone="neutral">
                    {snapshot.customDomain.request.status}
                  </Badge>
                }
              />
              <Row
                label="TLS lifecycle"
                value={
                  <Badge tone="neutral">
                    {snapshot.customDomain.request.tlsState}
                  </Badge>
                }
              />
              {canManageCustomDomain ? (
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={requestingDomain}
                    onClick={() =>
                      cancelCustomDomain(snapshot.customDomain.request!.id)
                    }
                  >
                    Cancel request
                  </Button>
                </div>
              ) : null}
            </>
          ) : canManageCustomDomain ? (
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                placeholder="shop.example.com"
                value={domainHost}
                onChange={(e) => setDomainHost(e.target.value)}
                style={{
                  padding: "var(--space-1) var(--space-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-sm)",
                }}
                aria-label="Requested custom domain host"
              />
              <Button
                type="button"
                size="sm"
                disabled={requestingDomain || domainHost.trim().length === 0}
                onClick={requestCustomDomain}
              >
                Request readiness check
              </Button>
            </div>
          ) : (
            <p className="ui-hint">
              No custom-domain request has been made for this app.
            </p>
          )}
        </Card>
      </div>

      <p className="ui-hint" style={{ fontSize: "var(--text-xs)" }}>
        Snapshot generated {new Date(snapshot.generatedAt).toLocaleString()}.
      </p>
    </div>
  );
}
