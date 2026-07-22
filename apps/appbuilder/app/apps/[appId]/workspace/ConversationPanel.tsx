"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, ConfirmDialog, Textarea } from "@asafarim/ui";
import { SafeMarkdown } from "./SafeMarkdown";
import {
  fetchJson,
  TERMINAL_JOB_STATUSES,
  type ConversationMessage,
  type ModificationJob,
  type SelectionContext,
  type SpecificationDiff,
} from "./types";

const POLL_MS = 3_000;

const MESSAGE_TYPE_LABEL: Record<ConversationMessage["messageType"], string> = {
  user_request: "You",
  ai_proposal: "Proposal",
  system_status: "Status",
  validation_result: "Validation",
  applied_change: "Applied",
  failure: "Failed",
};

function messageTone(type: ConversationMessage["messageType"]): "success" | "warning" | "info" | "neutral" {
  if (type === "applied_change") return "success";
  if (type === "failure" || type === "validation_result") return "warning";
  if (type === "ai_proposal") return "info";
  return "neutral";
}

function DiffSummaryView({ diff }: { diff: SpecificationDiff }) {
  if (!diff.entries || diff.entries.length === 0) {
    return <p className="ui-hint">No structural changes.</p>;
  }
  return (
    <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "var(--space-4)", fontSize: "var(--text-xs)" }}>
      {diff.entries.slice(0, 30).map((entry, index) => (
        <li key={index}>
          <Badge tone={entry.kind === "added" ? "success" : entry.kind === "removed" ? "warning" : "info"}>{entry.kind}</Badge>{" "}
          {entry.path.join(".")}
        </li>
      ))}
      {diff.entries.length > 30 ? <li className="ui-hint">…and {diff.entries.length - 30} more</li> : null}
    </ul>
  );
}

export interface ConversationPanelProps {
  appId: string;
  canRequestModification: boolean;
  canConfirmModification: boolean;
  canCancelModification: boolean;
  currentVersionNumber: number;
  selection: SelectionContext | null;
  onClearSelection: () => void;
  onVersionApplied: (versionNumber: number) => void;
}

export function ConversationPanel({
  appId,
  canRequestModification,
  canConfirmModification,
  canCancelModification,
  currentVersionNumber,
  selection,
  onClearSelection,
  onVersionApplied,
}: ConversationPanelProps) {
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  const [job, setJob] = useState<ModificationJob | null | undefined>(undefined);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchJson<{ conversation: unknown; messages: ConversationMessage[] }>(`/api/apps/${appId}/conversation`);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation.");
    }
  }, [appId]);

  const loadJob = useCallback(async () => {
    try {
      const data = await fetchJson<{ job: ModificationJob | null }>(`/api/apps/${appId}/modification-jobs`);
      setJob(data.job);
      const status = data.job?.status ?? null;
      if (status && TERMINAL_JOB_STATUSES.has(data.job!.status) && lastStatusRef.current !== status) {
        await loadMessages();
        if (status === "ready" && data.job?.resultingVersionNumber) {
          onVersionApplied(data.job.resultingVersionNumber);
        }
      } else if (status !== lastStatusRef.current) {
        await loadMessages();
      }
      lastStatusRef.current = status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load change status.");
    }
  }, [appId, loadMessages, onVersionApplied]);

  useEffect(() => {
    loadMessages();
    loadJob();
    // Reconnects to any active job on mount — persisted state (this fetch)
    // is authoritative, never trusting in-memory state from before a
    // refresh/navigate-away/device-switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (job && !TERMINAL_JOB_STATUSES.has(job.status)) {
      pollRef.current = setInterval(loadJob, POLL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job, loadJob]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ message: ConversationMessage; job: ModificationJob }>(`/api/apps/${appId}/conversation/messages`, {
        method: "POST",
        body: JSON.stringify({
          content,
          baseVersionNumber: currentVersionNumber,
          selectionContext: selection,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setInput("");
      onClearSelection();
      lastStatusRef.current = null;
      setJob(data.job);
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/modification-jobs/${job.id}/cancel`, { method: "POST" });
      await loadJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!job?.confirmationChecksum) return;
    setConfirming(true);
    setError(null);
    try {
      await fetchJson(`/api/apps/${appId}/modification-jobs/${job.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ checksum: job.confirmationChecksum }),
      });
      lastStatusRef.current = null;
      await loadJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm.");
    } finally {
      setConfirming(false);
    }
  };

  const pendingMessage = job?.status === "awaiting_confirmation" ? messages?.find((m) => m.modificationJobId === job.id) : undefined;
  const isJobActive = job !== undefined && job !== null && !TERMINAL_JOB_STATUSES.has(job.status);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {messages === null ? (
          <p className="ui-hint">Loading conversation…</p>
        ) : messages.length === 0 ? (
          <p className="ui-hint">No messages yet. Describe a change you'd like to make.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} style={{ display: "grid", gap: "var(--space-1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Badge tone={messageTone(message.messageType)}>{MESSAGE_TYPE_LABEL[message.messageType]}</Badge>
                <span className="ui-hint" style={{ fontSize: "var(--text-xs)" }}>
                  {new Date(message.createdAt).toLocaleString()}
                </span>
              </div>
              <SafeMarkdown content={message.content} />
              {message.diffSummary ? <DiffSummaryView diff={message.diffSummary} /> : null}
              {message.resultingVersionNumber ? (
                <p className="ui-hint">Version v{message.resultingVersionNumber}</p>
              ) : null}
            </div>
          ))
        )}
        <div ref={listEndRef} />
      </div>

      {isJobActive && job?.status !== "awaiting_confirmation" ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <Badge tone="info">{job?.phase ?? job?.status}</Badge>
          {canCancelModification ? (
            <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}

      {selection ? (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginTop: "var(--space-2)" }}>
          Context: {selection.label ?? selection.componentId ?? selection.pageId}{" "}
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClearSelection}>
            Clear
          </button>
        </div>
      ) : null}

      {canRequestModification ? (
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe a change, e.g. “Add a priority field to tasks.”"
            rows={2}
            disabled={busy || isJobActive}
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button type="button" onClick={send} disabled={busy || isJobActive || !input.trim()}>
            Send
          </Button>
        </div>
      ) : (
        <p className="ui-hint" style={{ marginTop: "var(--space-2)" }}>
          Viewing only — you don&apos;t have permission to request changes.
        </p>
      )}

      <ConfirmDialog
        open={job?.status === "awaiting_confirmation"}
        title="Confirm destructive change"
        tone="danger"
        confirmLabel="Apply change"
        confirmDisabled={confirming || !canConfirmModification}
        onConfirm={confirm}
        onCancel={cancel}
      >
        <p>{pendingMessage?.content ?? "This change removes or narrows something that already exists."}</p>
        {pendingMessage?.diffSummary ? <DiffSummaryView diff={pendingMessage.diffSummary} /> : null}
        {!canConfirmModification ? (
          <p className="ui-hint">Only the person who requested this change can confirm it.</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
