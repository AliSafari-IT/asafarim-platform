"use client";

/**
 * The student avatar picker: a grid of drawn avatars, plus (13+ only) an
 * upload option for a real photo.
 *
 * The client-side `canUpload` gate is a courtesy — the actual boundary is
 * server-side in setStudentAvatar() (lib/server/avatars.ts), which
 * re-derives age from EduStudentProfile.dateOfBirth regardless of what this
 * component sends.
 */

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";

type AvatarOption = { id: string; name: string; src: string };

type AvatarState = {
  current: string;
  isPreset: boolean;
  ageVerified: boolean;
  canUpload: boolean;
  avatars: AvatarOption[];
};

export function AvatarPicker() {
  const { t } = useTranslation();
  const { update } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<AvatarState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/student/avatar");
      if (cancelled) return;
      if (res.ok) setState((await res.json()) as AvatarState);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshSessionImage() {
    // NextAuth's session() callback re-reads token.picture from the DB when
    // trigger === "update", which is exactly what update() sends — so the
    // nav avatar changes without a full sign-out/sign-in.
    await update();
  }

  async function selectPreset(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/student/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "preset", id }),
      });
      const data = (await res.json()) as { image?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? t("edumatch.profile.student.avatar.error"));
        return;
      }
      setState((s) => (s ? { ...s, current: data.image!, isPreset: true } : s));
      await refreshSessionImage();
    } catch {
      setError(t("edumatch.profile.student.avatar.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const presignRes = await fetch("/api/uploads/avatar-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const presign = (await presignRes.json()) as {
        key?: string;
        uploadUrl?: string;
        publicUrl?: string;
        headers?: Record<string, string>;
        isLocalStub?: boolean;
        error?: string;
      };
      if (!presignRes.ok || !presign.key || !presign.uploadUrl || !presign.publicUrl) {
        setError(presign.error ?? t("edumatch.profile.student.avatar.error"));
        return;
      }

      if (!presign.isLocalStub) {
        const putRes = await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: presign.headers,
          body: file,
        });
        if (!putRes.ok) {
          setError(t("edumatch.profile.student.avatar.error"));
          return;
        }
      }

      const applyRes = await fetch("/api/student/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "upload",
          key: presign.key,
          publicUrl: presign.publicUrl,
        }),
      });
      const applied = (await applyRes.json()) as { image?: string; error?: string };
      if (!applyRes.ok) {
        setError(applied.error ?? t("edumatch.profile.student.avatar.error"));
        return;
      }
      setState((s) => (s ? { ...s, current: applied.image!, isPreset: false } : s));
      await refreshSessionImage();
    } catch {
      setError(t("edumatch.profile.student.avatar.error"));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !state) {
    return (
      <div className="border-t border-[var(--color-border)] pt-6">
        <div className="h-24 animate-pulse rounded-lg bg-[var(--color-surface)]" />
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--color-border)] pt-6">
      <h3 className="mb-4 text-sm font-medium text-[var(--color-text)]">
        {t("edumatch.profile.student.avatar.title")}
      </h3>

      <div className="mb-4 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.current}
          alt=""
          referrerPolicy="no-referrer"
          className="h-24 w-24 rounded-full border border-[var(--color-border)] object-cover"
        />
        {!state.canUpload && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("edumatch.profile.student.avatar.under13Message")}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {state.avatars.map((a) => {
          const active = state.isPreset && state.current === a.src;
          return (
            <button
              key={a.id}
              type="button"
              disabled={busy}
              onClick={() => void selectPreset(a.id)}
              title={a.name}
              aria-pressed={active}
              className={`rounded-full border-2 p-0.5 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? "border-[var(--color-primary)]" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.src} alt={a.name} className="h-12 w-12 rounded-full" />
            </button>
          );
        })}
      </div>

      {state.canUpload ? (
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("edumatch.profile.student.avatar.uploadCta")}
          </button>
        </div>
      ) : (
        !state.ageVerified && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.profile.student.dateOfBirthHint")}
          </p>
        )
      )}
    </div>
  );
}
