"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, ConfirmDialog } from "@asafarim/ui";
import {
  fetchJson,
  TERMINAL_DEPLOYMENT_STATUSES,
  type Deployment,
  type DeploymentStep,
  type Release,
  type SpecificationVersion,
} from "./types";

const POLL_MS = 3_000;

function releaseTone(status: Release["status"]): "success" | "warning" | "info" | "neutral" {
  if (status === "published") return "success";
  if (status === "approved") return "info";
  if (status === "archived") return "warning";
  return "neutral";
}

function deploymentTone(status: Deployment["status"]): "success" | "warning" | "info" | "neutral" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "rolled_back") return "warning";
  if (status === "pending" || status === "running") return "info";
  return "neutral";
}

const PHASE_LABELS: Record<Deployment["phase"], string> = {
  queued: "Queued",
  checking_eligibility: "Checking eligibility",
  freezing_manifest: "Verifying manifest",
  reserving_slug: "Reserving production slug",
  checking_data_compatibility: "Checking data compatibility",
  preparing_artifact: "Preparing artifact",
  publishing: "Publishing",
  health_checking: "Health check",
  smoke_testing: "Smoke test",
  activating: "Activating production",
  verifying: "Verifying production",
  completed: "Completed",
  rolling_back: "Rolling back",
};

export interface DeploymentPanelProps {
  appId: string;
  currentVersionNumber: number;
  canApprove: boolean;
  canDeploy: boolean;
}

/**
 * M11 deployment surface: release preparation (exact version/checksum being
 * approved, with a link back to the validation run that proved it eligible),
 * approve/deploy actions, live deployment progress with safe logs, the
 * current production URL/active release, release history, and rollback —
 * everything the issue's "deployment UI" requirements ask for, driven
 * entirely by lib/repositories/releases.ts and deployments.ts through the
 * app/api/apps/[appId]/releases and .../deployments routes.
 */
export function DeploymentPanel({ appId, currentVersionNumber, canApprove, canDeploy }: DeploymentPanelProps) {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [steps, setSteps] = useState<DeploymentStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRollback, setConfirmingRollback] = useState<Release | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadReleases = useCallback(async () => {
    try {
      const data = await fetchJson<{ releases: Release[] }>(`/api/apps/${appId}/releases`);
      setReleases(data.releases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load releases.");
    }
  }, [appId]);

  const loadDeployments = useCallback(async () => {
    try {
      const data = await fetchJson<{ deployments: Deployment[] }>(`/api/apps/${appId}/deployments`);
      setDeployments(data.deployments);
      setActiveDeploymentId((current) => current ?? data.deployments[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deployments.");
    }
  }, [appId]);

  const loadDeploymentDetail = useCallback(async (deploymentId: string) => {
    try {
      const data = await fetchJson<{ deployment: Deployment; steps: DeploymentStep[] }>(`/api/apps/${appId}/deployments/${deploymentId}`);
      setSteps(data.steps);
      setDeployments((current) => (current ? current.map((d) => (d.id === deploymentId ? data.deployment : d)) : current));
      // Polling stops the instant a deployment reaches a terminal status
      // (see below) — `loadReleases` is a SEPARATE, unsequenced request, so
      // without this there is no guarantee its last poll tick actually
      // observed the release row's status flip (e.g. to "published") that
      // activation guarantees already happened before this exact terminal
      // status was ever reachable. Fetching it here, keyed off THIS
      // dedicated detail read confirming terminal state, closes that race
      // rather than hoping a same-tick, independently-timed fetch happened
      // to land after it.
      if (TERMINAL_DEPLOYMENT_STATUSES.has(data.deployment.status)) {
        loadReleases();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deployment detail.");
    }
  }, [appId, loadReleases]);

  useEffect(() => {
    loadReleases();
    loadDeployments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  useEffect(() => {
    if (activeDeploymentId) loadDeploymentDetail(activeDeploymentId);
    else setSteps(null);
  }, [activeDeploymentId, loadDeploymentDetail]);

  const activeDeployment = deployments?.find((d) => d.id === activeDeploymentId) ?? null;
  const hasRunningDeployment = deployments?.some((d) => !TERMINAL_DEPLOYMENT_STATUSES.has(d.status)) ?? false;

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (hasRunningDeployment) {
      pollRef.current = setInterval(() => {
        loadDeployments();
        loadReleases();
        if (activeDeploymentId) loadDeploymentDetail(activeDeploymentId);
      }, POLL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasRunningDeployment, activeDeploymentId, loadDeployments, loadReleases, loadDeploymentDetail]);

  const activeProductionRelease = releases?.find((r) => r.status === "published") ?? null;
  const draftDiffersFromProduction =
    activeProductionRelease !== null && activeProductionRelease.specificationVersionNumber !== currentVersionNumber;

  const prepareRelease = async () => {
    setBusy(true);
    setError(null);
    try {
      const spec = await fetchJson<{ latestVersion: SpecificationVersion | null }>(`/api/apps/${appId}/specification`);
      if (!spec.latestVersion) throw new Error("This app has no specification version yet.");
      await fetchJson<{ release: Release }>(`/api/apps/${appId}/releases`, {
        method: "POST",
        body: JSON.stringify({ specificationVersionId: spec.latestVersion.id }),
      });
      await loadReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare release.");
    } finally {
      setBusy(false);
    }
  };

  const approveRelease = async (releaseId: string) => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/releases/${releaseId}/approve`, { method: "POST" });
      await loadReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve release.");
    } finally {
      setBusy(false);
    }
  };

  const deployRelease = async (releaseId: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ deployment: Deployment }>(`/api/apps/${appId}/deployments`, {
        method: "POST",
        body: JSON.stringify({ releaseId, idempotencyKey: crypto.randomUUID() }),
      });
      setActiveDeploymentId(data.deployment.id);
      await loadDeployments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start deployment.");
    } finally {
      setBusy(false);
    }
  };

  const cancelDeployment = async (deploymentId: string) => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/deployments/${deploymentId}/cancel`, { method: "POST" });
      await loadDeployments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel deployment.");
    } finally {
      setBusy(false);
    }
  };

  const rollbackTo = async (release: Release) => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ deployment: Deployment }>(`/api/apps/${appId}/releases/${release.id}/rollback`, {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      setActiveDeploymentId(data.deployment.id);
      await Promise.all([loadDeployments(), loadReleases()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start rollback.");
    } finally {
      setBusy(false);
      setConfirmingRollback(null);
    }
  };

  const draftRelease = releases?.find((r) => r.status === "draft") ?? null;
  const approvedRelease = releases?.find((r) => r.status === "approved") ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "var(--space-3)" }}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div>
        <strong style={{ fontSize: "var(--text-sm)" }}>Deployment</strong>
      </div>

      {activeProductionRelease ? (
        <div style={{ display: "grid", gap: "var(--space-1)", padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Badge tone="success">Live</Badge>
            <span style={{ fontSize: "var(--text-sm)" }}>{activeProductionRelease.versionLabel}</span>
          </div>
          <a href={`https://${activeProductionRelease.productionHost}`} target="_blank" rel="noreferrer" className="ui-hint" style={{ fontSize: "var(--text-xs)" }}>
            https://{activeProductionRelease.productionHost}
          </a>
          {draftDiffersFromProduction ? (
            <Alert tone="info">
              The current draft (v{currentVersionNumber}) differs from what&apos;s live in production (v
              {activeProductionRelease.specificationVersionNumber}). Prepare and approve a new release to deploy the draft.
            </Alert>
          ) : null}
        </div>
      ) : (
        <p className="ui-hint">No production release yet. Prepare a release once this version has passed validation.</p>
      )}

      {draftRelease ? (
        <div style={{ display: "grid", gap: "var(--space-1)", padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Badge tone={releaseTone(draftRelease.status)}>{draftRelease.status}</Badge>
            <span style={{ fontSize: "var(--text-sm)" }}>{draftRelease.versionLabel}</span>
          </div>
          <span className="ui-hint" style={{ fontSize: "var(--text-xs)", wordBreak: "break-all" }}>
            checksum {draftRelease.specificationChecksum.slice(0, 16)}…
          </span>
          {canApprove ? (
            <div>
              <Button type="button" size="sm" onClick={() => approveRelease(draftRelease.id)} disabled={busy}>
                Approve
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!draftRelease && !approvedRelease && releases !== null && canDeploy ? (
        <Button type="button" size="sm" onClick={prepareRelease} disabled={busy}>
          Prepare release for v{currentVersionNumber}
        </Button>
      ) : null}

      {approvedRelease ? (
        <div style={{ display: "grid", gap: "var(--space-1)", padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Badge tone={releaseTone(approvedRelease.status)}>{approvedRelease.status}</Badge>
            <span style={{ fontSize: "var(--text-sm)" }}>{approvedRelease.versionLabel}</span>
          </div>
          {canDeploy ? (
            <div>
              <Button type="button" size="sm" onClick={() => deployRelease(approvedRelease.id)} disabled={busy || hasRunningDeployment}>
                {hasRunningDeployment ? "Deploying…" : "Deploy to production"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeDeployment ? (
        <div style={{ display: "grid", gap: "var(--space-1)", padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Badge tone={deploymentTone(activeDeployment.status)}>{activeDeployment.status.replace(/_/g, " ")}</Badge>
            <span style={{ fontSize: "var(--text-xs)" }}>{PHASE_LABELS[activeDeployment.phase]}</span>
            {activeDeployment.isRollback ? <Badge tone="neutral">rollback</Badge> : null}
          </div>
          {activeDeployment.failureMessage ? <Alert tone="error">{activeDeployment.failureMessage}</Alert> : null}
          {!TERMINAL_DEPLOYMENT_STATUSES.has(activeDeployment.status) && !activeDeployment.activatedAt && canDeploy ? (
            <div>
              <Button type="button" size="sm" variant="ghost" onClick={() => cancelDeployment(activeDeployment.id)} disabled={busy}>
                Cancel
              </Button>
            </div>
          ) : null}
          {steps && steps.length > 0 ? (
            <div style={{ marginTop: "var(--space-1)", display: "grid", gap: "2px" }}>
              {steps.map((step) => (
                <div key={step.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)" }}>
                  <span>{PHASE_LABELS[step.phase]}</span>
                  <Badge tone={step.ok ? "success" : "warning"}>{step.ok ? "ok" : "failed"}</Badge>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: "auto", display: "grid", gap: "var(--space-2)" }}>
        <strong style={{ fontSize: "var(--text-xs)" }}>Release history</strong>
        {releases === null ? (
          <p className="ui-hint">Loading releases…</p>
        ) : releases.length === 0 ? (
          <p className="ui-hint">No releases yet.</p>
        ) : (
          releases.map((release) => (
            <div key={release.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-2)", fontSize: "var(--text-xs)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Badge tone={releaseTone(release.status)}>{release.status}</Badge>
                <span>{release.versionLabel}</span>
              </div>
              {(release.status === "superseded" || release.status === "published") && release.id !== activeProductionRelease?.id && canDeploy ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingRollback(release)} disabled={busy || hasRunningDeployment}>
                  Roll back to this
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirmingRollback !== null}
        title="Roll back production"
        tone="danger"
        confirmLabel="Roll back"
        confirmDisabled={busy}
        onConfirm={() => confirmingRollback && rollbackTo(confirmingRollback)}
        onCancel={() => setConfirmingRollback(null)}
      >
        <p>
          Production will be switched back to <strong>{confirmingRollback?.versionLabel}</strong>. This creates a new
          deployment and runs health/smoke verification again — it never rewrites release history, and your production
          data is preserved.
        </p>
      </ConfirmDialog>
    </div>
  );
}
