"use client";

import { useMemo, useState } from "react";
import { formatEventDate, type RenderableTimeline } from "./types";

/**
 * Interactive layout: click-to-expand event detail plus label filters. The
 * export pipeline renders this server-side (no JS) — everything here still
 * needs to make visual sense fully expanded and unfiltered, per spec §6
 * ("retaining a meaningful static export").
 */
export function InteractiveTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const labels = useMemo(
    () => [...new Set(timeline.events.map((e) => e.label).filter((l): l is string => Boolean(l)))],
    [timeline.events]
  );
  const visibleEvents = activeLabel ? timeline.events.filter((e) => e.label === activeLabel) : timeline.events;

  return (
    <div className="tl-root" data-layout="interactive">
      <header className="mb-4">
        <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? (
          <p className="mt-1 text-[var(--color-text-muted,inherit)]">{timeline.subtitle}</p>
        ) : null}
      </header>

      {labels.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${activeLabel === null ? "bg-[var(--tl-accent)] text-white" : "bg-[var(--color-border,rgba(0,0,0,0.08))]"}`}
            onClick={() => setActiveLabel(null)}
            aria-pressed={activeLabel === null}
          >
            All
          </button>
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium ${activeLabel === label ? "bg-[var(--tl-accent)] text-white" : "bg-[var(--color-border,rgba(0,0,0,0.08))]"}`}
              onClick={() => setActiveLabel(label)}
              aria-pressed={activeLabel === label}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <ol role="list" className="flex flex-col gap-2 border-l-2 border-[var(--tl-connector)] pl-4">
        {visibleEvents.map((event, index) => {
          const key = event.id ?? String(index);
          const isOpen = openId === key;
          return (
            <li key={key}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-black/5"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : key)}
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ background: event.accentColor || "var(--tl-accent)" }}
                  aria-hidden
                />
                <span className="font-medium">{event.title}</span>
                <time className="ml-auto text-xs text-[var(--color-text-muted,inherit)]">
                  {formatEventDate(event, timeline.theme?.dateFormat)}
                </time>
              </button>
              {isOpen && event.description ? (
                <p className="ml-6 mt-1 text-sm">{event.description}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
