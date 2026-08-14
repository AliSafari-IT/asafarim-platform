"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";
import MessageAttachments, { type AttachmentView } from "@/components/MessageAttachments";
import VerificationComposer, { type StoredAttachment } from "@/components/VerificationComposer";
import EmojiReactionBar, { type MessageReactions } from "@/components/EmojiReactionBar";

type Review = {
  id: string;
  status: string;
  checklist: Record<string, unknown> | null;
  adminNotes: string | null;
  tutorMessage: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type ThreadMessage = {
  id: string;
  senderRole: "ADMIN" | "TUTOR";
  senderName: string | null;
  body: string;
  attachments: AttachmentView[];
  reactions: MessageReactions;
  createdAt: string;
};

type TutorRow = {
  tutorId: string;
  name: string | null;
  email: string | null;
  bio: string | null;
  subjectsTaught: string[];
  verifiedAt: string | null;
  latestReview: Review | null;
  effectiveStatus: string;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-400",
  NEEDS_CHANGES: "bg-orange-500/15 text-orange-400",
  VERIFIED: "bg-green-500/15 text-green-400",
  REJECTED: "bg-red-500/15 text-red-400",
};

export default function AdminTutorVerificationsPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState<TutorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "VERIFIED">("OPEN");

  // Deep link from a "Tutor replied about verification" notification
  // (?tutor=<id> — see notifyVerificationMessage() in lib/server/notifications.ts).
  // The row it points at may not match the default OPEN filter (e.g. it was
  // already verified), which is exactly why "all rows shown, none obviously
  // the right one" happened before this fix. Captured once into state so
  // clearing the URL afterwards doesn't also drop the highlight.
  const [highlightTutorId] = useState(() => searchParams.get("tutor"));

  // Tracks whether the first successful fetch has happened, so subsequent
  // refetches (after a status change / message send) don't flip `loading`
  // back to true. A ref rather than state so `load`'s identity stays stable
  // and doesn't retrigger the mount effect below.
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async () => {
    // Only show the full-page loading skeleton on the very first fetch.
    // `load()` also runs after every status change / message send to refresh
    // the row list — flipping `loading` true there used to unmount the
    // `<div>{filtered.map(...)}</div>` list entirely (see the JSX below),
    // which wiped every TutorRowCard's local state (open conversation
    // panel, in-progress admin notes edits, etc.) right after the admin
    // took an action. That's what made "Needs changes" look like it did
    // nothing — the thread panel would flash open then immediately reset.
    if (!hasLoadedOnce.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tutor-verifications");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { tutors: TutorRow[] };
      setRows(data.tutors);
      hasLoadedOnce.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Arrived via a deep link: switch to ALL so the target row is guaranteed
  // to be visible regardless of its status, and drop the query param so a
  // manual filter change or refresh afterwards behaves normally.
  useEffect(() => {
    if (!highlightTutorId) return;
    setFilter("ALL");
    router.replace("/admin/tutor-verifications", { scroll: false });
  }, [highlightTutorId, router]);

  async function setStatus(
    tutorId: string,
    status: string,
    extra: { tutorMessage?: string; adminNotes?: string } = {},
  ) {
    setBusyId(tutorId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tutor-verifications/${tutorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = rows.filter((r) => {
    if (filter === "ALL") return true;
    if (filter === "VERIFIED") return r.effectiveStatus === "VERIFIED";
    return r.effectiveStatus !== "VERIFIED" && r.effectiveStatus !== "REJECTED";
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            {t("edumatch.admin.verifications.title")}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {t("edumatch.admin.verifications.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          {(["OPEN", "VERIFIED", "ALL"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
                filter === f
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-panel)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && highlightTutorId && !rows.some((r) => r.tutorId === highlightTutorId) && (
        <div className="mb-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400">
          {t("edumatch.admin.verifications.highlightNotFound")}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.verifications.noTutors")}</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => (
            <TutorRowCard
              key={r.tutorId}
              row={r}
              busy={busyId === r.tutorId}
              onSetStatus={setStatus}
              currentUserId={session?.user?.id ?? null}
              highlighted={r.tutorId === highlightTutorId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TutorRowCard({
  row,
  busy,
  onSetStatus,
  currentUserId,
  highlighted = false,
}: {
  row: TutorRow;
  busy: boolean;
  onSetStatus: (
    tutorId: string,
    status: string,
    extra?: { tutorMessage?: string; adminNotes?: string },
  ) => Promise<void>;
  currentUserId: string | null;
  highlighted?: boolean;
}) {
  const { t } = useTranslation();
  const [needsMsg, setNeedsMsg] = useState("");
  const [adminNotes, setAdminNotes] = useState(
    row.latestReview?.adminNotes ?? "",
  );
  const cardRef = useRef<HTMLDivElement>(null);
  // Fades after a beat rather than disappearing the instant the row scrolls
  // into place — the whole point is "this is the one you're here for".
  const [showHighlight, setShowHighlight] = useState(highlighted);

  // Verification conversation thread (lazy-loaded on expand).
  const [threadOpen, setThreadOpen] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  // Brief confirmation after "Needs changes" sends a tutorMessage — the send
  // itself has no visible feedback otherwise (see conversation with the user
  // about this: silently landing in a collapsed thread reads as "nothing
  // happened").
  const [needsMsgSent, setNeedsMsgSent] = useState(false);

  const loadThread = useCallback(async () => {
    setThreadLoading(true);
    try {
      const res = await fetch(
        `/api/admin/tutor-verifications/${row.tutorId}/messages`,
      );
      if (res.ok) {
        const data = (await res.json()) as { messages: ThreadMessage[] };
        setMessages(data.messages);
      }
    } finally {
      setThreadLoading(false);
    }
  }, [row.tutorId]);

  function toggleThread() {
    const next = !threadOpen;
    setThreadOpen(next);
    if (next && messages === null) void loadThread();
  }

  // Deep-linked from a "Tutor replied" notification: scroll to it, flash a
  // highlight, and open the conversation — that's what the notification was
  // about, so open it rather than making the admin click again to see it.
  useEffect(() => {
    if (!highlighted) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setThreadOpen(true);
    if (messages === null) void loadThread();
    const fade = setTimeout(() => setShowHighlight(false), 3000);
    return () => clearTimeout(fade);
    // Intentionally runs once on mount for the row this was rendered for —
    // `highlighted` doesn't change after the initial render (see
    // highlightTutorId in the parent, captured once from the URL).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  const sendFollowup = useCallback(
    async (body: string, attachments: StoredAttachment[]) => {
      const res = await fetch(
        `/api/admin/tutor-verifications/${row.tutorId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, attachments }),
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { messages: ThreadMessage[] };
      setMessages(data.messages);
    },
    [row.tutorId],
  );

  const badge =
    STATUS_BADGE[row.effectiveStatus] ?? "bg-[var(--color-surface)] text-[var(--color-text-muted)]";

  return (
    <div
      ref={cardRef}
      data-testid="tutor-verification-row"
      className={`rounded-lg border p-5 shadow-sm transition-colors duration-1000 ${
        showHighlight
          ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/40"
          : "border-[var(--color-border)] bg-[var(--color-panel)]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--color-text)] truncate">
              {row.name ?? row.email ?? row.tutorId}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}
            >
              {row.effectiveStatus}
            </span>
            {row.verifiedAt ? (
              <span className="text-xs text-[var(--color-text-muted)]">
                {t("edumatch.admin.verifications.verifiedDate")} {" "}
                {new Date(row.verifiedAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{row.email}</p>
          <p className="mt-2 text-sm text-[var(--color-text)] opacity-80 line-clamp-3 whitespace-pre-wrap">
            {row.bio ?? t("edumatch.admin.verifications.noBio")}
          </p>
          {row.subjectsTaught.length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              {t("edumatch.admin.verifications.subjects")}: {row.subjectsTaught.join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)]">
            {t("edumatch.admin.verifications.adminNotes")}
          </label>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
            placeholder={t("edumatch.admin.verifications.adminNotesPlaceholder")}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)]">
            {t("edumatch.admin.verifications.tutorMessage")}
          </label>
          <textarea
            value={needsMsg}
            onChange={(e) => setNeedsMsg(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
            placeholder={t("edumatch.admin.verifications.tutorMessagePlaceholder")}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          data-testid="verify-tutor"
          disabled={busy}
          onClick={() =>
            onSetStatus(row.tutorId, "VERIFIED", { adminNotes })
          }
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? t("edumatch.admin.verifications.working") : t("edumatch.admin.verifications.verify")}
        </button>
        <button
          disabled={busy || !needsMsg.trim()}
          onClick={async () => {
            const hadMessage = needsMsg.trim().length > 0;
            await onSetStatus(row.tutorId, "NEEDS_CHANGES", {
              tutorMessage: needsMsg,
              adminNotes,
            });
            setNeedsMsg("");
            if (hadMessage) {
              // The message we just sent lands in the shared conversation
              // thread (see setTutorVerificationStatus in
              // tutor-verification.ts) — open it and refresh so it's
              // immediately visible, and flash a confirmation since the
              // send itself is otherwise silent.
              setThreadOpen(true);
              void loadThread();
              setNeedsMsgSent(true);
              setTimeout(() => setNeedsMsgSent(false), 3000);
            }
          }}
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {t("edumatch.admin.verifications.needsChanges")}
        </button>
        <button
          data-testid="reject-tutor"
          disabled={busy}
          onClick={() =>
            onSetStatus(row.tutorId, "REJECTED", { adminNotes })
          }
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {t("edumatch.admin.verifications.reject")}
        </button>
      </div>

      {needsMsgSent && (
        <p className="mt-2 text-xs font-medium text-emerald-500">
          ✓ {t("edumatch.admin.verifications.messageSent")}
        </p>
      )}

      {/* Conversation thread with the tutor */}
      <div className="mt-4 border-t border-[var(--color-border)] pt-3">
        <button
          onClick={toggleThread}
          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          {threadOpen
            ? t("edumatch.admin.verifications.hideConversation")
            : t("edumatch.admin.verifications.showConversation")}
        </button>

        {threadOpen && (
          <div className="mt-3">
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              {threadLoading ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("edumatch.admin.common.loading")}
                </p>
              ) : messages && messages.length > 0 ? (
                messages.map((m) => {
                  const mine = m.senderRole === "ADMIN";
                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                          mine
                            ? "bg-emerald-600 text-white"
                            : "bg-[var(--color-panel)] text-[var(--color-text)] border border-[var(--color-border)]"
                        }`}
                      >
                        <div
                          className={`mb-0.5 text-[10px] ${
                            mine ? "text-white/70" : "text-[var(--color-text-muted)]"
                          }`}
                        >
                          {mine
                            ? t("edumatch.admin.verifications.fromAdmin")
                            : m.senderName ?? t("edumatch.admin.verifications.fromTutor")}
                          {" · "}
                          {new Date(m.createdAt).toLocaleString()}
                        </div>
                        {m.body && (
                          <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        )}
                        <MessageAttachments attachments={m.attachments} />
                        {currentUserId && (
                          <EmojiReactionBar
                            messageId={m.id}
                            reactions={m.reactions ?? {}}
                            currentUserId={currentUserId}
                            pickerAbove
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("edumatch.admin.verifications.noMessages")}
                </p>
              )}
            </div>

            <div className="mt-2">
              <VerificationComposer
                onSend={sendFollowup}
                placeholder={t("edumatch.admin.verifications.followupPlaceholder")}
                sendLabel={t("edumatch.admin.verifications.sendMessage")}
                accent="emerald"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
