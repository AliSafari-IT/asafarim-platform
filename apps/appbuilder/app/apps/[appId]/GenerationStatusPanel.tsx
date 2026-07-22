"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card } from "@asafarim/ui";

type JobStatus =
  | "queued"
  | "analyzing"
  | "needs_clarification"
  | "planning"
  | "applying"
  | "validating"
  | "preparing_preview"
  | "ready"
  | "failed"
  | "cancelled";

interface ClarificationQuestion {
  id: string;
  question: string;
  reason?: string;
}
interface ClarificationRound {
  roundNumber: number;
  questions: ClarificationQuestion[];
  answers: Array<{ questionId: string; answer: string }>;
}
interface GenerationJob {
  id: string;
  status: JobStatus;
  phase: string;
  failureMessage: string | null;
  cancelRequestedAt: string | null;
  resultingVersionNumber: number | null;
  clarificationState: { rounds: ClarificationRound[] } | null;
}

const TERMINAL: ReadonlySet<JobStatus> = new Set(["ready", "failed", "cancelled"]);
const POLL_MS = 3_000;

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  analyzing: "Analyzing your request",
  needs_clarification: "Waiting on your answers",
  planning: "Planning the application",
  applying: "Applying changes",
  validating: "Validating the specification",
  preparing_preview: "Building preview",
  ready: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

function statusTone(status: JobStatus): "success" | "warning" | "info" | "neutral" {
  if (status === "ready") return "success";
  if (status === "failed" || status === "cancelled") return "warning";
  if (status === "needs_clarification") return "info";
  return "neutral";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
  return body as T;
}

export function GenerationStatusPanel({ appId, canManage }: { appId: string; canManage: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<GenerationJob | null | undefined>(undefined); // undefined = not loaded yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatusRef = useRef<JobStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ job: GenerationJob | null }>(`/api/apps/${appId}/generation-jobs`);
      setJob(data.job);
      // The rest of this page (Overview card, "Open preview" link) is
      // server-rendered from data fetched when the page first loaded — it
      // has no way to know generation finished on its own. Refresh the
      // server component tree once, exactly on the transition into a
      // terminal status, so those always reflect the real persisted result
      // without the user needing to manually reload.
      const newStatus = data.job?.status ?? null;
      if (newStatus && TERMINAL.has(newStatus) && lastStatusRef.current !== newStatus) {
        router.refresh();
      }
      lastStatusRef.current = newStatus;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load generation status.");
    }
  }, [appId, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (job && !TERMINAL.has(job.status)) {
      pollRef.current = setInterval(load, POLL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job, load]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/generation-jobs`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/generation-jobs/${job.id}/cancel`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel generation.");
    } finally {
      setBusy(false);
    }
  };

  const submitClarification = async (round: ClarificationRound) => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        roundNumber: round.roundNumber,
        answers: round.questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })),
      };
      await fetchJson(`/api/apps/${appId}/generation-jobs/${job.id}/clarification`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setAnswers({});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answers.");
    } finally {
      setBusy(false);
    }
  };

  if (job === undefined) return null; // still loading — avoid a flash of "no job" state

  const rounds = job?.clarificationState?.rounds ?? [];
  let openRound: ClarificationRound | null = null;
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    if (rounds[i].answers.length < rounds[i].questions.length) {
      openRound = rounds[i];
      break;
    }
  }

  return (
    <Card title="AI generation">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {!job ? (
        <>
          <p className="ui-hint">Generation has not started for this app yet.</p>
          {canManage ? (
            <Button type="button" onClick={start} disabled={busy}>
              Start generation
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <Badge tone={statusTone(job.status)}>{STATUS_LABEL[job.status]}</Badge>
            {job.cancelRequestedAt && !TERMINAL.has(job.status) ? <span className="ui-hint">Cancellation requested…</span> : null}
          </div>

          {job.status === "needs_clarification" && openRound ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              <p>A few more details will help generate a better application:</p>
              {openRound.questions.map((q) => (
                <label key={q.id} style={{ display: "grid", gap: "var(--space-1)" }}>
                  <span>{q.question}</span>
                  {q.reason ? <span className="ui-hint">{q.reason}</span> : null}
                  <textarea
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    rows={2}
                    disabled={!canManage || busy}
                    style={{ width: "100%" }}
                  />
                </label>
              ))}
              {canManage ? (
                <Button
                  type="button"
                  onClick={() => submitClarification(openRound)}
                  disabled={busy || openRound.questions.some((q) => !(answers[q.id] ?? "").trim())}
                >
                  Submit answers
                </Button>
              ) : (
                <p className="ui-hint">Only an owner or editor can answer these questions.</p>
              )}
            </div>
          ) : null}

          {job.status === "failed" && job.failureMessage ? <Alert tone="error">{job.failureMessage}</Alert> : null}
          {job.status === "cancelled" ? <p className="ui-hint">Generation was cancelled.</p> : null}
          {job.status === "ready" ? (
            <p className="ui-hint">
              Generation complete{job.resultingVersionNumber ? ` — draft v${job.resultingVersionNumber}` : ""}. See the preview link
              above.
            </p>
          ) : null}

          {canManage ? (
            <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              {!TERMINAL.has(job.status) && !job.cancelRequestedAt ? (
                <Button type="button" variant="danger" onClick={cancel} disabled={busy}>
                  Cancel generation
                </Button>
              ) : null}
              {(job.status === "failed" || job.status === "cancelled") ? (
                <Button type="button" variant="secondary" onClick={start} disabled={busy}>
                  Retry generation
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
