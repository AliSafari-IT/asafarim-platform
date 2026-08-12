"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { ContextualHelpLink } from "@/components/help/ContextualHelpLink";

const SUBJECTS_LIST = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Geography",
  "Computer Science",
  "Economics",
  "Art",
  "Music",
  "Languages",
  "Other",
];

const SUBJECT_KEY_BY_LABEL: Record<string, string> = {
  Mathematics: "mathematics",
  Physics: "physics",
  Chemistry: "chemistry",
  Biology: "biology",
  English: "english",
  History: "history",
  Geography: "geography",
  "Computer Science": "computerScience",
  Economics: "economics",
  Art: "art",
  Music: "music",
  Languages: "languages",
  Other: "other",
};

type Profile = {
  bio?: string;
  subjectsTaught: string[];
  levelsTaught: ("K12" | "UNDERGRAD" | "GRAD")[];
  hourlyRateCents: number;
  onlineOnly: boolean;
  serviceRadiusKm: number;
  homeAddress?: {
    line1?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  // Resolved coordinates (Prisma columns, not part of the homeAddress JSON
  // blob) — set either from this form or, if left blank, copied from the
  // shared platform profile location. See upsertTutorProfile in profiles.ts.
  homeLat?: number | null;
  homeLng?: number | null;
};

export default function TutorProfilePage() {
  const { t } = useTranslation();

  const GRADE_LEVELS: { value: "K12" | "UNDERGRAD" | "GRAD"; label: string }[] =
    [
      { value: "K12", label: t("edumatch.inquiry.new.grade.k12") },
      { value: "UNDERGRAD", label: t("edumatch.inquiry.new.grade.undergrad") },
      { value: "GRAD", label: t("edumatch.inquiry.new.grade.grad") },
    ];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  const [bio, setBio] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [levels, setLevels] = useState<("K12" | "UNDERGRAD" | "GRAD")[]>([]);
  const [hourlyRate, setHourlyRate] = useState(25);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [serviceRadius, setServiceRadius] = useState(10);
  const [address, setAddress] = useState({
    line1: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    lat: null as number | null,
    lng: null as number | null,
  });
  const [locating, setLocating] = useState(false);
  const [locationSource, setLocationSource] = useState<"browser" | "manual" | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tutor/profile")
      .then(async (r) => {
        if (r.ok) {
          const data: Profile = await r.json();
          setExists(true);
          setBio(data.bio ?? "");
          setSubjects(data.subjectsTaught ?? []);
          setLevels(data.levelsTaught ?? []);
          setHourlyRate(Math.round(data.hourlyRateCents / 100));
          setOnlineOnly(data.onlineOnly ?? false);
          setServiceRadius(data.serviceRadiusKm ?? 10);
          setAddress({
            line1: data.homeAddress?.line1 ?? "",
            city: data.homeAddress?.city ?? "",
            region: data.homeAddress?.region ?? "",
            postalCode: data.homeAddress?.postalCode ?? "",
            country: data.homeAddress?.country ?? "",
            lat: data.homeLat ?? null,
            lng: data.homeLng ?? null,
          });
        }
      })
      .catch(() => { /* profile fetch failed — leave form in create mode */ })
      .finally(() => setLoading(false));
  }, []);

  function handleUseMyLocation() {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError(t("edumatch.profile.tutor.location.unsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAddress((prev) => ({
          ...prev,
          lat: Math.round(position.coords.latitude * 1e6) / 1e6,
          lng: Math.round(position.coords.longitude * 1e6) / 1e6,
        }));
        setLocationSource("browser");
        setLocating(false);
      },
      (err) => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? t("edumatch.profile.tutor.location.denied")
            : t("edumatch.profile.tutor.location.failed"),
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const payload = {
      bio: bio || undefined,
      subjectsTaught: subjects,
      levelsTaught: levels,
      hourlyRateCents: hourlyRate * 100,
      onlineOnly,
      serviceRadiusKm: onlineOnly ? 0 : serviceRadius,
      homeAddress:
        address.line1 || address.city || address.lat != null
          ? {
              ...address,
              lat: address.lat ?? undefined,
              lng: address.lng ?? undefined,
            }
          : undefined,
    };

    try {
      const res = await fetch("/api/tutor/profile", {
        method: exists ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? t("edumatch.profile.tutor.saveFailed"));
        setSaving(false);
        // Unlike the network-error and success paths below, this branch was
        // missing the scroll — the notice renders above the form, but the
        // viewport is still scrolled down near the submit button after a
        // failed submit, so the error was invisible unless the user
        // happened to scroll up. That reads as "nothing happened," and is
        // exactly the reported symptom: fill the form, click submit, see
        // no visible result, assume it saved, find it didn't next login.
        noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      setSuccess(true);
      setExists(true);
      noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError(t("edumatch.inquiry.new.networkError"));
      noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex h-[40vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/tutor"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
        >
          {t("edumatch.profile.tutor.backToDashboard")}
        </Link>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          {exists
            ? t("edumatch.profile.tutor.title.edit")
            : t("edumatch.profile.tutor.title.create")}
        </h1>
        <ContextualHelpLink href="/help/tutors/getting-started" />
      </div>
      <p className="text-[var(--color-text-muted)] mb-6">
        {exists
          ? t("edumatch.profile.tutor.subtitle.edit")
          : t("edumatch.profile.tutor.subtitle.create")}
      </p>

      <div ref={noticeRef}>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700 flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
            {t("edumatch.profile.tutor.savedOk")}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            {t("edumatch.profile.tutor.bio.label")}
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder={t("edumatch.profile.tutor.bio.placeholder")}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.profile.tutor.bio.chars", { n: bio.length })}
          </p>
        </div>

        {/* Subjects Taught */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            {t("edumatch.profile.tutor.subjects.label")}
          </label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS_LIST.map((s) => {
              const active = subjects.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setSubjects((prev) =>
                      active ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[#07101a]"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  {t(`edumatch.subject.${SUBJECT_KEY_BY_LABEL[s]}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Levels Taught */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            {t("edumatch.profile.tutor.levels.label")}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {GRADE_LEVELS.map((g) => {
              const active = levels.includes(g.value);
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() =>
                    setLevels((prev) =>
                      active
                        ? prev.filter((x) => x !== g.value)
                        : [...prev, g.value],
                    )
                  }
                  className={`rounded-lg border px-3 py-3 text-sm font-medium text-center transition ${
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[#07101a]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hourly Rate */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            {t("edumatch.profile.tutor.rate.label")}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="10"
              max="200"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              className="flex-1"
            />
            <div className="w-20">
              <input
                type="number"
                min="10"
                max="200"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>
        </div>

        {/* Online/In-person */}
        <div className="flex items-center gap-3 p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <input
            type="checkbox"
            id="onlineOnly"
            checked={onlineOnly}
            onChange={(e) => setOnlineOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
          />
          <label
            htmlFor="onlineOnly"
            className="text-sm text-[var(--color-text)]"
          >
            {t("edumatch.profile.tutor.onlineOnly.label")}
          </label>
        </div>

        {/* Service Radius (only if not online-only) */}
        {!onlineOnly && (
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
              {t("edumatch.profile.tutor.radius.label")}
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="100"
                value={serviceRadius}
                onChange={(e) => setServiceRadius(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-12 text-sm text-[var(--color-text)] text-right">
                {serviceRadius}km
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {t("edumatch.profile.tutor.radius.hint")}
            </p>
          </div>
        )}

        {/* Address */}
        <div className="border-t border-[var(--color-border)] pt-6">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-4">
            {onlineOnly
              ? t("edumatch.profile.tutor.address.optional")
              : t("edumatch.profile.tutor.address.required")}
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder={t("edumatch.profile.tutor.address.street")}
              value={address.line1}
              onChange={(e) =>
                setAddress({ ...address, line1: e.target.value })
              }
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t("edumatch.profile.tutor.address.city")}
                value={address.city}
                onChange={(e) =>
                  setAddress({ ...address, city: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <input
                type="text"
                placeholder={t("edumatch.profile.tutor.address.region")}
                value={address.region}
                onChange={(e) =>
                  setAddress({ ...address, region: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t("edumatch.profile.tutor.address.postalCode")}
                value={address.postalCode}
                onChange={(e) =>
                  setAddress({ ...address, postalCode: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <input
                type="text"
                placeholder={t("edumatch.profile.tutor.address.country")}
                value={address.country}
                onChange={(e) =>
                  setAddress({ ...address, country: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            {/* Coordinates — what tutor-matching.ts actually uses to compute
                distance. The text address above is display-only for
                students; without lat/lng an in-person tutor simply can't be
                found by "tutors near me" searches. */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--color-text)]">
                  {t("edumatch.profile.tutor.location.label")}
                </span>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  className="rounded-md bg-[var(--color-primary)]/15 px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 disabled:opacity-50 transition"
                >
                  {locating
                    ? t("edumatch.profile.tutor.location.locating")
                    : `📍 ${t("edumatch.profile.tutor.location.useMyLocation")}`}
                </button>
              </div>

              {address.lat != null && address.lng != null && (
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  {locationSource === "browser"
                    ? t("edumatch.profile.tutor.location.detected")
                    : t("edumatch.profile.tutor.location.set")}
                </p>
              )}
              {locationError && (
                <p className="mt-2 text-xs text-red-500">{locationError}</p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="tutor-lat"
                    className="mb-1 block text-xs text-[var(--color-text-muted)]"
                  >
                    {t("edumatch.profile.tutor.location.latitude")}
                  </label>
                  <input
                    id="tutor-lat"
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    placeholder="e.g. 50.8503"
                    value={address.lat ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAddress({ ...address, lat: v === "" ? null : Number(v) });
                      setLocationSource("manual");
                    }}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="tutor-lng"
                    className="mb-1 block text-xs text-[var(--color-text-muted)]"
                  >
                    {t("edumatch.profile.tutor.location.longitude")}
                  </label>
                  <input
                    id="tutor-lng"
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    placeholder="e.g. 4.3517"
                    value={address.lng ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAddress({ ...address, lng: v === "" ? null : Number(v) });
                      setLocationSource("manual");
                    }}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>

              {!onlineOnly && address.lat == null && (
                <p className="mt-2 text-xs text-amber-500">
                  {t("edumatch.profile.tutor.location.missingWarning")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Link
            href="/tutor"
            className="rounded-lg border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)] transition"
          >
            {t("edumatch.profile.tutor.cancel")}
          </Link>
          <button
            type="submit"
            disabled={saving || subjects.length === 0 || levels.length === 0}
            className="flex-1 rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-[#07101a] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t("edumatch.profile.tutor.saving")}
              </>
            ) : exists ? (
              t("edumatch.profile.tutor.save")
            ) : (
              t("edumatch.profile.tutor.create")
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
