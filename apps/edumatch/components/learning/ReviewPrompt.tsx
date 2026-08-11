"use client";

/**
 * Leave a verified review, offered inline on a completed lesson.
 *
 * It only appears where the API would accept it — a completed booking the
 * student attended and hasn't yet reviewed — so the review a tutor's rating is
 * built from always corresponds to a lesson that actually happened.
 *
 * There is no separate "overall" star input: the student rates three
 * sub-aspects (clarity, reliability, engagement) and the overall is derived
 * live from those, exactly the way the server computes it — see
 * deriveOverallRating() in lib/server/learning-journey.ts. Keeping the two in
 * sync here is what makes the "Overall: 4.3 / 5" preview honest.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

const ASPECTS = ["clarity", "reliability", "engagement"] as const;
type Aspect = (typeof ASPECTS)[number];

const ASPECT_WEIGHTS: Record<Aspect, number> = {
  clarity: 0.4,
  reliability: 0.3,
  engagement: 0.3,
};

export function ReviewPrompt({
  bookingId,
  onDone,
}: {
  bookingId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState<Record<Aspect, number>>({
    clarity: 0,
    reliability: 0,
    engagement: 0,
  });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = ASPECTS.every((a) => ratings[a] >= 1);
  const derivedOverall = useMemo(() => {
    if (!complete) return null;
    const raw = ASPECTS.reduce((sum, a) => sum + ratings[a] * ASPECT_WEIGHTS[a], 0);
    return Math.round(raw * 10) / 10;
  }, [ratings, complete]);

  async function submit() {
    if (!complete) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clarity: ratings.clarity,
          reliability: ratings.reliability,
          engagement: ratings.engagement,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? t("edumatch.review.error"));
        return;
      }
      setOpen(false);
      onDone();
    } catch {
      setError(t("edumatch.review.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
      >
        {t("edumatch.review.cta")}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      {ASPECTS.map((aspect) => (
        <fieldset key={aspect} className="mt-3 first:mt-0">
          <legend className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            {t(`edumatch.review.aspect.${aspect}`)}
          </legend>
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatings((r) => ({ ...r, [aspect]: n }))}
                aria-label={t("edumatch.review.stars", { n })}
                aria-pressed={ratings[aspect] === n}
                className={`h-9 w-9 rounded-lg border text-sm transition ${
                  n <= ratings[aspect]
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <p className="mt-3 text-sm font-medium text-[var(--color-text)]">
        {t("edumatch.review.derivedOverall", {
          value: derivedOverall !== null ? derivedOverall.toFixed(1) : "—",
        })}
      </p>

      <label htmlFor={`review-${bookingId}`} className="sr-only">
        {t("edumatch.review.commentLabel")}
      </label>
      <textarea
        id={`review-${bookingId}`}
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("edumatch.review.commentPlaceholder")}
        className="mt-3 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !complete}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("edumatch.review.submit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
        >
          {t("edumatch.review.cancel")}
        </button>
      </div>
    </div>
  );
}
