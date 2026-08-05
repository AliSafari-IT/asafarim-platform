"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { ContextualHelpLink } from "@/components/help/ContextualHelpLink";

type Attachment = {
  url: string;
  mime: string;
  filename: string;
  sizeBytes: number;
};

type AiResponse = {
  id: string;
  explanation: string;
  modelUsed: string;
  createdAt: string;
};

type Inquiry = {
  id: string;
  subject: string;
  gradeLevel: string;
  description: string;
  attachments: Attachment[];
  status: string;
  aiSummary: string | null;
  createdAt: string;
  updatedAt: string;
  aiResponses: AiResponse[];
};

type StudentProfile = {
  userId: string;
  gradeLevel: string;
  subjectsOfInterest: string[];
  homeAddress: { formatted?: string } | null;
  homeLat: number | null;
  homeLng: number | null;
};

export default function InquiryDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
    NEW: { label: t("edumatch.status.NEW"), cls: "bg-gray-100 text-gray-700" },
    AI_RESPONDED: {
      label: t("edumatch.status.AI_RESPONDED"),
      cls: "bg-blue-100 text-blue-700",
    },
    TUTOR_REQUESTED: {
      label: t("edumatch.status.TUTOR_REQUESTED"),
      cls: "bg-yellow-100 text-yellow-700",
    },
    BOOKED: {
      label: t("edumatch.status.BOOKED"),
      cls: "bg-green-100 text-green-700",
    },
    CLOSED: {
      label: t("edumatch.status.CLOSED"),
      cls: "bg-gray-100 text-gray-500",
    },
    REFUSED: {
      label: t("edumatch.status.REFUSED"),
      cls: "bg-red-100 text-red-700",
    },
  };

  /**
   * AI accuracy/safety disclaimer shown alongside any AI explanation. Mirrors
   * the server-side AI_DISCLAIMER constant in lib/server/moderation.ts.
   */
  const AI_DISCLAIMER_TEXT = t("edumatch.inquiry.detail.disclaimer");

  /**
   * Confidence levels for AI responses based on moderation outcome and content.
   */
  const getConfidenceInfo = (outcome: typeof moderationOutcome, hasResponse: boolean) => {
    if (!hasResponse) return null;
    if (outcome?.outcome === "REVIEW") {
      return {
        level: "medium" as const,
        label: t("edumatch.inquiry.detail.confidence.medium"),
        color: "text-amber-600 bg-amber-50 border-amber-200",
        icon: "⚠️",
        message: t("edumatch.inquiry.detail.confidence.reviewMessage"),
      };
    }
    if (outcome?.outcome === "REFUSE") {
      return {
        level: "low" as const,
        label: t("edumatch.inquiry.detail.confidence.low"),
        color: "text-red-600 bg-red-50 border-red-200",
        icon: "🚫",
        message: t("edumatch.inquiry.detail.confidence.refuseMessage"),
      };
    }
    return {
      level: "high" as const,
      label: t("edumatch.inquiry.detail.confidence.high"),
      color: "text-blue-600 bg-blue-50 border-blue-200",
      icon: "✓",
      message: t("edumatch.inquiry.detail.confidence.standardMessage"),
    };
  };
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI streaming state
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [streamDone, setStreamDone] = useState(false);
  // Tracks moderation outcome for the current stream — set by the SSE
  // 'moderation' event when the prompt is refused.
  const [moderationOutcome, setModerationOutcome] = useState<null | {
    outcome: string;
    category: string;
  }>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamBoxRef = useRef<HTMLDivElement>(null);

  // Quote request state
  const [requestingQuotes, setRequestingQuotes] = useState(false);
  const [quoteRequestId, setQuoteRequestId] = useState<string | null>(null);
  const [quoteSuccess, setQuoteSuccess] = useState<{
    matchedTutors: number;
  } | null>(null);

  // Student profile state (for location)
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(
    null,
  );

  useEffect(() => {
    if (!id) return;
    fetch(`/api/inquiries/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json() as Promise<Inquiry>;
      })
      .then((data) => {
        setInquiry(data);
        if (data.aiResponses?.length > 0) {
          setStreamedText(data.aiResponses[0].explanation);
          setStreamDone(true);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });

    // Fetch student profile for location
    fetch("/api/student/profile")
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<StudentProfile>;
      })
      .then((data) => setStudentProfile(data))
      .catch(() => {
        // Profile may not exist yet
      });
  }, [id]);

  useEffect(() => {
    if (streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight;
    }
  }, [streamedText]);

  async function startAiStream() {
    if (!inquiry) return;
    setStreaming(true);
    setStreamedText("");
    setStreamDone(false);
    setModerationOutcome(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`/api/inquiries/${id}/ai?stream=1`, {
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        setError(t("edumatch.inquiry.detail.aiUnavailable"));
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let pendingEvent: string | null = null;
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            pendingEvent = line.slice(7).trim();
            if (pendingEvent === "done") {
              setStreamDone(true);
              setStreaming(false);
              setInquiry((prev) =>
                prev
                  ? {
                      ...prev,
                      status: moderationOutcome ? "REFUSED" : "AI_RESPONDED",
                    }
                  : prev,
              );
            }
            continue;
          }
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6)) as {
                token?: string;
                done?: boolean;
                error?: string;
                outcome?: string;
                category?: string;
              };
              if (pendingEvent === "moderation") {
                if (payload.outcome && payload.category) {
                  setModerationOutcome({
                    outcome: payload.outcome,
                    category: payload.category,
                  });
                }
                pendingEvent = null;
                continue;
              }
              pendingEvent = null;
              if (payload.error) {
                setError(payload.error);
                setStreaming(false);
                return;
              }
              if (payload.token) {
                setStreamedText((prev) => prev + payload.token);
              }
              if (payload.done) {
                setStreamDone(true);
                setStreaming(false);
                setInquiry((prev) =>
                  prev ? { ...prev, status: "AI_RESPONDED" } : prev,
                );
              }
            } catch {
              // ignore malformed SSE lines
              pendingEvent = null;
            }
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        setError(t("edumatch.inquiry.detail.streamInterrupted"));
      }
      setStreaming(false);
    }
  }

  async function getLocation(): Promise<{ lat: number; lng: number } | null> {
    // 1. Use profile location if available
    if (studentProfile?.homeLat && studentProfile?.homeLng) {
      return { lat: studentProfile.homeLat, lng: studentProfile.homeLng };
    }

    // 2. Try browser geolocation
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000, // 5 minutes cache
            });
          },
        );
        return {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      } catch {
        // Geolocation failed or denied, continue to error
      }
    }

    return null;
  }

  async function requestTutorQuotes() {
    if (!inquiry) return;

    const location = await getLocation();
    if (!location) {
      setError(t("edumatch.inquiry.detail.locationRequired"));
      return;
    }

    setRequestingQuotes(true);
    try {
      const res = await fetch(`/api/inquiries/${id}/quote-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferOnline: true,
          studentLocation: location,
        }),
      });
      const data = (await res.json()) as {
        quoteRequest?: { id: string };
        matchedTutors?: unknown[];
        totalMatched?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to request quotes.");
        return;
      }
      const qrId = data.quoteRequest?.id;
      const matched = data.totalMatched ?? data.matchedTutors?.length ?? 0;
      setQuoteRequestId(qrId ?? null);
      setInquiry((prev) =>
        prev ? { ...prev, status: "TUTOR_REQUESTED" } : prev,
      );
      setQuoteSuccess({ matchedTutors: matched });
      if (qrId) {
        setTimeout(() => {
          router.push(`/student/inquiry/${id}/quotes?qr=${qrId}`);
        }, 2500);
      }
    } catch {
      setError(t("edumatch.inquiry.detail.quoteFailed"));
    } finally {
      setRequestingQuotes(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  if (error && !inquiry) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Link
            href="/student"
            className="text-[var(--color-primary)] hover:underline"
          >
            {t("edumatch.inquiry.detail.backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  if (!inquiry) return null;

  const statusInfo = STATUS_LABELS[inquiry.status] ?? STATUS_LABELS.NEW;
  const canAskAI = ["NEW", "AI_RESPONDED"].includes(inquiry.status);
  const canRequestTutors = inquiry.status === "AI_RESPONDED" && streamDone;
  const hasAiResponse = streamedText.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/student"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
        >
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-sm text-[var(--color-text)]">
          {inquiry.subject}
        </span>
      </div>

      {/* Inquiry card */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">
              {inquiry.subject}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {inquiry.gradeLevel} ·{" "}
              {new Date(inquiry.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ContextualHelpLink href="/help/students/ask-a-question" />
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusInfo.cls}`}
            >
              {statusInfo.label}
            </span>
          </div>
        </div>
        <p className="text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
          {inquiry.description}
        </p>

        {/* Attachments */}
        {inquiry.attachments?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {inquiry.attachments.map((att, i) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] transition"
              >
                <AttachmentIcon mime={att.mime} />
                {att.filename}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Error banner */}
      {quoteSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-300 px-4 py-4 text-sm text-green-800">
          <p className="font-semibold mb-1">
            {t("edumatch.inquiry.detail.quoteSuccess.title")}
          </p>
          {quoteSuccess.matchedTutors > 0 ? (
            <p>
              {quoteSuccess.matchedTutors === 1
                ? t("edumatch.inquiry.detail.quoteSuccess.notified", {
                    n: quoteSuccess.matchedTutors,
                  })
                : t("edumatch.inquiry.detail.quoteSuccess.notifiedPlural", {
                    n: quoteSuccess.matchedTutors,
                  })}
            </p>
          ) : (
            <p>{t("edumatch.inquiry.detail.quoteSuccess.noTutors")}</p>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            {t("edumatch.inquiry.detail.dismiss")}
          </button>
        </div>
      )}

      {/* AI Response section */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {t("edumatch.inquiry.detail.aiTitle")}
          </h2>
          {canAskAI && (
            <button
              onClick={startAiStream}
              disabled={streaming}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {streaming ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t("edumatch.inquiry.detail.thinking")}
                </>
              ) : streamDone ? (
                t("edumatch.inquiry.detail.askAgain")
              ) : (
                t("edumatch.inquiry.detail.askAi")
              )}
            </button>
          )}
        </div>

        {/* Always-visible safety/accuracy disclaimer */}
        <div
          data-testid="ai-disclaimer"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800"
          role="note"
          aria-label={t("edumatch.inquiry.detail.disclaimerLabel")}
        >
          <strong>{t("edumatch.inquiry.detail.headsUp")}</strong> {AI_DISCLAIMER_TEXT}
        </div>

        {/* Confidence indicator for AI responses */}
        {hasAiResponse && (
          <div
            data-testid="ai-confidence"
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${getConfidenceInfo(moderationOutcome, hasAiResponse)?.color}`}
            role="status"
            aria-live="polite"
            aria-label={`AI response confidence: ${getConfidenceInfo(moderationOutcome, hasAiResponse)?.label}`}
          >
            <div className="flex items-center gap-2 font-medium">
              <span aria-hidden="true">{getConfidenceInfo(moderationOutcome, hasAiResponse)?.icon}</span>
              <span>{getConfidenceInfo(moderationOutcome, hasAiResponse)?.label}</span>
            </div>
            <p className="mt-1 text-sm opacity-90">
              {getConfidenceInfo(moderationOutcome, hasAiResponse)?.message}
            </p>
            <p className="mt-2 text-xs opacity-75">
              {t("edumatch.inquiry.detail.confidence.verifySuggestion")}
            </p>
          </div>
        )}

        {/* Moderation refusal banner */}
        {moderationOutcome && moderationOutcome.outcome === "REFUSE" && (
          <div
            data-testid="ai-refusal"
            className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <strong>{t("edumatch.inquiry.detail.moderation.refused")}</strong>{" "}
            <span className="text-red-700">
              {t("edumatch.inquiry.detail.moderation.category", {
                category: moderationOutcome.category,
              })}
            </span>
          </div>
        )}

        {hasAiResponse ? (
          <div
            ref={streamBoxRef}
            className="max-h-[480px] overflow-y-auto rounded-lg bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed font-mono"
          >
            {streamedText}
            {streaming && (
              <span className="ml-1 inline-block h-3.5 w-0.5 animate-pulse bg-[var(--color-primary)]" />
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">
            {streaming
              ? t("edumatch.inquiry.detail.generating")
              : t("edumatch.inquiry.detail.askPrompt")}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {canRequestTutors && (
          <button
            onClick={requestTutorQuotes}
            disabled={requestingQuotes}
            className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {requestingQuotes
              ? t("edumatch.inquiry.detail.requesting")
              : t("edumatch.inquiry.detail.requestTutors")}
          </button>
        )}
        {(inquiry.status === "TUTOR_REQUESTED" || quoteRequestId) && (
          <Link
            href={`/student/inquiry/${id}/quotes${quoteRequestId ? `?qr=${quoteRequestId}` : ""}`}
            className="rounded-lg border border-[var(--color-border-strong)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] transition"
          >
            {t("edumatch.inquiry.detail.viewQuotes")}
          </Link>
        )}
      </div>
    </div>
  );
}

function AttachmentIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <span>🖼</span>;
  if (mime.startsWith("audio/")) return <span>🎤</span>;
  if (mime.startsWith("video/")) return <span>🎬</span>;
  if (mime === "application/pdf") return <span>📄</span>;
  return <span>📎</span>;
}
