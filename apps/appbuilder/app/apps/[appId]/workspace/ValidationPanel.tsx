"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, ConfirmDialog } from "@asafarim/ui";
import {
  fetchJson,
  TERMINAL_VALIDATION_RUN_STATUSES,
  TERMINAL_REPAIR_ATTEMPT_STATUSES,
  type ValidationRun,
  type ValidationGateResult,
  type ValidationArtifact,
  type RepairAttempt,
} from "./types";

const POLL_MS = 3_000;

const GATE_LABELS: Record<string, string> = {
  spec_schema_validity: "Specification schema validity",
  reference_integrity: "Reference integrity",
  operation_legality: "Operation legality",
  registry_validity: "Component/template registry validity",
  preview_renderability: "Preview renderability",
  permissions_authorization: "Permissions & authorization",
  unsafe_content_policy: "Unsafe content / URL policy",
  schema_evolution_safety: "Schema-evolution safety",
  file_storage_policy: "File / storage policy",
  required_pages_routes: "Required pages / routes",
  accessibility_baseline: "Accessibility baseline",
  responsive_layout_baseline: "Responsive layout baseline",
  generated_data_crud_smoke: "Generated data CRUD smoke",
  role_denial_journeys: "Role-based denial journeys",
  workflow_idempotency: "Workflow idempotency",
  migration_destructive_safety: "Migration / destructive-change safety",
};

function runTone(status: ValidationRun["status"]): "success" | "warning" | "info" | "neutral" {
  if (status === "passed") return "success";
  if (status === "failed" || status === "infrastructure_error" || status === "flaky") return "warning";
  if (status === "pending" || status === "running") return "info";
  return "neutral";
}

function gateTone(status: ValidationGateResult["status"]): "success" | "warning" | "info" | "neutral" {
  if (status === "passed") return "success";
  if (status === "failed" || status === "infrastructure_error" || status === "flaky") return "warning";
  if (status === "skipped") return "neutral";
  return "info";
}

function runStatusExplanation(run: ValidationRun): string {
  switch (run.status) {
    case "pending":
      return "Queued — waiting for the worker to pick this run up.";
    case "running":
      return "Running every validation gate now. This can take a few minutes (browser-driven smoke gates included).";
    case "passed":
      return run.releaseEligible
        ? "All mandatory gates passed. This version is release-eligible."
        : "All mandatory gates that could run passed, but at least one was skipped rather than positively verified — not yet release-eligible.";
    case "failed":
      return "One or more mandatory gates failed. Review the gate list below, or request a bounded AI repair for a supported failure.";
    case "infrastructure_error":
      return "A gate could not be evaluated due to an infrastructure problem (e.g. the browser smoke harness was unavailable) — this is not a verdict on the app itself. Rerun once the environment issue is resolved.";
    case "flaky":
      return "A gate produced an inconsistent result. This is not a verdict on the app itself — rerun to get a trustworthy result.";
    case "cancelled":
      return "This run was cancelled before completing.";
  }
}

export interface ValidationPanelProps {
  appId: string;
  canRequestValidation: boolean;
  canCancelValidation: boolean;
  canRequestRepair: boolean;
  canConfirmRepair: boolean;
  canCancelRepair: boolean;
  onVersionApplied: (versionNumber: number) => void;
}

export function ValidationPanel({
  appId,
  canRequestValidation,
  canCancelValidation,
  canRequestRepair,
  canConfirmRepair,
  canCancelRepair,
  onVersionApplied,
}: ValidationPanelProps) {
  const [runs, setRuns] = useState<ValidationRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [gates, setGates] = useState<ValidationGateResult[] | null>(null);
  const [artifacts, setArtifacts] = useState<ValidationArtifact[] | null>(null);
  const [repairs, setRepairs] = useState<RepairAttempt[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGateKey, setExpandedGateKey] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await fetchJson<{ runs: ValidationRun[] }>(`/api/apps/${appId}/validation-runs`);
      setRuns(data.runs);
      setSelectedRunId((current) => current ?? data.runs[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load validation runs.");
    }
  }, [appId]);

  const loadRunDetail = useCallback(
    async (runId: string) => {
      try {
        const [runDetail, artifactData, repairData] = await Promise.all([
          fetchJson<{ run: ValidationRun; gates: ValidationGateResult[] }>(`/api/apps/${appId}/validation-runs/${runId}`),
          fetchJson<{ artifacts: ValidationArtifact[] }>(`/api/apps/${appId}/validation-runs/${runId}/artifacts`),
          fetchJson<{ attempts: RepairAttempt[] }>(`/api/apps/${appId}/validation-runs/${runId}/repair`),
        ]);
        setGates(runDetail.gates);
        setArtifacts(artifactData.artifacts);
        setRepairs(repairData.attempts);
        setRuns((current) => (current ? current.map((r) => (r.id === runId ? runDetail.run : r)) : current));

        const latestRepair = repairData.attempts[repairData.attempts.length - 1];
        if (latestRepair?.status === "completed" && latestRepair.resultingVersionNumber) {
          onVersionApplied(latestRepair.resultingVersionNumber);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load validation run detail.");
      }
    },
    [appId, onVersionApplied],
  );

  useEffect(() => {
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  useEffect(() => {
    if (selectedRunId) loadRunDetail(selectedRunId);
    else {
      setGates(null);
      setArtifacts(null);
      setRepairs(null);
    }
  }, [selectedRunId, loadRunDetail]);

  const selectedRun = runs?.find((r) => r.id === selectedRunId) ?? null;
  const hasActiveRun = runs?.some((r) => !TERMINAL_VALIDATION_RUN_STATUSES.has(r.status)) ?? false;
  const hasActiveRepair = repairs?.some((r) => !TERMINAL_REPAIR_ATTEMPT_STATUSES.has(r.status)) ?? false;

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (hasActiveRun || hasActiveRepair) {
      pollRef.current = setInterval(() => {
        loadRuns();
        if (selectedRunId) loadRunDetail(selectedRunId);
      }, POLL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasActiveRun, hasActiveRepair, loadRuns, loadRunDetail, selectedRunId]);

  const requestValidation = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ run: ValidationRun }>(`/api/apps/${appId}/validation-runs`, {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      setSelectedRunId(data.run.id);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request validation.");
    } finally {
      setBusy(false);
    }
  };

  const cancelRun = async (runId: string) => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/validation-runs/${runId}/cancel`, { method: "POST" });
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel validation run.");
    } finally {
      setBusy(false);
    }
  };

  const requestRepair = async (runId: string) => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/validation-runs/${runId}/repair`, {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      await loadRunDetail(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request repair.");
    } finally {
      setBusy(false);
    }
  };

  const cancelRepair = async (attemptId: string) => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/repair-attempts/${attemptId}/cancel`, { method: "POST" });
      if (selectedRunId) await loadRunDetail(selectedRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel repair.");
    } finally {
      setBusy(false);
    }
  };

  const confirmRepair = async (attempt: RepairAttempt) => {
    if (!attempt.confirmationChecksum) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/repair-attempts/${attempt.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ checksum: attempt.confirmationChecksum }),
      });
      if (selectedRunId) await loadRunDetail(selectedRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm repair.");
    } finally {
      setBusy(false);
    }
  };

  const awaitingConfirmationRepair = repairs?.find((r) => r.status === "awaiting_confirmation") ?? null;
  const canRepairThisRun = selectedRun?.status === "failed" && (repairs?.length ?? 0) < 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "var(--space-3)" }}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <div>
          <strong style={{ fontSize: "var(--text-sm)" }}>Validation</strong>
        </div>
        {canRequestValidation ? (
          <Button type="button" size="sm" onClick={requestValidation} disabled={busy || hasActiveRun}>
            {hasActiveRun ? "Running…" : "Run validation"}
          </Button>
        ) : null}
      </div>

      {runs === null ? (
        <p className="ui-hint">Loading validation history…</p>
      ) : runs.length === 0 ? (
        <p className="ui-hint">No validation runs yet. Run validation to check whether this version is release-eligible.</p>
      ) : (
        <>
          {selectedRun ? (
            <div style={{ display: "grid", gap: "var(--space-1)", padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Badge tone={runTone(selectedRun.status)}>{selectedRun.status.replace(/_/g, " ")}</Badge>
                <Badge tone={selectedRun.releaseEligible ? "success" : "neutral"}>
                  {selectedRun.releaseEligible ? "Release eligible" : "Not release eligible"}
                </Badge>
                <span className="ui-hint" style={{ fontSize: "var(--text-xs)" }}>
                  {selectedRun.mandatoryGatesPassed}/{selectedRun.mandatoryGatesTotal} mandatory gates passed
                </span>
              </div>
              <p className="ui-hint" style={{ fontSize: "var(--text-xs)" }}>{runStatusExplanation(selectedRun)}</p>
              {!TERMINAL_VALIDATION_RUN_STATUSES.has(selectedRun.status) && canCancelValidation ? (
                <div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => cancelRun(selectedRun.id)} disabled={busy}>
                    Cancel run
                  </Button>
                </div>
              ) : null}
              {canRepairThisRun && canRequestRepair && !hasActiveRepair ? (
                <div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => requestRepair(selectedRun.id)} disabled={busy}>
                    Request AI repair
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "var(--space-1)", overflowX: "auto" }}>
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`ui-btn ui-btn--sm ${run.id === selectedRunId ? "ui-btn--primary" : "ui-btn--ghost"}`}
                onClick={() => setSelectedRunId(run.id)}
                title={new Date(run.createdAt).toLocaleString()}
              >
                {new Date(run.createdAt).toLocaleTimeString()}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "grid", gap: "var(--space-2)" }}>
            <strong style={{ fontSize: "var(--text-xs)" }}>Gates</strong>
            {gates === null ? (
              <p className="ui-hint">Loading gates…</p>
            ) : (
              gates.map((gate) => (
                <div key={gate.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-2)" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                    onClick={() => setExpandedGateKey((k) => (k === gate.gateKey ? null : gate.gateKey))}
                  >
                    <span style={{ fontSize: "var(--text-sm)" }}>{GATE_LABELS[gate.gateKey] ?? gate.gateKey}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      {!gate.mandatory ? <Badge tone="neutral">optional</Badge> : null}
                      <Badge tone={gateTone(gate.status)}>{gate.status.replace(/_/g, " ")}</Badge>
                    </div>
                  </div>
                  {expandedGateKey === gate.gateKey ? (
                    <div style={{ marginTop: "var(--space-2)", fontSize: "var(--text-xs)" }}>
                      {gate.skipReason ? <p className="ui-hint">Skipped: {gate.skipReason}</p> : null}
                      {gate.failureMessage ? <p>{gate.failureMessage}</p> : null}
                      {gate.structuredFailures.length > 0 ? (
                        <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "var(--space-4)" }}>
                          {gate.structuredFailures.slice(0, 20).map((f, i) => (
                            <li key={i}>{f.message}</li>
                          ))}
                        </ul>
                      ) : null}
                      {gate.artifactIds.length > 0 && artifacts ? (
                        <div style={{ marginTop: "var(--space-1)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                          {artifacts
                            .filter((a) => gate.artifactIds.includes(a.id))
                            .map((artifact) => (
                              <a
                                key={artifact.id}
                                href={`/api/apps/${appId}/validation-runs/${selectedRunId}/artifacts/${artifact.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                              >
                                {artifact.label}
                              </a>
                            ))}
                        </div>
                      ) : null}
                      {gate.durationMs !== null ? <p className="ui-hint">{gate.durationMs}ms</p> : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}

            {repairs && repairs.length > 0 ? (
              <>
                <strong style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-2)" }}>Repair attempts</strong>
                {repairs.map((attempt) => (
                  <div key={attempt.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-2)", fontSize: "var(--text-xs)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>Attempt {attempt.attemptNumber}</span>
                      <Badge tone={attempt.status === "completed" ? "success" : attempt.status === "failed" || attempt.status === "cancelled" ? "warning" : "info"}>
                        {attempt.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    {attempt.failureClassification ? <p className="ui-hint">Classification: {attempt.failureClassification.replace(/_/g, " ")}</p> : null}
                    {attempt.failureMessage ? <p>{attempt.failureMessage}</p> : null}
                    {!TERMINAL_REPAIR_ATTEMPT_STATUSES.has(attempt.status) && attempt.status !== "awaiting_confirmation" && canCancelRepair ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => cancelRepair(attempt.id)} disabled={busy}>
                        Cancel repair
                      </Button>
                    ) : null}
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </>
      )}

      <ConfirmDialog
        open={awaitingConfirmationRepair !== null}
        title="Confirm destructive repair"
        tone="danger"
        confirmLabel="Apply repair"
        confirmDisabled={busy || !canConfirmRepair}
        onConfirm={() => awaitingConfirmationRepair && confirmRepair(awaitingConfirmationRepair)}
        onCancel={() => awaitingConfirmationRepair && cancelRepair(awaitingConfirmationRepair.id)}
      >
        <p>
          The proposed fix removes or narrows something that already exists (classification:{" "}
          {awaitingConfirmationRepair?.failureClassification?.replace(/_/g, " ")}). Review carefully before applying.
        </p>
        {!canConfirmRepair ? <p className="ui-hint">Only the person who requested this repair can confirm it.</p> : null}
      </ConfirmDialog>
    </div>
  );
}
