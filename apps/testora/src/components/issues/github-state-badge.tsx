"use client";

import { CircleDot, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type GithubState = "open" | "closed" | null;

export function GithubStateBadge({ state }: { state: GithubState }) {
  if (state === "open") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 shadow-sm dark:text-green-400",
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <CircleDot className="h-3.5 w-3.5" />
        Open
      </span>
    );
  }

  if (state === "closed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600 shadow-sm dark:text-purple-400",
        )}
      >
        <CircleCheck className="h-3.5 w-3.5" />
        Closed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
      Unknown
    </span>
  );
}
