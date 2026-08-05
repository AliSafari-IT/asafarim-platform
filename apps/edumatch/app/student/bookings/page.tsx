"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { ContextualHelpLink } from "@/components/help/ContextualHelpLink";

type Booking = {
  id: string;
  status: string;
  scheduledAt: string | null;
  durationMinutes: number;
  mode: string;
  totalCents: number;
  subject: string;
  gradeLevel: string;
  tutorName: string | null;
  disputeNotes: string | null;
  refundRecorded: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 border-blue-200",
  COMPLETED: "bg-green-100 text-green-700 border-green-200",
  CANCELLED: "bg-red-100 text-red-600 border-red-200",
  DISPUTED: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function StudentBookingsPage() {
  const { t, locale } = useTranslation();
  const bookingTitle = tx(t, locale, "edumatch.student.bookings.title", {
    en: "My Bookings",
    nl: "Mijn boekingen",
    fr: "Mes réservations",
    de: "Meine Buchungen",
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/student/bookings");
      const data = (await res.json()) as { items?: Booking[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t("edumatch.student.bookings.loadFailed"));
      setBookings(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("edumatch.student.bookings.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function postDispute(booking: Booking, kind: "open" | "respond") {
    const message = notes[booking.id]?.trim();
    if (!message) {
      setError(t("edumatch.disputes.messageRequired"));
      return;
    }
    setBusy(booking.id);
    setError(null);
    try {
      const res = await fetch(
        kind === "open"
          ? `/api/bookings/${booking.id}/dispute`
          : `/api/bookings/${booking.id}/dispute/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kind === "open" ? { reason: message } : { message }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("edumatch.disputes.submitFailed"));
      setNotes((prev) => ({ ...prev, [booking.id]: "" }));
      await load();
    } catch (e) {
      setError(localizeDisputeError(e, t, locale));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/student" className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--color-text)]">{bookingTitle}</span>
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{bookingTitle}</h1>
        <ContextualHelpLink href="/help/students/bookings-and-support" />
      </div>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">{t("edumatch.student.bookings.subtitle")}</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-10 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.student.bookings.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const canOpen = ["SCHEDULED", "COMPLETED"].includes(booking.status);
            const isDisputed = booking.status === "DISPUTED";
            return (
              <article key={booking.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[var(--color-text)]">{booking.subject}</h2>
                      <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                        {booking.gradeLevel}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[booking.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {t(`edumatch.booking.status.${booking.status}`)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {t("edumatch.admin.bookings.tutor")}: {booking.tutorName ?? "-"}
                    </p>
                    {booking.scheduledAt && (
                      <p className="text-sm text-[var(--color-text-muted)]">
                        {new Date(booking.scheduledAt).toLocaleString()} · {booking.durationMinutes}{" "}
                        {t("edumatch.common.minutes")} · {t(`edumatch.booking.mode.${booking.mode}`)}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-lg font-bold text-[var(--color-text)]">
                    €{(booking.totalCents / 100).toFixed(2)}
                  </p>
                </div>

                {booking.disputeNotes && (
                  <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
                    <p className="mb-1 font-medium">{t("edumatch.disputes.thread")}</p>
                    <pre className="whitespace-pre-wrap font-sans text-xs">{booking.disputeNotes}</pre>
                    {booking.refundRecorded && (
                      <p className="mt-2 text-xs font-medium">{t("edumatch.disputes.refundRecorded")}</p>
                    )}
                  </div>
                )}

                {(canOpen || isDisputed) && (
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                      {canOpen ? t("edumatch.disputes.reason") : t("edumatch.disputes.response")}
                    </label>
                    <textarea
                      rows={3}
                      value={notes[booking.id] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [booking.id]: e.target.value }))}
                      placeholder={canOpen ? t("edumatch.disputes.reasonPlaceholder") : t("edumatch.disputes.responsePlaceholder")}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                    />
                    <button
                      type="button"
                      disabled={busy === booking.id}
                      onClick={() => postDispute(booking, canOpen ? "open" : "respond")}
                      className="mt-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {busy === booking.id
                        ? t("edumatch.disputes.submitting")
                        : canOpen
                          ? t("edumatch.disputes.open")
                          : t("edumatch.disputes.sendResponse")}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function localizeDisputeError(
  error: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: string,
) {
  const message = error instanceof Error ? error.message : "";
  if (/already open/i.test(message)) {
    return tx(t, locale, "edumatch.disputes.error.alreadyOpen", disputeErrorFallbacks.alreadyOpen);
  }
  if (/within (\d+) days/i.test(message)) {
    const days = message.match(/within (\d+) days/i)?.[1] ?? 14;
    return tx(t, locale, "edumatch.disputes.error.windowClosed", disputeErrorFallbacks.windowClosed, { days });
  }
  if (/only the booking's student/i.test(message)) {
    return tx(t, locale, "edumatch.disputes.error.studentOnly", disputeErrorFallbacks.studentOnly);
  }
  if (/only the booking's tutor/i.test(message)) {
    return tx(t, locale, "edumatch.disputes.error.tutorOnly", disputeErrorFallbacks.tutorOnly);
  }
  if (/can only respond/i.test(message)) {
    return tx(t, locale, "edumatch.disputes.error.notOpen", disputeErrorFallbacks.notOpen);
  }
  if (/reason is required|message is required|required/i.test(message)) {
    return tx(t, locale, "edumatch.disputes.messageRequired", disputeErrorFallbacks.messageRequired);
  }
  return tx(t, locale, "edumatch.disputes.submitFailed", disputeErrorFallbacks.submitFailed);
}

const disputeErrorFallbacks = {
  alreadyOpen: {
    en: "A dispute is already open for this booking.",
    nl: "Er is al een geschil geopend voor deze boeking.",
    fr: "Un litige est déjà ouvert pour cette réservation.",
    de: "Für diese Buchung ist bereits ein Streitfall offen.",
  },
  windowClosed: {
    en: "Disputes must be opened within {days} days of the session.",
    nl: "Geschillen moeten binnen {days} dagen na de sessie worden geopend.",
    fr: "Les litiges doivent être ouverts dans les {days} jours suivant la session.",
    de: "Streitfälle müssen innerhalb von {days} Tagen nach der Sitzung geöffnet werden.",
  },
  studentOnly: {
    en: "Only the student for this booking can do that.",
    nl: "Alleen de student van deze boeking kan dit doen.",
    fr: "Seul l’étudiant de cette réservation peut effectuer cette action.",
    de: "Nur der Student dieser Buchung kann das tun.",
  },
  tutorOnly: {
    en: "Only the tutor for this booking can do that.",
    nl: "Alleen de tutor van deze boeking kan dit doen.",
    fr: "Seul le tuteur de cette réservation peut effectuer cette action.",
    de: "Nur der Tutor dieser Buchung kann das tun.",
  },
  notOpen: {
    en: "This dispute is no longer open.",
    nl: "Dit geschil is niet meer open.",
    fr: "Ce litige n’est plus ouvert.",
    de: "Dieser Streitfall ist nicht mehr offen.",
  },
  messageRequired: {
    en: "Add a message before submitting.",
    nl: "Voeg een bericht toe voordat je indient.",
    fr: "Ajoutez un message avant l’envoi.",
    de: "Füge vor dem Senden eine Nachricht hinzu.",
  },
  submitFailed: {
    en: "Failed to submit dispute update.",
    nl: "Geschilupdate indienen is mislukt.",
    fr: "Échec de l’envoi de la mise à jour du litige.",
    de: "Streitfallaktualisierung konnte nicht gesendet werden.",
  },
};

function tx(
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: string,
  key: string,
  fallback: Record<string, string>,
  vars?: Record<string, string | number>,
) {
  const value = t(key, vars);
  if (value !== key) return value;
  const base = locale.toLowerCase().split("-")[0];
  const template = fallback[base] ?? fallback.en ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    vars && name in vars ? String(vars[name]) : `{${name}}`,
  );
}
