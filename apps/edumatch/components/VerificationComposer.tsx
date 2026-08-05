"use client";

import { useRef, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { humanSize } from "./MessageAttachments";

export type StoredAttachment = {
  key: string;
  mime: string;
  filename: string;
  sizeBytes: number;
};

type Pending = {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  previewUrl?: string;
  key?: string;
  status: "uploading" | "done" | "error";
};

let counter = 0;
const nextId = () => `att-${Date.now()}-${counter++}`;

export default function VerificationComposer({
  onSend,
  placeholder,
  sendLabel,
  accent = "primary",
}: {
  onSend: (body: string, attachments: StoredAttachment[]) => Promise<void>;
  placeholder: string;
  sendLabel: string;
  accent?: "primary" | "emerald";
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploading = pending.some((p) => p.status === "uploading");
  const ready = pending.filter((p) => p.status === "done" && p.key);
  const canSend = (draft.trim().length > 0 || ready.length > 0) && !uploading && !sending;

  const sendBtnClass =
    accent === "emerald"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-[var(--color-primary)] hover:opacity-90";

  async function uploadOne(file: File) {
    const id = nextId();
    const isImage = file.type.startsWith("image/");
    setPending((prev) => [
      ...prev,
      {
        id,
        filename: file.name,
        mime: file.type,
        sizeBytes: file.size,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        status: "uploading",
      },
    ]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/verification/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { key: string };
      setPending((prev) =>
        prev.map((p) => (p.id === id ? { ...p, key: data.key, status: "done" } : p)),
      );
    } catch {
      setError(t("edumatch.verification.attach.error"));
      setPending((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "error" } : p)),
      );
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    const room = 5 - pending.length;
    if (files.length > room) setError(t("edumatch.verification.attach.tooMany"));
    files.slice(0, Math.max(0, room)).forEach((f) => void uploadOne(f));
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(
        draft.trim(),
        ready.map((p) => ({
          key: p.key!,
          mime: p.mime,
          filename: p.filename,
          sizeBytes: p.sizeBytes,
        })),
      );
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      setDraft("");
      setPending([]);
    } catch {
      setError(t("edumatch.verification.sendError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-1.5 text-xs text-red-500" role="alert">
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((p) => (
            <div
              key={p.id}
              className="relative flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
            >
              {p.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <span aria-hidden className="font-semibold">
                  FILE
                </span>
              )}
              <span className="max-w-[8rem] truncate">{p.filename}</span>
              <span className="opacity-60">{humanSize(p.sizeBytes)}</span>
              {p.status === "uploading" && <span className="animate-pulse">...</span>}
              {p.status === "error" && <span className="text-red-500">!</span>}
              <button
                type="button"
                onClick={() => removePending(p.id)}
                aria-label={t("edumatch.verification.attach.remove")}
                className="ml-0.5 text-[var(--color-text-muted)] hover:text-red-500"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={onPick}
          className="hidden"
          aria-hidden
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={t("edumatch.verification.attach.add")}
          title={t("edumatch.verification.attach.add")}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]"
        >
          <span aria-hidden className="text-xs font-semibold">
            +
          </span>
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={placeholder}
          className="flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${sendBtnClass}`}
        >
          {sending || uploading ? t("edumatch.verification.sending") : sendLabel}
        </button>
      </div>
    </div>
  );
}
