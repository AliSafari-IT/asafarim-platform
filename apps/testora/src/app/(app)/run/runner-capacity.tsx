"use client";

import { useEffect, useState } from "react";
import { Clock, Cpu, Loader2, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunQueueInfo } from "@/components/run-provider";

interface Capacity {
  limit: number;
  running: { runId: string; label: string | null; owner: string | null }[];
  queued: { runId: string; label: string | null; owner: string | null; position: number }[];
}

/**
 * Live view of the shared test runners (GET /api/run → capacity), polled while
 * the Run page is open so people know before clicking whether a new run will
 * start right away or wait in the queue.
 */
export function useRunnerCapacity(intervalMs = 5000): Capacity | null {
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/run", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { capacity?: Capacity };
        if (!cancelled && data.capacity) setCapacity(data.capacity);
      } catch {
        /* keep the last known value */
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
  return capacity;
}

function Slots({ busy, limit }: { busy: number; limit: number }) {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      {Array.from({ length: limit }, (_, i) => (
        <span
          key={i}
          className={
            i < busy
              ? "h-2.5 w-5 rounded-sm bg-gradient-to-r from-primary to-accent"
              : "h-2.5 w-5 rounded-sm border border-border bg-muted"
          }
        />
      ))}
    </span>
  );
}

/** One-line status next to the Run button. */
export function RunnerCapacityLine({ capacity }: { capacity: Capacity | null }) {
  if (!capacity) return null;
  const busy = capacity.running.length;
  const full = busy >= capacity.limit;
  const waiting = capacity.queued.length;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <Cpu className="h-3.5 w-3.5" />
      <Slots busy={Math.min(busy, capacity.limit)} limit={capacity.limit} />
      {full
        ? `All ${capacity.limit} runners busy${waiting ? ` · ${waiting} waiting` : ""} — a new run will be queued (#${waiting + 1})`
        : `Runners: ${busy} of ${capacity.limit} busy`}
    </span>
  );
}

/** Shown instead of the progress card while this client's run waits for a runner. */
export function QueuedRunCard({
  queue,
  label,
  capacity,
}: {
  queue: RunQueueInfo;
  label: string;
  capacity: Capacity | null;
}) {
  const others = capacity?.running.map((r) => r.label).filter(Boolean) as string[] | undefined;
  return (
    <Card className="border-amber-400/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-400" />
          Waiting for a free test runner
        </CardTitle>
        <CardDescription>
          All {queue.limit} test runners are busy, so your run of {label} is queued. You&apos;re{" "}
          <strong className="text-foreground">#{queue.position}</strong> in line — it starts automatically
          as soon as a runner frees up. You can keep browsing; it will show up here when it starts.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
          <Slots busy={Math.min(queue.running, queue.limit)} limit={queue.limit} />
          {queue.running} of {queue.limit} runners busy
        </span>
        {others && others.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            Running now: {others.join(" · ")}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
