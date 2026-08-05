"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

type Booking = {
  id: string;
  status: string;
  scheduledAt: string | null;
  durationMinutes: number;
  mode: string;
  totalCents: number;
  subject: string;
  gradeLevel: string;
  studentName: string | null;
  disputeNotes: string | null;
  refundRecorded: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  PENDING:    "bg-amber-100 text-amber-700 border-amber-200",
  CONFIRMED:  "bg-blue-100 text-blue-700 border-blue-200",
  COMPLETED:  "bg-green-100 text-green-700 border-green-200",
  CANCELLED:  "bg-red-100 text-red-600 border-red-200",
  DISPUTED:   "bg-purple-100 text-purple-700 border-purple-200",
};

export default function TutorBookingsPage() {
  const { t, locale } = useTranslation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    await fetch("/api/tutors/bookings")
      .then((r) => r.json())
      .then((data: { items?: Booking[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setBookings(data.items ?? []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t("edumatch.tutor.bookings.loadFailed"));
        setLoading(false);
      });
  }

  useEffect(() => {
    void load();
  }, []);

  async function respond(booking: Booking) {
    const message = responses[booking.id]?.trim();
    if (!message) {
      setError(t("edumatch.disputes.messageRequired"));
      return;
    }
    setBusy(booking.id);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/dispute/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("edumatch.disputes.submitFailed"));
      setResponses((prev) => ({ ...prev, [booking.id]: "" }));
      await load();
    } catch (e) {
      setError(localizeDisputeError(e, t, locale));
    } finally {
      setBusy(null);
    }
  }

  const upcoming  = bookings.filter((b) => ["PENDING", "CONFIRMED"].includes(b.status));
  const completed = bookings.filter((b) => b.status === "COMPLETED");
  const other     = bookings.filter((b) => !["PENDING", "CONFIRMED", "COMPLETED"].includes(b.status));

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/tutor" className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--color-text)]">{t("edumatch.tutor.bookings.breadcrumb")}</span>
      </div>

      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{t("edumatch.tutor.bookings.title")}</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t("edumatch.tutor.bookings.subtitle")}</p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {bookings.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-10 text-center">
          <p className="text-[var(--color-text-muted)] text-sm">{t("edumatch.tutor.bookings.empty")}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{t("edumatch.tutor.bookings.emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[
            { title: t("edumatch.tutor.bookings.upcoming"), items: upcoming },
            { title: t("edumatch.tutor.bookings.completed"), items: completed },
            { title: t("edumatch.tutor.bookings.other"), items: other },
          ].map(({ title, items }) =>
            items.length === 0 ? null : (
              <section key={title}>
                <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  {title} ({items.length})
                </h2>
                <div className="space-y-3">
                  {items.map((b) => (
                    <div key={b.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-[var(--color-text)]">{b.subject}</span>
                            <span className="rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                              {b.gradeLevel}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                              {b.status}
                            </span>
                            <span className="rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                              {t(`edumatch.booking.mode.${b.mode}`)}
                            </span>
                          </div>
                          {b.studentName && (
                            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.student")}: {b.studentName}</p>
                          )}
                          {b.scheduledAt && (
                            <p className="text-sm text-[var(--color-text-muted)]">
                              {new Date(b.scheduledAt).toLocaleString()} · {b.durationMinutes} min
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-[var(--color-text)]">
                            €{(b.totalCents / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      {b.disputeNotes && (
                        <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
                          <p className="mb-1 font-medium">{t("edumatch.disputes.thread")}</p>
                          <pre className="whitespace-pre-wrap font-sans text-xs">{b.disputeNotes}</pre>
                          {b.refundRecorded && (
                            <p className="mt-2 text-xs font-medium">{t("edumatch.disputes.refundRecorded")}</p>
                          )}
                        </div>
                      )}
                      {b.status === "DISPUTED" && (
                        <div className="mt-4">
                          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                            {t("edumatch.disputes.response")}
                          </label>
                          <textarea
                            rows={3}
                            value={responses[b.id] ?? ""}
                            onChange={(e) => setResponses((prev) => ({ ...prev, [b.id]: e.target.value }))}
                            placeholder={t("edumatch.disputes.responsePlaceholder")}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                          />
                          <button
                            type="button"
                            disabled={busy === b.id}
                            onClick={() => respond(b)}
                            className="mt-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            {busy === b.id ? t("edumatch.disputes.submitting") : t("edumatch.disputes.sendResponse")}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          )}
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
