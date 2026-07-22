"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, ConfirmDialog, Select } from "@asafarim/ui";
import { fetchJson, type FetchJsonError, type SpecificationDiff, type SpecificationVersion } from "./types";

export interface VersionHistoryPanelProps {
  appId: string;
  currentVersionNumber: number;
  canRestore: boolean;
  canUndo: boolean;
  onChanged: (versionNumber: number) => void;
}

function DiffList({ diff }: { diff: SpecificationDiff }) {
  if (diff.entries.length === 0) return <p className="ui-hint">No differences.</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: "var(--space-4)", fontSize: "var(--text-xs)" }}>
      {diff.entries.map((entry, i) => (
        <li key={i}>
          <Badge tone={entry.kind === "added" ? "success" : entry.kind === "removed" ? "warning" : "info"}>{entry.kind}</Badge>{" "}
          {entry.path.join(".")}
        </li>
      ))}
    </ul>
  );
}

export function VersionHistoryPanel({ appId, currentVersionNumber, canRestore, canUndo, onChanged }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<SpecificationVersion[] | null>(null);
  const [fromVersion, setFromVersion] = useState<number | null>(null);
  const [toVersion, setToVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<SpecificationDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [undoNotice, setUndoNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ versions: SpecificationVersion[] }>(`/api/apps/${appId}/specification/versions`)
      .then((data) => setVersions(data.versions))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load version history."));
  }, [appId, currentVersionNumber]);

  const compare = async () => {
    if (fromVersion === null || toVersion === null) return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ diff: SpecificationDiff }>(
        `/api/apps/${appId}/specification/versions/compare?from=${fromVersion}&to=${toVersion}`,
      );
      setDiff(data.diff);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compare versions.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (restoreTarget === null) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/specification/versions/${restoreTarget}/restore`, {
        method: "POST",
        body: JSON.stringify({ baseVersionNumber: currentVersionNumber, idempotencyKey: crypto.randomUUID() }),
      });
      setRestoreTarget(null);
      onChanged(currentVersionNumber + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore version.");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    setError(null);
    setUndoNotice(null);
    try {
      await fetchJson(`/api/apps/${appId}/specification/operations/undo`, {
        method: "POST",
        body: JSON.stringify({ baseVersionNumber: currentVersionNumber, idempotencyKey: crypto.randomUUID() }),
      });
      onChanged(currentVersionNumber + 1);
    } catch (err) {
      const fetchErr = err as FetchJsonError;
      if (fetchErr.code === "restore_required") {
        setUndoNotice("This change has no safe automatic undo — restore an earlier version instead.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to undo.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (versions === null) return <p className="ui-hint">Loading version history…</p>;

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {undoNotice ? <Alert tone="info">{undoNotice}</Alert> : null}

      {canUndo ? (
        <Button type="button" variant="secondary" size="sm" onClick={undo} disabled={busy || currentVersionNumber === 0}>
          Undo last change
        </Button>
      ) : null}

      <div>
        <h3 style={{ fontSize: "var(--text-sm)", margin: "0 0 var(--space-2)" }}>Compare versions</h3>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Select
            aria-label="From version"
            options={versions.map((v) => ({ value: String(v.versionNumber), label: `v${v.versionNumber}` }))}
            value={fromVersion !== null ? String(fromVersion) : ""}
            onChange={(e) => setFromVersion(Number(e.target.value))}
          />
          <span>→</span>
          <Select
            aria-label="To version"
            options={versions.map((v) => ({ value: String(v.versionNumber), label: `v${v.versionNumber}` }))}
            value={toVersion !== null ? String(toVersion) : ""}
            onChange={(e) => setToVersion(Number(e.target.value))}
          />
          <Button type="button" size="sm" onClick={compare} disabled={busy || fromVersion === null || toVersion === null}>
            Compare
          </Button>
        </div>
        {diff ? (
          <div style={{ marginTop: "var(--space-2)" }}>
            <DiffList diff={diff} />
          </div>
        ) : null}
      </div>

      <div>
        <h3 style={{ fontSize: "var(--text-sm)", margin: "0 0 var(--space-2)" }}>History</h3>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
          {[...versions].reverse().map((version) => (
            <li key={version.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "var(--space-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
                <strong>v{version.versionNumber}</strong>
                {version.versionNumber === currentVersionNumber ? <Badge tone="success">Current</Badge> : null}
              </div>
              <p className="ui-hint" style={{ margin: "var(--space-1) 0" }}>
                {version.summary || "(no summary)"} — {new Date(version.createdAt).toLocaleString()}
              </p>
              <p className="ui-hint" style={{ fontSize: "var(--text-xs)", wordBreak: "break-all" }}>
                Checksum: {version.checksum.slice(0, 16)}…
              </p>
              {canRestore && version.versionNumber !== currentVersionNumber ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setRestoreTarget(version.versionNumber)}>
                  Restore as new version
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={restoreTarget !== null}
        title={`Restore version ${restoreTarget ?? ""} as a new version?`}
        message="This creates a new version with that snapshot's content. It never changes production, and the version you're restoring from stays exactly as it is."
        confirmLabel="Restore"
        confirmDisabled={busy}
        onConfirm={restore}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
