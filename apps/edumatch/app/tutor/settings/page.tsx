"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

type TutorProfile = {
  bio: string | null;
  subjectsTaught: string[];
  levelsTaught: string[];
  hourlyRateCents: number;
  onlineOnly: boolean;
  serviceRadiusKm: number;
  homeAddress: { formatted?: string } | null;
};

export default function TutorSettingsPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    onlineOnly: false,
    serviceRadiusKm: 10,
    hourlyRateCents: 3000,
  });

  useEffect(() => {
    fetch("/api/tutor/profile")
      .then((r) => r.json())
      .then((data: { profile?: TutorProfile; error?: string }) => {
        if (data.error) throw new Error(data.error);
        if (data.profile) {
          setProfile(data.profile);
          setForm({
            onlineOnly: data.profile.onlineOnly,
            serviceRadiusKm: data.profile.serviceRadiusKm,
            hourlyRateCents: data.profile.hourlyRateCents,
          });
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t("edumatch.tutor.settings.loadFailed"));
        setLoading(false);
      });
  }, []);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/tutor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          ...form,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("edumatch.tutor.settings.saveFailed"));
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("edumatch.tutor.settings.saveFailed"));
    } finally {
      setSaving(false);
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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/tutor" className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--color-text)]">{t("edumatch.tutor.settings.title")}</span>
      </div>

      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{t("edumatch.tutor.settings.title")}</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t("edumatch.tutor.settings.subtitle")}</p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {t("edumatch.tutor.settings.saved")}
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 space-y-6">

        {/* Hourly rate */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1">{t("edumatch.tutor.settings.defaultRate")}</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={form.hourlyRateCents / 100}
            onChange={(e) => setForm((f) => ({ ...f, hourlyRateCents: Math.round(parseFloat(e.target.value) * 100) }))}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{t("edumatch.tutor.settings.defaultRateHint")}</p>
        </div>

        {/* Online only toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">{t("edumatch.tutor.settings.onlineOnly")}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{t("edumatch.tutor.settings.onlineOnlyHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, onlineOnly: !f.onlineOnly }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.onlineOnly ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-strong)]"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.onlineOnly ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>

        {/* Service radius */}
        {!form.onlineOnly && (
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
              {t("edumatch.tutor.settings.serviceRadius")}: <span className="text-[var(--color-primary)]">{form.serviceRadiusKm} km</span>
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={form.serviceRadiusKm}
              onChange={(e) => setForm((f) => ({ ...f, serviceRadiusKm: parseInt(e.target.value) }))}
              className="w-full accent-[var(--color-primary)]"
            />
            <div className="flex justify-between text-xs text-[var(--color-text-muted)] mt-1">
              <span>1 km</span>
              <span>100 km</span>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
          <Link
            href="/tutor/profile"
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            {t("edumatch.tutor.settings.editFullProfile")}</Link>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            {saving ? t("edumatch.profile.tutor.saving") : t("edumatch.tutor.settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
