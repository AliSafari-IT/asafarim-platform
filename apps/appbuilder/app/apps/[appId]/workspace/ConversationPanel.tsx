"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, ConfirmDialog } from "@asafarim/ui";
import { SafeMarkdown } from "./SafeMarkdown";
import { AttachmentComposer } from "./AttachmentComposer";
import { MessageAttachments } from "./MessageAttachments";
import { clearSentAttachments, getDraft, readyAttachmentIds, syncServerAttachments } from "./attachmentDraft";
import styles from "./ConversationPanel.module.css";
import {
  fetchJson,
  TERMINAL_JOB_STATUSES,
  type AttachmentPolicy,
  type ConversationMessage,
  type ModificationJob,
  type ModificationJobStatus,
  type SafeAttachment,
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

/** Friendly, in-progress phrasing for each non-terminal job status — shown in the busy banner while a modification job runs. */
const BUSY_STATUS_LABEL: Partial<Record<ModificationJobStatus, string>> = {
  queued: "Queued — starting shortly…",
  interpreting: "Reading your request…",
  proposing: "Drafting a proposal…",
  applying: "Applying the change…",
  validating: "Validating the result…",
  preparing_preview: "Building the preview…",
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
  const [attachments, setAttachments] = useState<SafeAttachment[]>([]);
  const [policy, setPolicy] = useState<AttachmentPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchJson<{
        conversation: unknown;
        messages: ConversationMessage[];
        attachments: SafeAttachment[];
        attachmentPolicy: AttachmentPolicy;
      }>(`/api/apps/${appId}/conversation`);
      setMessages(data.messages);
      setAttachments(data.attachments ?? []);
      setPolicy(data.attachmentPolicy ?? null);
      // Server state is authoritative for the composer too: uploads that
      // finished but were never sent come back after a reload, and chips the
      // server has since claimed or dropped stop lingering here.
      syncServerAttachments(appId, data.attachments ?? []);
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
    const content = getDraft(appId).text.trim();
    const attachmentIds = readyAttachmentIds(appId);
    // The M13 composer contract: text OR at least one ready attachment.
    if (!content && attachmentIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ message: ConversationMessage; job: ModificationJob; attachments: SafeAttachment[] }>(
        `/api/apps/${appId}/conversation/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content,
            baseVersionNumber: currentVersionNumber,
            selectionContext: selection,
            attachmentIds,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      // Only the attachments the server actually claimed leave the composer.
      // If the claim had failed, the message would not exist either (one
      // transaction), and the chips stay put for another attempt.
      clearSentAttachments(appId, (data.attachments ?? []).map((a) => a.id));
      onClearSelection();
      lastStatusRef.current = null;
      setJob(data.job);
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
      // A send can fail AFTER the attachments were claimed (the message and
      // its claim commit before the job is enqueued). Re-reading the server's
      // list is what stops those chips lingering in a state every retry would
      // reject as already claimed.
      await loadMessages();
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

  /** Claimed attachments grouped by the message that owns them — unclaimed ones belong to the composer, not to history. */
  const attachmentsByMessage = useMemo(() => {
    const grouped = new Map<string, SafeAttachment[]>();
    for (const attachment of attachments) {
      if (!attachment.messageId) continue;
      const existing = grouped.get(attachment.messageId);
      if (existing) existing.push(attachment);
      else grouped.set(attachment.messageId, [attachment]);
    }
    return grouped;
  }, [attachments]);

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
              <MessageAttachments appId={appId} attachments={attachmentsByMessage.get(message.id) ?? []} />
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
        <div className={styles.busyBanner} style={{ marginTop: "var(--space-2)" }} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.busyText}>
            <span className={styles.busyLabel}>
              {BUSY_STATUS_LABEL[job.status] ?? "Working…"}
            </span>
            <span className={styles.busyHint}>This can take up to a minute — feel free to wait.</span>
          </span>
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
        <AttachmentComposer
          appId={appId}
          policy={policy}
          disabled={busy || isJobActive}
          sending={busy}
          onSend={send}
        />
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
