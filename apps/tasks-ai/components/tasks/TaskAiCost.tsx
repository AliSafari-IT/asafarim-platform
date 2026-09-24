"use client";

import { useEffect, useState } from "react";
import type { TaskCostView } from "../../lib/ai/cost/read";
import { amountText, kindLabel } from "../../lib/ai/cost/format";
import { formatMicros } from "@asafarim/ai-cost-ledger";

/**
 * A task's AI provider cost (issue #591), inside the task drawer. Shows
 * runs attributed *to this task* as its subtotal, and lists shared project
 * runs that created or touched it — with their amount, explicitly marked
 * as counted on the project and **not** added here.
 */
export function TaskAiCost({ slug, taskId }: { slug: string; taskId: string }) {
  const [view, setView] = useState<TaskCostView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/workspaces/${slug}/ai/costs/tasks/${encodeURIComponent(taskId)}`)
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) return setState("hidden");
        const body = await res.json();
        setView((body.data ?? body) as TaskCostView);
        setState("ready");
      })
      .catch(() => alive && setState("hidden"));
    return () => {
      alive = false;
    };
  }, [slug, taskId]);

  if (state !== "ready" || !view) return null;
  if (view.direct.eventCount === 0 && view.sharedRuns.length === 0) return null;
  const direct =
    view.direct.eventCount > 0 && view.direct.knownCount === 0 ? "Not tracked" : formatMicros(BigInt(view.direct.effectiveKnownMicros));

  return (
    <section className="ta-drawer__cost" aria-labelledby="td-ai-cost">
      <h3 id="td-ai-cost">AI cost (this year)</h3>
      <dl>
        <dt>Runs on this task ({view.direct.eventCount})</dt>
        <dd>{direct}</dd>
      </dl>
      {view.sharedRuns.length > 0 ? (
        <>
          <p className="ta-hint">
            Shared project runs that created or touched this task — counted once on the project, not in this
            task&apos;s total:
          </p>
          <ul>
            {view.sharedRuns.map((r) => {
              const a = amountText(r.amountMicros, r.basis);
              return (
                <li key={r.id}>
                  {kindLabel(r.operation)} · shared project run ({r.role}) —{" "}
                  <span aria-label={`${a.aria}, not included in this task`}>{a.text}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <a className="ta-link" href={`/w/${slug}/analytics/ai-costs?task=${encodeURIComponent(taskId)}&preset=year`}>
        Open in AI cost
      </a>
    </section>
  );
}
