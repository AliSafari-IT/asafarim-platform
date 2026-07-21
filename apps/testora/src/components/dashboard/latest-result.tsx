"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScreenshotLightbox } from "@/components/results/screenshot-lightbox";
import { Camera } from "lucide-react";

export interface LatestResult {
  id: string;
  status: string;
  title: string;
  screenshot?: string | null;
}

function statusVariant(status: string): "success" | "destructive" | "muted" {
  if (status === "passed") return "success";
  if (status === "failed" || status === "error") return "destructive";
  return "muted";
}

export function LatestResultRow({ result }: { result: LatestResult }) {
  const [open, setOpen] = useState(false);
  const failed = result.status === "failed" || result.status === "error";
  const hasScreenshot = Boolean(result.screenshot);

  return (
    <div className="flex items-center justify-between rounded-md border border-border px-4 py-2">
      <span className="text-sm">{result.title}</span>
      <div className="flex items-center gap-2">
        {failed && hasScreenshot && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="View failure screenshot"
            className="rounded-md p-1 text-amber-500 hover:bg-amber-500/10"
          >
            <Camera className="h-4 w-4" />
          </button>
        )}
        <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
      </div>
      {open && result.screenshot && (
        <ScreenshotLightbox src={result.screenshot} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
