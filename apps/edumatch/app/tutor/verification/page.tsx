"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";
import { ContextualHelpLink } from "@/components/help/ContextualHelpLink";
import MessageAttachments, { type AttachmentView } from "@/components/MessageAttachments";
import VerificationComposer, { type StoredAttachment } from "@/components/VerificationComposer";
import EmojiReactionBar, { type MessageReactions } from "@/components/EmojiReactionBar";

type ThreadRole = "ADMIN" | "TUTOR";

type Message = {
  id: string;
  senderRole: ThreadRole;
  senderName: string | null;
  body: string;
  attachments: AttachmentView[];
  reactions: MessageReactions;
  createdAt: string;
};

type VerificationState = {
  status: string;
  resolvedAt: string | null;
  messages: Message[];
};

const STATUS_STYLES: Record<string, string> = {
  VERIFIED: "bg-green-500/15 text-green-600 border-green-500/30",
  PENDING: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  NEEDS_CHANGES: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  REJECTED: "bg-red-500/15 text-red-600 border-red-500/30",
};

function fmt(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TutorVerificationPage() {
  const { t } = useTranslation();
  const { data: session, status: authStatus } = useSession();
  const [state, setState] = useState<VerificationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tutor/verification");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as VerificationState;
      setState(data);
    } catch {
      setError(t("edumatch.verification.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authStatus === "authenticated") void load();
  }, [authStatus, load]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages.length]);

  const send = useCallback(
    async (body: string, attachments: StoredAttachment[]) => {
      const res = await fetch("/api/tutor/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, attachments }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { messages: Message[] };
      setState((prev) => (prev ? { ...prev, messages: data.messages } : prev));
    },
    [],
  );

  const statusKey = state?.status ?? "PENDING";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          {t("edumatch.verification.title")}
        </h1>
        <div className="flex items-center gap-2">
          <ContextualHelpLink href="/help/tutors/getting-started" />
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              STATUS_STYLES[statusKey] ?? STATUS_STYLES.PENDING
            }`}
          >
            {t(`edumatch.verification.status.${statusKey}`)}
          </span>
        </div>
      </div>

      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.verification.intro")}
      </p>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]">
        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
              {t("edumatch.verification.loading")}
            </p>
          ) : state && state.messages.length > 0 ? (
            state.messages.map((m) => {
              const mine = m.senderRole === "TUTOR";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                      mine
                        ? "bg-[var(--color-primary)] text-white"
                        : "border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
                    }`}
                  >
                    <div
                      className={`mb-0.5 text-[10px] font-medium ${
                        mine ? "text-white/70" : "text-[var(--color-text-muted)]"
                      }`}
                    >
                      {mine
                        ? t("edumatch.verification.you")
                        : m.senderName ?? t("edumatch.verification.admin")}
                      {" · "}
                      {fmt(m.createdAt)}
                    </div>
                    {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                    <MessageAttachments attachments={m.attachments} />
                    {session?.user?.id && (
                      <EmojiReactionBar
                        messageId={m.id}
                        reactions={m.reactions ?? {}}
                        currentUserId={session.user.id}
                      />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
              {t("edumatch.verification.empty")}
            </p>
          )}
          <div ref={threadEndRef} />
        </div>

        <div className="border-t border-[var(--color-border)] p-3">
          {error && (
            <p className="mb-2 text-xs text-red-500" role="alert">
              {error}
            </p>
          )}
          <VerificationComposer
            onSend={send}
            placeholder={t("edumatch.verification.placeholder")}
            sendLabel={t("edumatch.verification.send")}
          />
        </div>
      </div>
    </div>
  );
}
