"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, ConfirmDialog, Input } from "@asafarim/ui";
import styles from "./ConversationPanel.module.css";
import { fetchJson, type ImportReferenceResponse, type ReferencePolicy, type SafeReference } from "./types";

/**
 * M13 slice F — the public-reference importer and its provenance cards.
 *
 * The visible contract of this panel is honesty about age. A reference card
 * always shows where the content came from, which adapter read it, when it
 * was fetched, and a freshness badge — and the word "Live" appears only for
 * the single render immediately after a fetch this panel just performed
 * (`justImportedId`), because that is the only moment anything here is
 * actually live. A reload re-derives freshness on the server, so the same
 * card comes back as "Cached" or "Out of date" without the UI having to
 * expire anything itself.
 *
 * A failed refresh does NOT clear the card: the older copy stays, the badge
 * drops to "Out of date", and the failure message is shown beneath it. That
 * is the difference between "we could not re-read this" and "this is gone",
 * which the user needs to be able to tell apart.
 */

const FRESHNESS_LABEL: Record<SafeReference["freshness"], string> = {
  cached: "Cached",
  stale: "Out of date",
  unavailable: "Unavailable",
};

function freshnessTone(freshness: SafeReference["freshness"]): "success" | "warning" | "info" | "neutral" {
  if (freshness === "cached") return "info";
  if (freshness === "stale") return "warning";
  return "warning";
}

const ADAPTER_LABEL: Record<SafeReference["adapter"], string> = {
  generic_https: "Web page",
  github_profile: "GitHub profile",
  github_repository: "GitHub repository",
};

function formatFetchedAt(fetchedAt: string | null): string {
  if (!fetchedAt) return "never fetched";
  return `fetched ${new Date(fetchedAt).toLocaleString()}`;
}

export interface ReferencePanelProps {
  appId: string;
  /** Editors and owners may import/refresh/remove; viewers see provenance only. */
  canImportReference: boolean;
  /** Server-owned import catalogue — this panel keeps no limits of its own. */
  policy: ReferencePolicy | null;
  references: SafeReference[];
  onChanged: () => void | Promise<void>;
}

export function ReferencePanel({ appId, canImportReference, policy, references, onChanged }: ReferencePanelProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [justImportedId, setJustImportedId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<SafeReference | null>(null);

  // "Live" describes the fetch, not the row — so it stops being true as soon
  // as anything else happens in the panel.
  useEffect(() => {
    if (!justImportedId) return;
    const timer = setTimeout(() => setJustImportedId(null), 30_000);
    return () => clearTimeout(timer);
  }, [justImportedId]);

  const runImport = useCallback(
    async (targetUrl: string, refresh: boolean) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const data = await fetchJson<ImportReferenceResponse>(`/api/apps/${appId}/conversation/references/import`, {
          method: "POST",
          body: JSON.stringify({ url: targetUrl, refresh }),
        });
        if (data.failure) {
          // The server kept a usable older copy and told us the refresh
          // failed. Surface both facts; never present this as a success.
          setError(`${data.failure.message} Showing the copy from ${formatFetchedAt(data.reference.fetchedAt)}.`);
        } else {
          setNotice(data.freshnessLabel);
          if (data.freshness === "live") setJustImportedId(data.reference.id);
        }
        if (!refresh) setUrl("");
        await onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That URL could not be imported.");
      } finally {
        setBusy(false);
      }
    },
    [appId, onChanged],
  );

  const remove = useCallback(
    async (reference: SafeReference) => {
      setBusy(true);
      setError(null);
      try {
        await fetchJson(`/api/apps/${appId}/conversation/references/${reference.id}`, { method: "DELETE" });
        setPendingRemoval(null);
        await onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That reference could not be removed.");
      } finally {
        setBusy(false);
      }
    },
    [appId, onChanged],
  );

  return (
    <section className={styles.composer} aria-label="Public references">
      {canImportReference ? (
        <form
          className={styles.composerRow}
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = url.trim();
            if (trimmed.length > 0) void runImport(trimmed, false);
          }}
        >
          <span className={styles.composerInput}>
            <label className={styles.visuallyHidden} htmlFor="reference-url">
              Public HTTPS link to import
            </label>
            <Input
              id="reference-url"
              type="url"
              inputMode="url"
              placeholder="https://github.com/your-name"
              value={url}
              maxLength={policy?.maxUrlLength ?? 2000}
              disabled={busy}
              onChange={(event) => setUrl(event.target.value)}
            />
          </span>
          <span className={styles.composerActions}>
            <Button type="submit" size="sm" disabled={busy || url.trim().length === 0}>
              Import link
            </Button>
          </span>
        </form>
      ) : null}

      {canImportReference ? (
        <p className="ui-hint" style={{ fontSize: "var(--text-xs)" }}>
          Public https:// pages and GitHub profiles/repositories only. Imported content is treated as reference data, never as
          instructions, and is re-checked at most every{" "}
          {Math.round((policy?.cacheTtlSeconds ?? 21_600) / 3600)} hour(s).
        </p>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice && !error ? (
        <p className="ui-hint" role="status" aria-live="polite" style={{ fontSize: "var(--text-xs)" }}>
          {notice}
        </p>
      ) : null}

      {references.length > 0 ? (
        <ul className={styles.cardList} aria-label="Imported references">
          {references.map((reference) => {
            const showLive = justImportedId === reference.id && reference.freshness === "cached";
            return (
              <li key={reference.id} className={styles.card} data-status={reference.freshness}>
                <span className={styles.chipBody}>
                  <span className={styles.chipName} title={reference.sourceUrl}>
                    {reference.title ?? reference.sourceUrl}
                  </span>
                  <span className={styles.chipMeta}>
                    <Badge tone={showLive ? "success" : freshnessTone(reference.freshness)}>
                      {showLive ? "Live" : FRESHNESS_LABEL[reference.freshness]}
                    </Badge>
                    <span className={styles.chipStatusText}>
                      {ADAPTER_LABEL[reference.adapter]} · {reference.host} · {formatFetchedAt(reference.fetchedAt)}
                    </span>
                  </span>
                  {reference.failureMessage ? <span className={styles.chipError}>{reference.failureMessage}</span> : null}
                </span>
                {canImportReference ? (
                  <span className={styles.chipActions}>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void runImport(reference.sourceUrl, true)}
                    >
                      Refresh
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPendingRemoval(reference)}>
                      Remove
                    </Button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove this reference?"
        tone="danger"
        confirmLabel="Remove"
        confirmDisabled={busy}
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval);
        }}
        onCancel={() => setPendingRemoval(null)}
      >
        <p>
          {pendingRemoval?.sourceUrl} will no longer be used as context, and the imported text will be deleted. Messages that
          already used it keep what they said.
        </p>
      </ConfirmDialog>
    </section>
  );
}
