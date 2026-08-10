"use client";

/**
 * The front door: "What would you like help with?"
 *
 * One text box, one upload control, and a conversation. No subject dropdown,
 * no grade selector, no multi-step form — the assistant works those out from
 * what the student says and asks about anything it genuinely can't infer, one
 * question at a time.
 *
 * The page has three states rather than three routes, because they're one
 * continuous conversation: TALKING (chat), REVIEW (confirm the brief), and
 * MATCHED (tutors invited). Navigating away and back resumes wherever the
 * brief left off.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  AttachmentUploader,
  type UploadedAttachment,
} from "@/components/AttachmentUploader";
import { BriefReview } from "@/components/learning/BriefReview";
import { TriageCard } from "@/components/learning/TriageCard";
import { TutorCandidateList } from "@/components/learning/TutorCandidateList";
import type {
  BriefView,
  BriefTurn,
  IntakeQuestion,
  TutorCandidateView,
} from "@/lib/types/learning";

type Phase = "TALKING" | "REVIEW" | "MATCHED";

type StepResponse = {
  brief: BriefView;
  turns: BriefTurn[];
  question: IntakeQuestion | null;
};

export default function LearnPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("brief");

  const [briefId, setBriefId] = useState<string | null>(resumeId);
  const [brief, setBrief] = useState<BriefView | null>(null);
  const [turns, setTurns] = useState<BriefTurn[]>([]);
  const [question, setQuestion] = useState<IntakeQuestion | null>(null);
  const [phase, setPhase] = useState<Phase>("TALKING");

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<TutorCandidateView[]>([]);
  const [quoteRequestId, setQuoteRequestId] = useState<string | null>(null);

  const transcriptEnd = useRef<HTMLDivElement>(null);
  const uploaderKey = useRef(0);

  const applyStep = useCallback((data: StepResponse) => {
    setBrief(data.brief);
    setBriefId(data.brief.id);
    setTurns(data.turns);
    setQuestion(data.question);
    if (data.brief.status === "MATCHED") setPhase("MATCHED");
  }, []);

  // Resume an in-progress conversation from ?brief=…
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/learning/briefs/${resumeId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { brief: BriefView; turns: BriefTurn[] };
      applyStep({ ...data, question: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeId, applyStep]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);

  const canSend = message.trim().length >= 2 && !uploading && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);

    const body = JSON.stringify({
      message: message.trim(),
      attachments,
      ...(briefId ? {} : { localeHint: undefined }),
    });

    // Show the student's own message immediately; the server echoes the
    // authoritative transcript back and we replace this optimistic copy.
    setTurns((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        role: "STUDENT",
        kind: "MESSAGE",
        content: message.trim(),
        field: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setMessage("");

    try {
      const res = await fetch(
        briefId ? `/api/learning/briefs/${briefId}/messages` : "/api/learning/briefs",
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
      );
      const data = (await res.json()) as StepResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("edumatch.learn.error.send"));
        return;
      }
      applyStep(data);
      setAttachments([]);
      uploaderKey.current += 1;
    } catch {
      setError(t("edumatch.learn.error.network"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmBrief() {
    if (!briefId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/learning/briefs/${briefId}/confirm`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        brief?: BriefView;
        candidates?: TutorCandidateView[];
        error?: string;
      };
      if (!res.ok || !data.brief) {
        setError(data.error ?? t("edumatch.learn.error.confirm"));
        return;
      }
      setBrief(data.brief);
      setCandidates(data.candidates ?? []);
      setPhase("REVIEW");
    } catch {
      setError(t("edumatch.learn.error.network"));
    } finally {
      setBusy(false);
    }
  }

  async function shareWithTutors() {
    if (!briefId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/learning/briefs/${briefId}/matches`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        quoteRequestId?: string;
        candidates?: TutorCandidateView[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? t("edumatch.learn.error.match"));
        return;
      }
      setCandidates(data.candidates ?? []);
      setQuoteRequestId(data.quoteRequestId ?? null);
      setPhase("MATCHED");
    } catch {
      setError(t("edumatch.learn.error.network"));
    } finally {
      setBusy(false);
    }
  }

  async function saveBriefEdits(patch: Record<string, unknown>) {
    if (!briefId) return;
    const res = await fetch(`/api/learning/briefs/${briefId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = (await res.json()) as { brief: BriefView };
      setBrief(data.brief);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          {t("edumatch.learn.title")}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.learn.subtitle")}
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {phase === "TALKING" && (
        <>
          <Transcript turns={turns} busy={busy} endRef={transcriptEnd} />

          {question && (
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {t("edumatch.learn.answerPrompt")}
            </p>
          )}

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
            <label htmlFor="learn-message" className="sr-only">
              {t("edumatch.learn.inputLabel")}
            </label>
            <textarea
              id="learn-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              rows={turns.length === 0 ? 4 : 2}
              maxLength={4000}
              placeholder={
                question?.text ?? t("edumatch.learn.inputPlaceholder")
              }
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />

            <div className="mt-3">
              <AttachmentUploader
                key={uploaderKey.current}
                onChange={setAttachments}
                onUploadingChange={setUploading}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--color-text-muted)]">
                {t("edumatch.learn.privacyNote")}
              </span>
              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSend}
                className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy
                  ? t("edumatch.learn.thinking")
                  : turns.length === 0
                    ? t("edumatch.learn.startBtn")
                    : t("edumatch.learn.sendBtn")}
              </button>
            </div>
          </div>

          {brief && (
            <TriageCard
              brief={brief}
              onReview={() => setPhase("REVIEW")}
              canReview={brief.readyForReview && brief.blockers.length === 0}
            />
          )}
        </>
      )}

      {phase === "REVIEW" && brief && (
        <BriefReview
          brief={brief}
          candidates={candidates}
          busy={busy}
          onEdit={saveBriefEdits}
          onBack={() => setPhase("TALKING")}
          onConfirm={confirmBrief}
          onShare={shareWithTutors}
        />
      )}

      {phase === "MATCHED" && brief && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {t("edumatch.learn.matched.title", { n: candidates.length })}
          </h2>
          <p className="mt-1 mb-4 text-sm text-[var(--color-text-muted)]">
            {t("edumatch.learn.matched.desc")}
          </p>
          <TutorCandidateList candidates={candidates} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/student/brief/${brief.id}/compare`}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              {t("edumatch.learn.matched.compareBtn")}
            </Link>
            <button
              type="button"
              onClick={() => router.push("/student")}
              className="rounded-lg border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
            >
              {t("edumatch.learn.matched.dashboardBtn")}
            </button>
          </div>
          {quoteRequestId && (
            <p className="mt-4 text-xs text-[var(--color-text-muted)]">
              {t("edumatch.learn.matched.requestRef", { id: quoteRequestId })}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Transcript({
  turns,
  busy,
  endRef,
}: {
  turns: BriefTurn[];
  busy: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  if (turns.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.learn.emptyHint")}
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3">
      {turns.map((turn) => (
        <article
          key={turn.id}
          className={
            turn.role === "STUDENT"
              ? "ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-[var(--color-primary)] px-4 py-3 text-sm text-white"
              : "mr-auto max-w-[92%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-sm text-[var(--color-text)]"
          }
        >
          {turn.role === "ASSISTANT" && turn.kind === "QUESTION" && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              {t("edumatch.learn.turn.question")}
            </p>
          )}
          {turn.role === "ASSISTANT" && turn.kind === "HELP" && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              {t("edumatch.learn.turn.help")}
            </p>
          )}
          <div className="whitespace-pre-wrap">{turn.content}</div>
        </article>
      ))}
      {busy && (
        <p className="mr-auto text-xs text-[var(--color-text-muted)]">
          {t("edumatch.learn.thinking")}
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
}
