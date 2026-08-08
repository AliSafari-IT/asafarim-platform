"use client";

import { useState } from "react";
import { ApiError } from "@/lib/client/api";

const FORMATS = [
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPG" },
  { value: "pdf", label: "PDF" },
] as const;

/** Export action for a public timeline — works for guests and signed-in owners alike, per spec §9. */
export function ExportButtons({ publicId }: { publicId: string }) {
  const [pending, setPending] = useState<(typeof FORMATS)[number]["value"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: (typeof FORMATS)[number]["value"]) {
    setPending(format);
    setError(null);
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, format }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new ApiError(payload?.message ?? "Export failed. Please try again.", res.status);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timeline.${format}`;
      // Reuse the server's filename if it sent one via Content-Disposition.
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="([^"]+)"/);
      if (match?.[1]) a.download = match[1];
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            type="button"
            className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={pending !== null}
            aria-busy={pending === f.value || undefined}
            onClick={() => handleExport(f.value)}
          >
            {pending === f.value ? "Exporting…" : `Export ${f.label}`}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
