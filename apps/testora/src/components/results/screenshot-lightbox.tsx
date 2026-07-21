"use client";

import { useState } from "react";

/**
 * Fullscreen magnifier for a failure screenshot (a data-URL PNG). Click the
 * backdrop/image or Close to dismiss; toggle between fit-to-screen and 1:1
 * (which scrolls/pans so fine detail is readable). Shared by the Results page
 * and the live Run results panel.
 */
export function ScreenshotLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  const [actual, setActual] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm text-white/90">
        <span className="font-medium">Screenshot at failure</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActual((v) => !v);
            }}
            className="rounded-md border border-white/30 px-2.5 py-1 text-xs hover:bg-white/10"
          >
            {actual ? "Fit to screen" : "Actual size (1:1)"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/30 px-2.5 py-1 text-xs hover:bg-white/10"
          >
            Close ✕
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Screenshot at failure (magnified)"
          onClick={(e) => {
            e.stopPropagation();
            setActual((v) => !v);
          }}
          className={
            actual
              ? "max-w-none cursor-zoom-out"
              : "mx-auto max-h-full max-w-full cursor-zoom-in object-contain"
          }
        />
      </div>
    </div>
  );
}
