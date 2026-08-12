"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import type { ScoredTutor } from "@/lib/types/tutor-matching";

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL || "http://localhost:3001";
const PROFILE_URL = `${HUB_URL}/profile`;

type MyLocation = { lat: number; lng: number; label: string | null; city: string | null };

export default function TutorMatchingDebugPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScoredTutor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [myLocation, setMyLocation] = useState<MyLocation | null>(null);
  const [myLocationLoading, setMyLocationLoading] = useState(true);

  const [params, setParams] = useState({
    lat: 50.943993,
    lng: 5.264494,
    subject: "Math",
    gradeLevel: "K12",
    maxDistanceKm: 50,
    preferOnline: false,
    limit: 20,
  });

  // Prefill lat/lng from the signed-in admin's own saved address (Hub profile
  // → Addresses), so the debug tool defaults to somewhere real instead of a
  // hardcoded coordinate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/my-location");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { location: MyLocation | null };
        if (cancelled || !data.location) return;
        setMyLocation(data.location);
        setParams((prev) => ({ ...prev, lat: data.location!.lat, lng: data.location!.lng }));
      } catch {
        // Non-fatal — the form still works with its default/manual coordinates.
      } finally {
        if (!cancelled) setMyLocationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function useMySavedLocation() {
    if (!myLocation) return;
    setParams((prev) => ({ ...prev, lat: myLocation.lat, lng: myLocation.lng }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/admin/tutor-matching/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch");
      }

      const data = await res.json();
      setResults(data.tutors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">
        {t("edumatch.admin.matching.title")}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
            {t("edumatch.admin.matching.searchParams")}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                {t("edumatch.admin.matching.latitude")}
              </label>
              <input
                type="number"
                step="any"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
                value={params.lat}
                onChange={(e) => setParams({ ...params, lat: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                {t("edumatch.admin.matching.longitude")}
              </label>
              <input
                type="number"
                step="any"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
                value={params.lng}
                onChange={(e) => setParams({ ...params, lng: parseFloat(e.target.value) })}
              />
            </div>

            {!myLocationLoading && (
              myLocation ? (
                <div className="flex items-center justify-between gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-muted)]">
                  <span>
                    📍 {t("edumatch.admin.matching.savedLocation")}: {myLocation.city || myLocation.label || `${myLocation.lat}, ${myLocation.lng}`}
                  </span>
                  <button
                    type="button"
                    onClick={useMySavedLocation}
                    className="shrink-0 rounded bg-emerald-500/15 px-2 py-1 font-medium text-emerald-400 hover:bg-emerald-500/25"
                  >
                    {t("edumatch.admin.matching.useSavedLocation")}
                  </button>
                </div>
              ) : (
                <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-muted)]">
                  {t("edumatch.admin.matching.noSavedLocation")}{" "}
                  <a
                    href={`${PROFILE_URL}#addresses`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald-400 hover:underline"
                  >
                    {t("edumatch.admin.matching.setLocationLink")}
                  </a>
                </div>
              )
            )}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                {t("edumatch.admin.matching.subject")}
              </label>
              <input
                type="text"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
                value={params.subject}
                onChange={(e) => setParams({ ...params, subject: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                {t("edumatch.admin.matching.gradeLevel")}
              </label>
              <input
                type="text"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
                value={params.gradeLevel}
                onChange={(e) => setParams({ ...params, gradeLevel: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                {t("edumatch.admin.matching.maxDistance")}
              </label>
              <input
                type="number"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
                value={params.maxDistanceKm}
                onChange={(e) => setParams({ ...params, maxDistanceKm: parseFloat(e.target.value) })}
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="preferOnline"
                className="mr-2"
                checked={params.preferOnline}
                onChange={(e) => setParams({ ...params, preferOnline: e.target.checked })}
              />
              <label htmlFor="preferOnline" className="text-sm text-[var(--color-text)]">
                {t("edumatch.admin.matching.preferOnline")}
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                {t("edumatch.admin.matching.limit")}
              </label>
              <input
                type="number"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
                value={params.limit}
                onChange={(e) => setParams({ ...params, limit: parseInt(e.target.value) })}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? t("edumatch.admin.matching.searching") : t("edumatch.admin.matching.findTutors")}
            </button>
          </form>
          {error && (
            <p className="mt-4 text-sm text-red-400">{error}</p>
          )}
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
            {t("edumatch.admin.matching.results")} {results && `(${results.length})`}
          </h2>
          {results === null ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              {t("edumatch.admin.matching.runSearch")}
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              {t("edumatch.admin.matching.noTutors")}
            </p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {results.map((tutor, i) => (
                <div
                  key={tutor.userId}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-[var(--color-text)]">
                      #{i + 1} {tutor.userId}
                    </span>
                    <span className="text-sm rounded bg-emerald-500/15 px-2 py-1 text-emerald-400">
                      {t("edumatch.admin.matching.score")}: {tutor.compositeScore.toFixed(3)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-[var(--color-text)]">
                    <div>
                      <span className="font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.matching.distance")}:</span>{" "}
                      {tutor.distanceKm == null ? t("edumatch.admin.matching.distanceOnline") : `${tutor.distanceKm} km`}
                    </div>
                    <div>
                      <span className="font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.matching.rate")}:</span>{" "}
                      &euro;{(tutor.hourlyRateCents / 100).toFixed(0)}/{t("edumatch.admin.matching.hour")}
                    </div>
                    <div>
                      <span className="font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.matching.rating")}:</span>{" "}
                      {tutor.ratingAvg.toFixed(1)} ({tutor.ratingCount})
                    </div>
                    <div>
                      <span className="font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.matching.onlineOnly")}:</span>{" "}
                      {tutor.onlineOnly ? t("common.yes") : t("common.no")}
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.matching.subjects")}:</span>{" "}
                      {tutor.subjectsTaught.join(", ")}
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.matching.levels")}:</span>{" "}
                      {tutor.levelsTaught.join(", ")}
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.matching.subjectMatch")}:</span>{" "}
                      {tutor.subjectMatch ? "✓" : "✗"}
                      <span className="ml-2 font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.matching.levelMatch")}:</span>{" "}
                      {tutor.levelMatch ? "✓" : "✗"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
