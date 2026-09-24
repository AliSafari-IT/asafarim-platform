"use client";

import { useEffect, useState } from "react";
import type { TasksAiCostTimeline } from "../../../../../lib/ai/cost/read";
import { amountText, attributionLabel, kindLabel, statusBadges, usageText } from "../../../../../lib/ai/cost/format";

type Item = TasksAiCostTimeline["items"][number];

/** Server paints a stable UTC stamp; the viewer's locale/timezone swaps in after hydration. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(`${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`);
  useEffect(() => {
    setText(new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)));
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}

export function RangeNote({ from, to }: { from: string; to: string }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    const f = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    setLocal(`${f.format(new Date(from))} – ${f.format(new Date(to))} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  }, [from, to]);
  return (
    <p className="ta-muted ta-cost__range">
      Totals use UTC day boundaries: {from.slice(0, 16).replace("T", " ")} – {to.slice(0, 16).replace("T", " ")} UTC
      {local ? <> — in your timezone that is {local}.</> : "."}
    </p>
  );
}

export function CostRow({ item, projectName }: { item: Item; projectName?: string | null }) {
  const amount = amountText(item.amountMicros, item.basis);
  return (
    <tr>
      <td className="ta-cost__when">
        <LocalTime iso={item.occurredAt} />
      </td>
      <td>
        <strong>{kindLabel(item.operation)}</strong>
        <div className="ta-muted ta-cost__sub">
          {attributionLabel(item.attribution)}
          {projectName ? ` · ${projectName}` : ""}
        </div>
      </td>
      <td className="ta-cost__model">
        {item.provider} / {item.model}
        <div className="ta-muted ta-cost__sub">
          {item.promptVersion ? `${item.promptVersion} · ` : ""}
          {usageText(item.usage)}
          {item.latencyMs != null ? ` · ${(item.latencyMs / 1000).toFixed(1)}s` : ""}
        </div>
      </td>
      <td>
        {statusBadges(item).map((b) => (
          <span key={b} className="ta-badge ta-cost__badge">
            {b}
          </span>
        ))}
      </td>
      <td className={`ta-cost__amount${amount.unknown ? " ta-cost__amount--unknown" : ""}`} aria-label={amount.aria}>
        {amount.text}
      </td>
    </tr>
  );
}

function CostTable({ items, projects, caption }: { items: Item[]; projects: Record<string, string>; caption: string }) {
  return (
    <div className="ta-cost__scroll">
      <table className="ta-table ta-cost__table">
        <caption className="ta-sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Run</th>
            <th scope="col">Provider / model</th>
            <th scope="col">Status</th>
            <th scope="col" className="ta-cost__amount">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <CostRow key={item.id} item={item} projectName={item.projectId ? projects[item.projectId] : null} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function fetchPage(slug: string, query: string): Promise<TasksAiCostTimeline> {
  const res = await fetch(`/api/v1/workspaces/${slug}/ai/costs?${query}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  const body = await res.json();
  return (body.data ?? body) as TasksAiCostTimeline;
}

/** Paged run list; "Load more" follows the opaque cursor. Totals never change with paging. */
export function RunList({
  slug,
  query,
  initial,
  projects,
  caption,
}: {
  slug: string;
  query: string;
  initial?: { items: Item[]; nextCursor: string | null };
  projects: Record<string, string>;
  caption: string;
}) {
  const [items, setItems] = useState<Item[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [state, setState] = useState<"idle" | "loading" | "error">(initial ? "idle" : "loading");

  useEffect(() => {
    if (initial) return;
    let alive = true;
    fetchPage(slug, query)
      .then((p) => {
        if (!alive) return;
        setItems(p.items);
        setCursor(p.nextCursor);
        setState("idle");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [slug, query, initial]);

  async function more() {
    if (!cursor) return;
    setState("loading");
    try {
      const q = new URLSearchParams(query);
      q.set("cursor", cursor);
      const p = await fetchPage(slug, q.toString());
      setItems((prev) => [...prev, ...p.items]);
      setCursor(p.nextCursor);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      {items.length > 0 ? <CostTable items={items} projects={projects} caption={caption} /> : null}
      {state === "loading" ? (
        <p className="ta-muted" aria-live="polite">
          Loading runs…
        </p>
      ) : null}
      {state === "error" ? <p role="alert">Could not load AI runs.</p> : null}
      {cursor && state === "idle" ? (
        <button type="button" className="ta-btn ta-btn--ghost" onClick={more}>
          Load more runs
        </button>
      ) : null}
    </>
  );
}

/** Lazily-loaded drill-down under a <details> summary. */
export function Drilldown({ slug, query, projects, label }: { slug: string; query: string; projects: Record<string, string>; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="ta-cost__drill" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{label}</summary>
      {open ? <RunList slug={slug} query={query} projects={projects} caption={label} /> : null}
    </details>
  );
}
