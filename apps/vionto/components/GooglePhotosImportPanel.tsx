"use client";

/**
 * Self-contained "Import from Google Photos" panel.
 *
 * Handles the full client flow without threading state through the parent:
 *  - reads connection status; offers Connect / Disconnect
 *  - Picker import: open Google's picker, poll until done, import selection
 *  - Shared-album link import (falls back to the picker when not enabled)
 *
 * It owns its own upload session (via /api/uploads/session), imports into it,
 * promotes the session to the project's assets, then calls `onImported` so the
 * parent can refresh its asset list.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type StatusResponse = {
  configured: boolean;
  connected: boolean;
  status: string | null;
  googleAccountEmail: string | null;
};

type ImportSummary = {
  imported: number;
  skipped: number;
  failed: number;
};

type Props = {
  projectId: string;
  onImported: () => void | Promise<void>;
};

type Phase = "idle" | "picking" | "importing";

export function GooglePhotosImportPanel({ projectId, onImported }: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerHref, setPickerHref] = useState<string | null>(null);
  const [albumUrl, setAlbumUrl] = useState("");
  const [showAlbumInput, setShowAlbumInput] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google-photos/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    // Reflect the connect-flow result from the callback redirect.
    const params = new URLSearchParams(window.location.search);
    const gp = params.get("googlePhotos");
    if (gp) {
      if (gp === "connected") setMessage("Google Photos connected.");
      else if (gp === "denied") setError("Connection was cancelled.");
      else setError("Could not connect Google Photos. Please try again.");
      params.delete("googlePhotos");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : "")
      );
    }
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [refreshStatus]);

  function connect() {
    const returnTo = `/create`;
    window.location.href = `/api/integrations/google-photos/connect?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function disconnect() {
    await fetch("/api/integrations/google-photos/disconnect", {
      method: "POST",
    });
    setMessage("Google Photos disconnected.");
    await refreshStatus();
  }

  /** Create an upload session, import into it, then promote to the project. */
  async function importInto(
    runImport: (uploadSessionId: string) => Promise<Response>
  ) {
    setError(null);
    setMessage(null);
    setPhase("importing");
    try {
      const sessionRes = await fetch("/api/uploads/session", {
        method: "POST",
      });
      if (!sessionRes.ok) throw new Error("Could not start an upload session.");
      const { sessionId } = await sessionRes.json();

      const res = await runImport(sessionId);
      if (res.status === 409) {
        setStatus((s) => (s ? { ...s, connected: false } : s));
        throw new Error(
          "Your Google Photos access expired — please reconnect."
        );
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.message || data?.error || "Import failed.");

      if (data?.mode === "fallback") {
        setError(data.message ?? "Use the picker to import from this album.");
        return;
      }

      const summary = data as ImportSummary;
      if (!summary.imported) {
        setError(
          summary.skipped || summary.failed
            ? `Nothing imported (${summary.skipped} skipped, ${summary.failed} failed).`
            : "No photos were imported."
        );
        return;
      }

      // Promote staged assets into the project.
      const promote = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, clearSession: true }),
      });
      if (!promote.ok)
        throw new Error("Imported, but failed to add to the project.");

      const extra =
        summary.skipped || summary.failed
          ? ` (${summary.skipped} skipped, ${summary.failed} failed)`
          : "";
      setMessage(
        `Imported ${summary.imported} photo${summary.imported > 1 ? "s" : ""}${extra}.`
      );
      await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setPhase("idle");
    }
  }

  /** Open the Google picker and poll until the user finishes selecting. */
  async function startPickerImport() {
    setError(null);
    setMessage(null);
    setPhase("picking");
    try {
      const res = await fetch(
        "/api/integrations/google-photos/picker/session",
        {
          method: "POST",
        }
      );
      const session = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setStatus((s) => (s ? { ...s, connected: false } : s));
        throw new Error(
          "Your Google Photos access expired — please reconnect."
        );
      }
      if (!res.ok) {
        throw new Error(
          session?.message ||
            session?.error ||
            "Could not start the Google Photos picker."
        );
      }
      if (!session.sessionId) {
        throw new Error("Invalid picker session response from server.");
      }

      const popup = window.open(
        session.pickerUri,
        "_blank",
        "noopener,noreferrer"
      );
      if (!popup) {
        // Popup was blocked — show a manual link and keep polling
        setPickerHref(session.pickerUri);
      }

      const pollInterval = Math.max(2000, session.pollIntervalMs ?? 5000);
      const deadline = Date.now() + 10 * 60 * 1000; // 10-minute cap

      const poll = async () => {
        if (Date.now() > deadline) {
          setPhase("idle");
          setError("Timed out waiting for your photo selection.");
          return;
        }
        try {
          const pollUrl = `/api/integrations/google-photos/picker/session/${encodeURIComponent(session.sessionId)}`;
          const sres = await fetch(pollUrl);
          if (sres.status === 409) {
            setPhase("idle");
            setStatus((s) => (s ? { ...s, connected: false } : s));
            setError("Your Google Photos access expired — please reconnect.");
            return;
          }
          if (!sres.ok) {
            const errData = await sres.json().catch(() => ({}));
            setPhase("idle");
            setError(
              errData?.message ?? `Picker poll failed (${sres.status}).`
            );
            return;
          }
          const sdata = await sres.json();
          if (sdata?.mediaItemsSet) {
            await importInto((uploadSessionId) =>
              fetch("/api/integrations/google-photos/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  uploadSessionId,
                  pickerSessionId: session.sessionId,
                }),
              })
            );
            return;
          }
        } catch (e) {
          setPhase("idle");
          setError(e instanceof Error ? e.message : "Poll error.");
          return;
        }
        pollTimer.current = setTimeout(poll, pollInterval);
      };
      // Poll immediately first, then on interval
      poll();
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Could not start the picker.");
    }
  }

  async function importAlbum() {
    const url = albumUrl.trim();
    if (!url) return;
    await importInto((uploadSessionId) =>
      fetch("/api/integrations/google-photos/shared-album", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, uploadSessionId }),
      })
    );
  }

  if (!status) return null;
  if (!status.configured) return null; // Feature off on this server.

  const busy = phase !== "idle";

  return (
    <div className="mt-2 rounded-lg border border-[var(--line)] p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--text)]">Google Photos</span>
        {status.connected ? (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="text-[var(--muted)] hover:text-[var(--coral)] disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={connect}
            className="text-[var(--color-accent)] hover:underline"
          >
            Connect
          </button>
        )}
      </div>

      {status.connected && status.googleAccountEmail && (
        <p className="mt-1 text-[10px] text-[var(--muted)]">
          {status.googleAccountEmail}
        </p>
      )}

      {status.connected && (
        <div className="mt-2 space-y-2">
          <button
            type="button"
            onClick={startPickerImport}
            disabled={busy}
            className="w-full rounded-lg bg-[var(--color-accent)] px-3 py-2 font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
          >
            {phase === "picking"
              ? "Waiting for your selection…"
              : phase === "importing"
                ? "Importing…"
                : "Import from Google Photos"}
          </button>

          <button
            type="button"
            onClick={() => setShowAlbumInput((v) => !v)}
            className="text-[var(--muted)] hover:text-[var(--text)]"
          >
            {showAlbumInput
              ? "Hide shared album link"
              : "Import from a shared album link"}
          </button>

          {showAlbumInput && (
            <div className="flex gap-2">
              <input
                type="url"
                value={albumUrl}
                onChange={(e) => setAlbumUrl(e.target.value)}
                placeholder="https://photos.app.goo.gl/…"
                disabled={busy}
                className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-[var(--text)] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={importAlbum}
                disabled={busy || !albumUrl.trim()}
                className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 font-medium text-white disabled:opacity-50"
              >
                Import
              </button>
            </div>
          )}
        </div>
      )}

      {pickerHref && phase === "picking" && (
        <p className="mt-2 text-[10px] text-[var(--muted)]">
          Pop-up blocked.{" "}
          <a
            href={pickerHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline"
          >
            Open Google Photos picker
          </a>
          , then return here.
        </p>
      )}
      {message && (
        <p className="mt-2 text-[10px] text-emerald-500">{message}</p>
      )}
      {error && <p className="mt-2 text-[10px] text-[var(--coral)]">{error}</p>}
    </div>
  );
}
