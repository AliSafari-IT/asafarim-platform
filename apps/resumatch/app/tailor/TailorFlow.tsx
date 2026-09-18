"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input } from "@asafarim/ui";

/**
 * The tailoring flow: paste a URL, confirm what was found, generate.
 *
 * Mirrors `UploadPanel.tsx`'s "nothing happens without confirmation"
 * posture — fetching a job costs nothing, but generating a tailored CV
 * spends an AI call, so the candidate sees the extracted title/employer/
 * snippet and presses a second, distinct button before that happens.
 */
export interface TailorFlowProps {
  /** The workspace's currently confirmed profile version — tailoring
   *  always reads from it, there is nothing else to pick between (only one
   *  version can be confirmed at a time). */
  confirmedVersionId: string;
}

type FetchState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "fetched"; targetJobId: string; title: string | null; employer: string | null; snippet: string }
  | { kind: "fetch_failed"; reasonCode: string }
  | { kind: "generating"; targetJobId: string }
  | { kind: "error"; message: string };

const FETCH_FAILURE_MESSAGES: Record<string, string> = {
  URL_NOT_ALLOWED: "That address is not a public web page ResuMatch can fetch.",
  REDIRECT_REFUSED: "That page redirects elsewhere, so it was not fetched.",
  RESPONSE_TOO_LARGE: "That page is too large to read.",
  TIMEOUT: "That page took too long to respond.",
  HTTP_ERROR: "That page could not be loaded.",
  NETWORK_ERROR: "That page could not be reached.",
  NO_READABLE_TEXT: "No readable job description was found on that page.",
};

export function TailorFlow({ confirmedVersionId }: TailorFlowProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const fetchJob = useCallback(async () => {
    if (!url.trim()) return;
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/fetch-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Could not fetch that URL." });
        return;
      }
      if (body.status === "FETCH_FAILED") {
        setState({ kind: "fetch_failed", reasonCode: body.reasonCode ?? "HTTP_ERROR" });
        return;
      }
      setState({
        kind: "fetched",
        targetJobId: body.id,
        title: body.title,
        employer: body.employer,
        snippet: body.snippet,
      });
    } catch {
      setState({ kind: "error", message: "Could not reach the server." });
    }
  }, [url]);

  const generate = useCallback(
    async (targetJobId: string) => {
      setState({ kind: "generating", targetJobId });
      try {
        const res = await fetch("/api/tailor/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileVersionId: confirmedVersionId, targetJobId }),
        });
        const body = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: body.error ?? "Could not generate a tailored CV." });
          return;
        }
        router.push(`/tailor/${body.id}/preview`);
      } catch {
        setState({ kind: "error", message: "Could not reach the server." });
      }
    },
    [confirmedVersionId, router],
  );

  const busy = state.kind === "fetching" || state.kind === "generating";

  return (
    <Card title="Tailor your CV to a job">
      <p style={{ opacity: 0.85 }}>
        Paste the URL of a job posting you want to apply to. ResuMatch reads the page, shows you
        what it found, and only spends an AI call once you confirm.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <Input
          type="url"
          placeholder="https://company.example/careers/senior-engineer"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          style={{ flex: 1 }}
        />
        <Button onClick={fetchJob} disabled={!url.trim() || busy}>
          {state.kind === "fetching" ? "Fetching…" : "Fetch job"}
        </Button>
      </div>

      {state.kind === "fetch_failed" ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert tone="warning">{FETCH_FAILURE_MESSAGES[state.reasonCode] ?? "That page could not be read."}</Alert>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert tone="error">{state.message}</Alert>
        </div>
      ) : null}

      {state.kind === "fetched" || state.kind === "generating" ? (
        <div style={{ marginTop: "1rem" }}>
          <Card title={state.kind === "fetched" ? state.title ?? "Job found" : "Job found"}>
            {state.kind === "fetched" && state.employer ? <p style={{ opacity: 0.8 }}>{state.employer}</p> : null}
            {state.kind === "fetched" ? (
              <p style={{ opacity: 0.7, fontSize: "0.9rem" }}>{state.snippet}…</p>
            ) : null}
            <Button onClick={() => generate(state.targetJobId)} disabled={state.kind === "generating"}>
              {state.kind === "generating" ? "Tailoring your CV…" : "Tailor my CV to this job"}
            </Button>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}
