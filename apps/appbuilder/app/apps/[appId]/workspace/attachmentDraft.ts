"use client";

import { useSyncExternalStore } from "react";
import type { AttachmentPolicy, DraftAttachment, SafeAttachment } from "./types";

/**
 * M13 slice C — the composer's draft state (typed text + in-flight/ready
 * uploads) for one app, deliberately living OUTSIDE the React tree.
 *
 * WorkspaceShell renders exactly one right-hand panel at a time and
 * unmounts the others, so component state would lose the user's half-typed
 * request and abort every in-progress upload the moment they glanced at
 * History or Validation. Keeping it in a module-scoped store means panel
 * switching is a pure view change: uploads keep running in the background
 * and the draft is exactly as it was on return ("preserved draft/upload
 * state across workspace panel switches", M13 Composer).
 *
 * A full page reload legitimately does clear this — persisted server state
 * is authoritative there, and `adoptServerAttachments` re-hydrates any
 * already-uploaded-but-unsent attachments from the conversation fetch, so a
 * committed upload survives refresh even though the browser-only bits (the
 * typed text, an upload that was still mid-flight) do not.
 */

export interface DraftState {
  text: string;
  attachments: DraftAttachment[];
}

const EMPTY_STATE: DraftState = { text: "", attachments: [] };

interface AppDraft {
  state: DraftState;
  listeners: Set<() => void>;
  /** Live XHRs by local id, so remove/retry can abort an upload that is still running. */
  inFlight: Map<string, XMLHttpRequest>;
  /** The raw File for each entry, kept out of `state` so snapshots stay cheap to compare and serialize. */
  files: Map<string, File>;
}

const drafts = new Map<string, AppDraft>();

function draftFor(appId: string): AppDraft {
  let draft = drafts.get(appId);
  if (!draft) {
    draft = { state: EMPTY_STATE, listeners: new Set(), inFlight: new Map(), files: new Map() };
    drafts.set(appId, draft);
  }
  return draft;
}

function emit(appId: string) {
  for (const listener of draftFor(appId).listeners) listener();
}

function setState(appId: string, update: (previous: DraftState) => DraftState) {
  const draft = draftFor(appId);
  const next = update(draft.state);
  if (next === draft.state) return;
  draft.state = next;
  emit(appId);
}

function patchAttachment(appId: string, localId: string, patch: Partial<DraftAttachment>) {
  setState(appId, (previous) => {
    const index = previous.attachments.findIndex((a) => a.localId === localId);
    // A removed entry must never be resurrected by a late upload callback.
    if (index === -1) return previous;
    const attachments = [...previous.attachments];
    attachments[index] = { ...attachments[index], ...patch };
    return { ...previous, attachments };
  });
}

function find(appId: string, localId: string): DraftAttachment | undefined {
  return draftFor(appId).state.attachments.find((a) => a.localId === localId);
}

// ─── Validation (pure — the client half of the server-owned catalogue) ───

export interface ValidationFailure {
  code: "unsupported_type" | "too_large" | "empty_file" | "too_many" | "filename_too_long";
  message: string;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes} bytes`;
}

/**
 * The browser's `File.type` is a guess from the extension and is empty for
 * plenty of real files. It is only ever a HINT here: the server re-derives
 * the real type from the bytes at commit (lib/attachments/sniff.ts) and
 * rejects a mismatch, so this exists to pick a sane declared type and give
 * a fast, specific error — never to decide what the file actually is.
 */
export function declaredTypeFor(file: Pick<File, "name" | "type">, policy: AttachmentPolicy): string {
  if (file.type && policy.types.some((t) => t.mimeType === file.type)) return file.type;
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const byExtension: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    csv: "text/csv",
  };
  return byExtension[extension] ?? file.type ?? "";
}

/**
 * Fails fast on what the server would reject anyway, with a message naming
 * the actual limit. Every rule here is re-checked server-side — this is a
 * courtesy layer, never the enforcement point.
 */
export function validateCandidate(
  file: Pick<File, "name" | "size" | "type">,
  declaredMimeType: string,
  policy: AttachmentPolicy,
  currentCount: number,
): ValidationFailure | null {
  if (currentCount >= policy.maxAttachmentsPerMessage) {
    return { code: "too_many", message: `You can attach up to ${policy.maxAttachmentsPerMessage} files to one message.` };
  }
  if (file.name.length > policy.maxFilenameLength) {
    return { code: "filename_too_long", message: `File names must be ${policy.maxFilenameLength} characters or fewer.` };
  }
  const entry = policy.types.find((t) => t.mimeType === declaredMimeType);
  if (!entry) {
    const kinds = [...new Set(policy.types.map((t) => t.mimeType.split("/")[1].toUpperCase()))].join(", ");
    return { code: "unsupported_type", message: `“${file.name}” isn’t a supported file type. Accepted: ${kinds}.` };
  }
  if (file.size <= 0) {
    return { code: "empty_file", message: `“${file.name}” is empty.` };
  }
  if (file.size > entry.maxBytes) {
    return {
      code: "too_large",
      message: `“${file.name}” is ${formatBytes(file.size)} — the limit for this file type is ${formatBytes(entry.maxBytes)}.`,
    };
  }
  return null;
}

/** The `accept` attribute for the file picker, derived from the server catalogue rather than a hardcoded client list. */
export function acceptAttribute(policy: AttachmentPolicy): string {
  return policy.types.map((t) => t.mimeType).join(",");
}

// ─── Upload lifecycle ───────────────────────────────────────────────────

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `draft-${Date.now().toString(36)}-${localIdCounter}`;
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

async function initAttachment(appId: string, file: File, declaredMimeType: string, idempotencyKey: string): Promise<SafeAttachment> {
  const res = await fetch(`/api/apps/${appId}/conversation/attachments/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalFilename: file.name,
      declaredMimeType,
      declaredSizeBytes: file.size,
      idempotencyKey,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new UploadError(body?.error ?? `Upload failed (${res.status})`, body?.code, res.status);
  return body.attachment as SafeAttachment;
}

/** Reads back a single attachment's server-side truth — used to reconcile after an ambiguous failure. */
async function fetchAttachment(appId: string, attachmentId: string): Promise<SafeAttachment | null> {
  if (!attachmentId) return null;
  const res = await fetch(`/api/apps/${appId}/conversation/attachments/${attachmentId}`);
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return (body.attachment as SafeAttachment) ?? null;
}

class UploadError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * `fetch` cannot report upload progress, so the byte-commit step uses XHR.
 * The returned abort handle is what makes "remove" cancel a real in-flight
 * request instead of leaving it to finish invisibly.
 */
function putContent(
  appId: string,
  attachmentId: string,
  file: File,
  onProgress: (fraction: number) => void,
  registerXhr: (xhr: XMLHttpRequest) => void,
): Promise<SafeAttachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registerXhr(xhr);
    xhr.open("PUT", `/api/apps/${appId}/conversation/attachments/${attachmentId}/content`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener("load", () => {
      let body: { attachment?: SafeAttachment; error?: string; code?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Fall through to the status-based message below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.attachment) resolve(body.attachment);
      else reject(new UploadError(body.error ?? `Upload failed (${xhr.status})`, body.code, xhr.status));
    });
    xhr.addEventListener("error", () => reject(new UploadError("Upload failed — check your connection and try again.")));
    xhr.addEventListener("abort", () => reject(new UploadError("Upload cancelled.", "aborted")));
    xhr.send(file);
  });
}

/**
 * Whether a failed upload is worth offering a Retry button for. A rejected
 * FILE (wrong type, too large, content that doesn't match its extension,
 * flagged by scanning) will fail identically forever — offering retry there
 * is a lie. Transport, server, and quota failures are genuinely transient.
 */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof UploadError)) return true;
  const permanent = new Set(["invalid_file", "attachment_mismatch", "attachment_scan_failed", "aborted"]);
  if (error.code && permanent.has(error.code)) return false;
  if (error.status === 400 || error.status === 403 || error.status === 413) return false;
  return true;
}

async function runUpload(appId: string, localId: string) {
  const draft = draftFor(appId);
  const file = draft.files.get(localId);
  const entry = find(appId, localId);
  if (!file || !entry) return;

  patchAttachment(appId, localId, { status: "uploading", progress: 0, error: null, errorCode: null });

  try {
    // The idempotency key is minted ONCE per entry and reused across
    // retries, so a retry after a response we never saw resolves to the
    // same attachment row rather than orphaning the first one.
    const initiated = entry.attachmentId
      ? { id: entry.attachmentId }
      : await initAttachment(appId, file, entry.declaredMimeType, entry.idempotencyKey);
    if (!find(appId, localId)) return; // Removed while the init was in flight.
    patchAttachment(appId, localId, { attachmentId: initiated.id });

    const committed = await putContent(
      appId,
      initiated.id,
      file,
      (fraction) => patchAttachment(appId, localId, { progress: fraction }),
      (xhr) => draft.inFlight.set(localId, xhr),
    );
    draft.inFlight.delete(localId);
    if (!find(appId, localId)) return;

    if (committed.status === "ready") {
      patchAttachment(appId, localId, { status: "ready", progress: 1, serverStatus: committed.status });
    } else {
      // `quarantined` (flagged by scanning) and any other non-ready terminal
      // status are shown as a permanent failure with the server's own safe
      // message — never a generic "try again".
      patchAttachment(appId, localId, {
        status: "failed",
        progress: 1,
        serverStatus: committed.status,
        error: committed.failureMessage ?? "This file can’t be used.",
        errorCode: committed.failureCode ?? "unusable",
        retryable: false,
      });
    }
  } catch (error) {
    draft.inFlight.delete(localId);
    if (!find(appId, localId)) return;
    if (error instanceof UploadError && error.code === "aborted") return;

    // A 409 on the byte-commit means the server already has these bytes:
    // the first attempt DID land and only its response was lost. Retrying
    // can never succeed, so ask the server what actually happened rather
    // than showing a failure for an attachment that is sitting there ready.
    if (error instanceof UploadError && error.status === 409) {
      const reconciled = await fetchAttachment(appId, entry.attachmentId ?? "").catch(() => null);
      if (!find(appId, localId)) return;
      if (reconciled?.status === "ready") {
        patchAttachment(appId, localId, { status: "ready", progress: 1, serverStatus: reconciled.status, error: null, errorCode: null });
        return;
      }
      patchAttachment(appId, localId, {
        status: "failed",
        serverStatus: reconciled?.status ?? null,
        error: reconciled?.failureMessage ?? error.message,
        errorCode: reconciled?.failureCode ?? error.code ?? null,
        retryable: false,
      });
      return;
    }

    patchAttachment(appId, localId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Upload failed.",
      errorCode: error instanceof UploadError ? (error.code ?? null) : null,
      retryable: isRetryable(error),
    });
  }
}

// ─── Public store operations ────────────────────────────────────────────

export function subscribe(appId: string, listener: () => void): () => void {
  const draft = draftFor(appId);
  draft.listeners.add(listener);
  return () => draft.listeners.delete(listener);
}

export function getDraft(appId: string): DraftState {
  return draftFor(appId).state;
}

export function setDraftText(appId: string, text: string) {
  setState(appId, (previous) => (previous.text === text ? previous : { ...previous, text }));
}

/**
 * Queues files from the picker, a paste, or a drop. Returns the messages
 * for anything rejected outright so the composer can surface them — a
 * rejected file never becomes a chip, because there is nothing to retry or
 * remove about a file that was never accepted.
 */
export function addFiles(appId: string, files: readonly File[], policy: AttachmentPolicy): string[] {
  const rejected: string[] = [];
  const draft = draftFor(appId);

  for (const file of files) {
    const declaredMimeType = declaredTypeFor(file, policy);
    const failure = validateCandidate(file, declaredMimeType, policy, draft.state.attachments.length);
    if (failure) {
      rejected.push(failure.message);
      continue;
    }
    const localId = nextLocalId();
    draft.files.set(localId, file);
    const entry: DraftAttachment = {
      localId,
      attachmentId: null,
      filename: file.name,
      sizeBytes: file.size,
      declaredMimeType,
      status: "uploading",
      serverStatus: null,
      progress: 0,
      // A local object URL means the image thumbnail appears instantly,
      // before a single byte has been uploaded. Revoked in `discardEntry`.
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      error: null,
      errorCode: null,
      retryable: false,
      idempotencyKey: newIdempotencyKey(),
    };
    setState(appId, (previous) => ({ ...previous, attachments: [...previous.attachments, entry] }));
    void runUpload(appId, localId);
  }

  return rejected;
}

export function retryUpload(appId: string, localId: string) {
  const entry = find(appId, localId);
  if (!entry || entry.status !== "failed" || !entry.retryable) return;
  void runUpload(appId, localId);
}

function discardEntry(appId: string, localId: string) {
  const draft = draftFor(appId);
  const entry = find(appId, localId);
  draft.inFlight.get(localId)?.abort();
  draft.inFlight.delete(localId);
  draft.files.delete(localId);
  if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  setState(appId, (previous) => ({ ...previous, attachments: previous.attachments.filter((a) => a.localId !== localId) }));
}

/**
 * Removes an attachment from the draft: aborts any in-flight upload and
 * soft-deletes the server row if one was already created, so a removed file
 * does not sit in storage counting against the app's quota until the 24h
 * unclaimed sweep gets to it. The chip disappears immediately either way —
 * a failed DELETE (offline, already swept) still leaves the retention sweep
 * as the backstop, so it is not worth blocking the UI on.
 */
export function removeAttachment(appId: string, localId: string) {
  const entry = find(appId, localId);
  const attachmentId = entry?.attachmentId;
  discardEntry(appId, localId);
  if (attachmentId) {
    void fetch(`/api/apps/${appId}/conversation/attachments/${attachmentId}`, { method: "DELETE" }).catch(() => undefined);
  }
}

/** The ids to send with a message — only `ready` ones; the server re-verifies each is ready, unclaimed, and owned by this actor anyway. */
export function readyAttachmentIds(appId: string): string[] {
  return draftFor(appId)
    .state.attachments.filter((a) => a.status === "ready" && a.attachmentId)
    .map((a) => a.attachmentId!);
}

/**
 * Clears the draft after a message was accepted. Only entries actually
 * claimed by that message are dropped: a file that failed, or one the user
 * added while the send was in flight, stays in the composer rather than
 * disappearing without ever having been sent.
 */
export function clearSentAttachments(appId: string, claimedIds: readonly string[]) {
  const claimed = new Set(claimedIds);
  for (const entry of [...draftFor(appId).state.attachments]) {
    if (entry.attachmentId && claimed.has(entry.attachmentId)) discardEntry(appId, entry.localId);
  }
  setDraftText(appId, "");
}

/**
 * Reconciles the composer against the server's own list of this actor's
 * attachments — the client's in-memory draft is never the authority.
 *
 * Two directions:
 *
 * 1. ADOPT uploads that completed but were never sent. Otherwise, after a
 *    reload, an attachment would be invisible in the UI while still counting
 *    against the app's storage quota until the retention sweep expires it.
 * 2. DISCARD settled entries the server no longer agrees exist as drafts —
 *    claimed by a message (a send whose response never reached us, or one
 *    made from another tab), deleted elsewhere, or swept. Without this, a
 *    chip could linger that every future send would reject as
 *    `attachment_already_claimed`, with no way out but a reload.
 *
 * An entry still uploading is never discarded: its row may legitimately not
 * be in a list that was fetched before its init landed.
 */
export function syncServerAttachments(appId: string, attachments: readonly SafeAttachment[]) {
  const draft = draftFor(appId);
  const serverById = new Map(attachments.map((a) => [a.id, a]));

  for (const entry of [...draft.state.attachments]) {
    if (!entry.attachmentId || entry.status === "uploading") continue;
    const server = serverById.get(entry.attachmentId);
    if (!server || server.messageId) discardEntry(appId, entry.localId);
  }

  const known = new Set(draft.state.attachments.map((a) => a.attachmentId).filter(Boolean));
  const adopted: DraftAttachment[] = [];

  for (const attachment of attachments) {
    if (attachment.messageId) continue; // Already sent — history, not a draft.
    if (known.has(attachment.id)) continue;
    if (attachment.status !== "ready") continue; // Nothing to resume: the bytes never landed.
    adopted.push({
      localId: nextLocalId(),
      attachmentId: attachment.id,
      filename: attachment.originalFilename,
      sizeBytes: attachment.actualSizeBytes ?? attachment.declaredSizeBytes,
      declaredMimeType: attachment.detectedMimeType ?? attachment.declaredMimeType,
      status: "ready",
      serverStatus: attachment.status,
      progress: 1,
      // No local File here, so the thumbnail comes from the authorized
      // content route instead of an object URL.
      previewUrl: null,
      error: null,
      errorCode: null,
      retryable: false,
      idempotencyKey: newIdempotencyKey(),
    });
  }

  if (adopted.length === 0) return;
  setState(appId, (previous) => ({ ...previous, attachments: [...adopted, ...previous.attachments] }));
}

// ─── React binding ──────────────────────────────────────────────────────

export function useAttachmentDraft(appId: string): DraftState {
  return useSyncExternalStore(
    (listener) => subscribe(appId, listener),
    () => getDraft(appId),
    // Server render has no draft by definition; a stable constant keeps
    // useSyncExternalStore from tearing on hydration.
    () => EMPTY_STATE,
  );
}
