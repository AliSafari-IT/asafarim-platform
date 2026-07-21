"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Input, Label } from "@asafarim/ui";
import {
  ACCEPT_ATTR,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  fileKind,
  formatBytes,
  isAllowedFile,
} from "./constants";
import type { InboxMessage } from "./types";

const KIND_ICON: Record<ReturnType<typeof fileKind>, string> = {
  image: "🖼️",
  pdf: "📕",
  doc: "📘",
  sheet: "📗",
  slides: "📙",
  text: "📝",
  file: "📎",
};

function statusTone(status: string): "neutral" | "info" | "success" | "warning" {
  if (status === "archived") return "neutral";
  if (status === "read") return "info";
  return "success";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renders untrusted HTML inside a script-disabled sandboxed iframe. */
function HtmlFrame({ html, minHeight = 220 }: { html: string; minHeight?: number }) {
  const doc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>html,body{margin:0}body{font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;background:#fff;padding:16px}` +
      `img,video{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #e4e4e7;padding:4px 8px}` +
      `a{color:#2563eb}pre{white-space:pre-wrap;word-break:break-word}</style></head><body>${html}</body></html>`,
    [html],
  );
  return (
    <iframe
      // sandbox="" disables scripts, forms, popups and same-origin access, so
      // pasted HTML can never execute — it only renders.
      sandbox=""
      srcDoc={doc}
      title="Message content"
      style={{
        width: "100%",
        minHeight,
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-md)",
        background: "#fff",
      }}
    />
  );
}

interface SelectedFile {
  id: string;
  file: File;
}

let fileCounter = 0;

export function ContactWorkspace({
  initialMessages,
  userName,
  userEmail,
}: {
  initialMessages: InboxMessage[];
  userName: string;
  userEmail: string;
}) {
  const [messages, setMessages] = useState<InboxMessage[]>(initialMessages);
  const [showArchived, setShowArchived] = useState(false);
  const [pane, setPane] = useState<{ mode: "compose" } | { mode: "detail"; id: string }>({
    mode: "compose",
  });

  // Composer state
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [preview, setPreview] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const overLimit = totalBytes > MAX_TOTAL_BYTES;
  const tooMany = files.length > MAX_FILES;
  const pct = Math.min(100, (totalBytes / MAX_TOTAL_BYTES) * 100);

  const visibleMessages = useMemo(
    () =>
      messages.filter((m) => (showArchived ? m.status === "archived" : m.status !== "archived")),
    [messages, showArchived],
  );
  const archivedCount = messages.filter((m) => m.status === "archived").length;

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(null);
    const list = Array.from(incoming);
    const rejected = list.filter((f) => !isAllowedFile(f.name));
    const accepted = list.filter((f) => isAllowedFile(f.name));
    if (rejected.length) {
      setError(`Unsupported file type: ${rejected.map((f) => f.name).join(", ")}`);
    }
    setFiles((prev) => [
      ...prev,
      ...accepted.map((file) => ({ id: `f${++fileCounter}`, file })),
    ]);
  }, []);

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function resetComposer() {
    setSubject("");
    setBodyHtml("");
    setFiles([]);
    setPreview(false);
    setError(null);
  }

  async function submit() {
    if (!bodyHtml.trim()) {
      setError("Please add some message content.");
      return;
    }
    if (overLimit) {
      setError("Attachments exceed the 50 MB total limit.");
      return;
    }
    if (tooMany) {
      setError(`Too many files (max ${MAX_FILES}).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("bodyHtml", bodyHtml);
      for (const { file } of files) fd.append("files", file, file.name);
      const res = await fetch("/api/contact", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { message?: InboxMessage; error?: string }
        | null;
      if (!res.ok || !data?.message) {
        setError(data?.error ?? "Could not send the message.");
        return;
      }
      setMessages((prev) => [data.message!, ...prev]);
      resetComposer();
      setPane({ mode: "detail", id: data.message.id });
    } catch {
      setError("Could not send the message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this message and its attachments? This cannot be undone.")) return;
    const res = await fetch(`/api/contact/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setPane({ mode: "compose" });
    }
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/contact/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    }
  }

  const selected =
    pane.mode === "detail" ? messages.find((m) => m.id === pane.id) ?? null : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          marginBottom: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ color: "var(--muted)", fontSize: "var(--text-sm)" }}>
          Signed in as <strong style={{ color: "var(--ink)" }}>{userName}</strong> · your messages
          are saved here and emailed to me.
        </div>
        <Button
          onClick={() => {
            resetComposer();
            setPane({ mode: "compose" });
          }}
        >
          ✎ New message
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(15rem, 20rem) 1fr",
          gap: "var(--space-4)",
          alignItems: "start",
        }}
        className="contact-inbox-grid"
      >
        {/* Inbox list */}
        <aside
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "var(--space-1)",
              padding: "var(--space-2)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <TabButton active={!showArchived} onClick={() => setShowArchived(false)}>
              Inbox ({messages.length - archivedCount})
            </TabButton>
            <TabButton active={showArchived} onClick={() => setShowArchived(true)}>
              Archived ({archivedCount})
            </TabButton>
          </div>

          {visibleMessages.length === 0 ? (
            <p style={{ padding: "var(--space-4)", color: "var(--muted)", fontSize: "var(--text-sm)" }}>
              {showArchived ? "Nothing archived." : "No messages yet — compose one on the right."}
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: "34rem", overflowY: "auto" }}>
              {visibleMessages.map((m) => {
                const active = selected?.id === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setPane({ mode: "detail", id: m.id })}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "var(--space-3)",
                        border: "none",
                        borderBottom: "1px solid var(--line)",
                        borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                        background: active ? "var(--surface-2)" : "transparent",
                        cursor: "pointer",
                        color: "var(--ink)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "var(--space-2)",
                          alignItems: "baseline",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                          {m.subject || "(no subject)"}
                        </span>
                        <span style={{ color: "var(--muted)", fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
                          {formatDate(m.createdAt)}
                        </span>
                      </div>
                      <div
                        style={{
                          color: "var(--muted)",
                          fontSize: "var(--text-xs)",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.bodyText?.slice(0, 90) || "—"}
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: 6, alignItems: "center" }}>
                        <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                        {m.attachments.length > 0 && (
                          <span style={{ color: "var(--muted)", fontSize: "var(--text-xs)" }}>
                            📎 {m.attachments.length}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Right pane: compose or detail */}
        <section
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            background: "var(--surface)",
            padding: "var(--space-5)",
            minHeight: "20rem",
          }}
        >
          {pane.mode === "detail" && selected ? (
            <MessageDetail
              message={selected}
              onDelete={() => remove(selected.id)}
              onArchive={() =>
                setStatus(selected.id, selected.status === "archived" ? "read" : "archived")
              }
            />
          ) : (
            <div>
              <h2 style={{ marginTop: 0, marginBottom: "var(--space-4)" }}>New message</h2>
              {error && <Alert tone="error">{error}</Alert>}

              <div style={{ marginBottom: "var(--space-3)" }}>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What's this about?"
                  maxLength={200}
                />
              </div>

              <div style={{ marginBottom: "var(--space-2)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  <Label htmlFor="bodyHtml">Message — paste rich HTML content</Label>
                  <button
                    type="button"
                    onClick={() => setPreview((p) => !p)}
                    style={{
                      background: "none",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--muted)",
                      padding: "2px 10px",
                      fontSize: "var(--text-xs)",
                      cursor: "pointer",
                    }}
                  >
                    {preview ? "Edit" : "Preview"}
                  </button>
                </div>
                {preview ? (
                  <HtmlFrame html={bodyHtml || "<p style='color:#999'>Nothing to preview yet.</p>"} />
                ) : (
                  <textarea
                    id="bodyHtml"
                    className="ui-input"
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    rows={10}
                    placeholder="Type text, or paste HTML — headings, lists, tables, links and images all render in the preview."
                    style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}
                  />
                )}
              </div>

              {/* Attachments */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
                }}
                style={{
                  border: `1.5px dashed ${dragging ? "var(--accent)" : "var(--line-strong)"}`,
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3)",
                  marginBottom: "var(--space-3)",
                  background: dragging ? "var(--accent-soft)" : "transparent",
                  transition: "background var(--dur-1), border-color var(--dur-1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--muted)" }}>
                    Drag &amp; drop or{" "}
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent)",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                        font: "inherit",
                      }}
                    >
                      browse
                    </button>{" "}
                    — PDF, Word, Excel, Markdown, images… up to 50 MB total.
                  </span>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTR}
                    onChange={(e) => {
                      if (e.target.files?.length) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </div>

                {files.length > 0 && (
                  <ul style={{ listStyle: "none", margin: "var(--space-3) 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                    {files.map(({ id, file }) => (
                      <li
                        key={id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                          padding: "6px 8px",
                          background: "var(--surface-2)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "var(--text-sm)",
                        }}
                      >
                        <span aria-hidden>{KIND_ICON[fileKind(file.name)]}</span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.name}
                        </span>
                        <span style={{ color: "var(--muted)", fontSize: "var(--text-xs)" }}>
                          {formatBytes(file.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(id)}
                          aria-label={`Remove ${file.name}`}
                          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1rem" }}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Size meter */}
                <div style={{ marginTop: "var(--space-3)" }}>
                  <div style={{ height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: overLimit ? "#ef4444" : "var(--accent)",
                        transition: "width var(--dur-1)",
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 4, fontSize: "var(--text-xs)", color: overLimit ? "#ef4444" : "var(--muted)" }}>
                    {formatBytes(totalBytes)} / 50 MB{files.length ? ` · ${files.length} file${files.length > 1 ? "s" : ""}` : ""}
                    {overLimit ? " — over the limit" : ""}
                  </div>
                </div>
              </div>

              <Button type="button" onClick={submit} disabled={submitting || overLimit || tooMany}>
                {submitting ? "Sending…" : "Send message"}
              </Button>
            </div>
          )}
        </section>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .contact-inbox-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 8px",
        border: "none",
        borderRadius: "var(--radius-sm)",
        background: active ? "var(--surface-2)" : "transparent",
        color: active ? "var(--ink)" : "var(--muted)",
        fontWeight: active ? 600 : 400,
        fontSize: "var(--text-xs)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function MessageDetail({
  message,
  onDelete,
  onArchive,
}: {
  message: InboxMessage;
  onDelete: () => void;
  onArchive: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{message.subject || "(no subject)"}</h2>
          <div style={{ color: "var(--muted)", fontSize: "var(--text-sm)", marginTop: 4 }}>
            {formatDate(message.createdAt)} ·{" "}
            {message.emailSent ? "Emailed to recipient" : "Saved (email pending)"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <Badge tone={statusTone(message.status)}>{message.status}</Badge>
          <button type="button" onClick={onArchive} style={detailBtn}>
            {message.status === "archived" ? "Unarchive" : "Archive"}
          </button>
          <button type="button" onClick={onDelete} style={{ ...detailBtn, color: "#ef4444", borderColor: "#ef444455" }}>
            Delete
          </button>
        </div>
      </div>

      <div style={{ margin: "var(--space-4) 0" }}>
        <HtmlFrame html={message.bodyHtml} minHeight={260} />
      </div>

      {message.attachments.length > 0 && (
        <div>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
            Attachments ({message.attachments.length})
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {message.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/contact/attachments/${a.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "8px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-2)",
                    color: "var(--ink)",
                    textDecoration: "none",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  <span aria-hidden>{KIND_ICON[fileKind(a.fileName)]}</span>
                  <span>{a.fileName}</span>
                  <span style={{ color: "var(--muted)", fontSize: "var(--text-xs)" }}>
                    {formatBytes(a.sizeBytes)} ↓
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const detailBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  color: "var(--muted)",
  padding: "4px 12px",
  fontSize: "var(--text-xs)",
  cursor: "pointer",
};
