"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { ContextualHelpLink } from "@/components/help/ContextualHelpLink";

type Attachment = {
  url: string;
  mime: string;
  filename: string;
  sizeBytes: number;
};

type QuoteRequest = {
  id: string;
  inquiryId: string;
  subject: string;
  gradeLevel: string;
  description: string;
  attachments: Attachment[];
  requestedAt: string;
  expiresAt: string;
  distanceKm: number;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <span aria-hidden="true">🖼</span>;
  if (mime.startsWith("audio/")) return <span aria-hidden="true">🎤</span>;
  if (mime.startsWith("video/")) return <span aria-hidden="true">🎬</span>;
  if (mime === "application/pdf") return <span aria-hidden="true">📄</span>;
  if (mime.includes("word") || mime === "application/msword")
    return <span aria-hidden="true">📝</span>;
  if (mime.includes("presentation")) return <span aria-hidden="true">📊</span>;
  if (mime.includes("spreadsheet")) return <span aria-hidden="true">📈</span>;
  return <span aria-hidden="true">📎</span>;
}

type SlotDraft = { start: string; end: string; mode: "ONLINE" | "IN_PERSON" };

type QuoteForm = {
  hourlyRateCents: number;
  estimatedHours: number;
  notes: string;
  slots: SlotDraft[];
};

const DEFAULT_FORM: QuoteForm = {
  hourlyRateCents: 3000,
  estimatedHours: 2,
  notes: "",
  slots: [{ start: "", end: "", mode: "ONLINE" }],
};

/** Minimum duration of an availability slot, in minutes. */
const MIN_SLOT_MINUTES = 30;

/** Format a Date into a `datetime-local` value (local time, no timezone). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Add minutes to a `datetime-local` value, returning a new value (or ""). */
function addMinutes(value: string, mins: number): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + mins);
  return toLocalInput(d);
}

/** Whether `end` is at least MIN_SLOT_MINUTES after `start`. */
function slotDurationOk(start: string, end: string): boolean {
  if (!start || !end) return false;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return false;
  return e - s >= MIN_SLOT_MINUTES * 60 * 1000;
}

export default function TutorRequestsPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, QuoteForm>>({});

  useEffect(() => {
    async function loadRequests(lat?: number, lng?: number) {
      const url =
        lat != null && lng != null
          ? `/api/tutors/quote-requests?lat=${lat}&lng=${lng}`
          : `/api/tutors/quote-requests`;

      const r = await fetch(url);
      const data = (await r.json()) as {
        items?: QuoteRequest[];
        error?: string;
      };

      if (data.error) {
        // If no location in profile, try browser geolocation
        if (data.error.includes("lat/lng") && lat == null) {
          if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => loadRequests(pos.coords.latitude, pos.coords.longitude),
              () => {
                setError(t("edumatch.requests.addProfile"));
                setLoading(false);
              },
            );
          } else {
            setError(t("edumatch.requests.addProfile"));
            setLoading(false);
          }
          return;
        }
        throw new Error(data.error);
      }

      setRequests(data.items ?? []);
      setLoading(false);
    }

    loadRequests().catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t("edumatch.requests.loadFailed"));
      setLoading(false);
    });
  }, []);

  function getForm(id: string): QuoteForm {
    return (
      forms[id] ?? {
        ...DEFAULT_FORM,
        slots: [{ start: "", end: "", mode: "ONLINE" }],
      }
    );
  }

  function setForm(id: string, patch: Partial<QuoteForm>) {
    setForms((prev) => ({ ...prev, [id]: { ...getForm(id), ...patch } }));
  }

  function setSlot(id: string, idx: number, patch: Partial<SlotDraft>) {
    const f = getForm(id);
    const slots = f.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setForm(id, { slots });
  }

  /**
   * Changing the start time also enforces the end-time floor: if the current
   * end is empty or now earlier than start + MIN_SLOT_MINUTES, snap it forward
   * so the slot stays valid.
   */
  function setSlotStart(id: string, idx: number, start: string) {
    const f = getForm(id);
    const current = f.slots[idx]?.end ?? "";
    const minEnd = addMinutes(start, MIN_SLOT_MINUTES);
    const end =
      start && (!current || current < minEnd) ? minEnd : current;
    setSlot(id, idx, { start, end });
  }

  function addSlot(id: string) {
    const f = getForm(id);
    if (f.slots.length >= 5) return;
    setForm(id, {
      slots: [...f.slots, { start: "", end: "", mode: "ONLINE" }],
    });
  }

  function removeSlot(id: string, idx: number) {
    const f = getForm(id);
    setForm(id, { slots: f.slots.filter((_, i) => i !== idx) });
  }

  async function submitQuote(qrId: string) {
    const f = getForm(qrId);
    const slots = f.slots.filter((s) => s.start && s.end);
    if (slots.length === 0) {
      setError(t("edumatch.requests.noSlotError"));
      return;
    }
    if (!slots.every((s) => slotDurationOk(s.start, s.end))) {
      setError(
        t("edumatch.requests.slotDurationError", { n: MIN_SLOT_MINUTES }),
      );
      return;
    }

    setSubmitting(qrId);
    setError(null);

    try {
      const res = await fetch(`/api/quote-requests/${qrId}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hourlyRateCents: f.hourlyRateCents,
          estimatedHours: f.estimatedHours,
          notes: f.notes || undefined,
          availabilitySlots: slots,
        }),
      });

      const data = (await res.json()) as { id?: string; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Failed to submit quote.");
        return;
      }

      setSubmitted((prev) => new Set(prev).add(qrId));
      setExpandedId(null);
    } catch {
      setError(t("edumatch.inquiry.new.networkError"));
    } finally {
      setSubmitting(null);
    }
  }

  const openRequests = requests.filter((r) => !submitted.has(r.id));
  const quotedRequests = requests.filter((r) => submitted.has(r.id));

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link
          href="/tutor"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
        >
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--color-text)]">
          {t("edumatch.requests.title")}
        </span>
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          {t("edumatch.requests.title")}
        </h1>
        <ContextualHelpLink href="/help/tutors/finding-and-quoting-requests" />
      </div>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">
        {t("edumatch.requests.subtitle")}
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              {error}
              {error.includes("profile") && (
                <Link
                  href="/tutor/profile"
                  className="ml-1 font-semibold underline hover:text-amber-900"
                >
                  {t("edumatch.requests.updateProfile")}</Link>
              )}
            </div>
            <button
              onClick={() => setError(null)}
              className="shrink-0 underline text-xs"
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      {/* Open requests */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">
          {t("edumatch.requests.open", { n: openRequests.length })}
        </h2>

        {openRequests.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-8 text-center text-sm text-[var(--color-text-muted)]">
            {t("edumatch.requests.noOpen")}
          </div>
        ) : (
          <div className="space-y-4">
            {openRequests.map((req) => {
              const isExpanded = expandedId === req.id;
              const f = getForm(req.id);
              const isSubmitting = submitting === req.id;
              const expiresIn = Math.max(
                0,
                Math.floor(
                  (new Date(req.expiresAt).getTime() - Date.now()) /
                    (1000 * 60 * 60),
                ),
              );

              return (
                <div
                  key={req.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] overflow-hidden"
                >
                  {/* Request summary */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="w-full text-left p-5 hover:bg-[var(--color-surface)] transition"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-[var(--color-text)]">
                            {req.subject}
                          </span>
                          <span className="rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                            {req.gradeLevel}
                          </span>
                          {req.distanceKm > 0 && (
                            <span className="text-xs text-[var(--color-text-muted)]">
                              ~{req.distanceKm} km
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">
                          {req.description}
                        </p>
                        {req.attachments?.length > 0 && (
                          <span className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                            📎 {t("edumatch.requests.attachmentCount", {
                              n: req.attachments.length,
                            })}
                          </span>
                        )}
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {t("edumatch.requests.expiresIn", { n: expiresIn })}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {t("edumatch.requests.requested")}{" "}
                        {new Date(req.requestedAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs font-medium text-[var(--color-primary)]">
                        {isExpanded
                          ? t("edumatch.requests.hideForm")
                          : t("edumatch.requests.submitQuote")}
                      </span>
                    </div>
                  </button>

                  {/* Quote form */}
                  {isExpanded && (
                    <div className="border-t border-[var(--color-border)] p-5 bg-[var(--color-surface)]">
                      {/* Student's attached materials */}
                      {req.attachments?.length > 0 && (
                        <div className="mb-5">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                            {t("edumatch.requests.attachments")}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {req.attachments.map((att, i) => (
                              <a
                                key={i}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-xs text-[var(--color-primary)] hover:bg-[var(--color-surface)] transition"
                              >
                                <AttachmentIcon mime={att.mime} />
                                <span className="max-w-[180px] truncate">
                                  {att.filename}
                                </span>
                                <span className="text-[var(--color-text-muted)]">
                                  {humanSize(att.sizeBytes)}
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">
                        {t("edumatch.requests.submitYourQuote")}
                      </h3>

                      {/* Rate + hours */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                            {t("edumatch.requests.rate")}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={f.hourlyRateCents / 100}
                            onChange={(e) =>
                              setForm(req.id, {
                                hourlyRateCents: Math.round(
                                  parseFloat(e.target.value) * 100,
                                ),
                              })
                            }
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                            {t("edumatch.requests.hours")}
                          </label>
                          <input
                            type="number"
                            min={0.5}
                            max={100}
                            step={0.5}
                            value={f.estimatedHours}
                            onChange={(e) =>
                              setForm(req.id, {
                                estimatedHours: parseFloat(e.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          />
                        </div>
                      </div>

                      {/* Total preview */}
                      <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm">
                        <span className="text-green-600">{t("edumatch.quotes.total")}: </span>
                        <span className="font-bold text-green-700">
                          €
                          {(
                            (f.hourlyRateCents / 100) *
                            f.estimatedHours
                          ).toFixed(2)}
                        </span>
                      </div>

                      {/* Availability slots */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-[var(--color-text-muted)]">
                            {t("edumatch.requests.slots.title")}
                          </label>
                          {f.slots.length < 5 && (
                            <button
                              onClick={() => addSlot(req.id)}
                              className="text-xs text-[var(--color-primary)] hover:underline"
                            >
                              {t("edumatch.requests.slots.add")}
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {f.slots.map((slot, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center"
                            >
                              <input
                                type="datetime-local"
                                value={slot.start}
                                onChange={(e) =>
                                  setSlotStart(req.id, idx, e.target.value)
                                }
                                aria-label={t("edumatch.requests.slots.start")}
                                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                              />
                              <input
                                type="datetime-local"
                                value={slot.end}
                                disabled={!slot.start}
                                min={
                                  slot.start
                                    ? addMinutes(slot.start, MIN_SLOT_MINUTES)
                                    : undefined
                                }
                                onChange={(e) =>
                                  setSlot(req.id, idx, { end: e.target.value })
                                }
                                aria-label={t("edumatch.requests.slots.end")}
                                title={
                                  !slot.start
                                    ? t("edumatch.requests.slots.pickStartFirst")
                                    : undefined
                                }
                                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <select
                                value={slot.mode}
                                onChange={(e) =>
                                  setSlot(req.id, idx, {
                                    mode: e.target.value as
                                      | "ONLINE"
                                      | "IN_PERSON",
                                  })
                                }
                                aria-label={t("edumatch.requests.slots.modeLabel")}
                                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none"
                              >
                                <option value="ONLINE">
                                  {t("edumatch.requests.slots.mode.online")}
                                </option>
                                <option value="IN_PERSON">
                                  {t("edumatch.requests.slots.mode.inPerson")}
                                </option>
                              </select>
                              {f.slots.length > 1 && (
                                <button
                                  onClick={() => removeSlot(req.id, idx)}
                                  className="text-red-400 hover:text-red-600 text-xs px-1"
                                >
                                  {t("edumatch.requests.slots.remove")}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                          {t("edumatch.requests.notes")}
                        </label>
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={f.notes}
                          onChange={(e) =>
                            setForm(req.id, { notes: e.target.value })
                          }
                          placeholder={t("edumatch.requests.notesPlaceholder")}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => submitQuote(req.id)}
                          disabled={isSubmitting}
                          className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[#07101a] hover:opacity-90 disabled:opacity-50 transition"
                        >
                          {isSubmitting
                            ? t("edumatch.requests.submitting")
                            : t("edumatch.requests.submitQuote")}
                        </button>
                        <button
                          onClick={() => setExpandedId(null)}
                          className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)] transition"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quoted section */}
      {quotedRequests.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">
            {t("edumatch.requests.quoted", { n: quotedRequests.length })}
          </h2>
          <div className="space-y-3">
            {quotedRequests.map((req) => (
              <div
                key={req.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm text-[var(--color-text)]">
                      {req.subject}
                    </span>
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                      {req.gradeLevel}
                    </span>
                  </div>
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
{t("edumatch.requests.quoteSent")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
