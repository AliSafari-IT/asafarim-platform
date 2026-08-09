"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  DollarSign,
  Users,
  Rocket,
  Star,
  Grid2x2,
  Plus,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { formatEventDate, type RenderableTimeline } from "./types";
import type { TimelineEventInput } from "@/lib/schemas";

/**
 * "Branching" interactive layout: a horizontal connector with cards
 * alternating above/below, category icon badges, filter pills, and a
 * click-to-expand detail panel. Deliberately self-contained dark styling
 * (not the app's light/dark toggle) — this is a distinct visual product,
 * same way a themed poster doesn't repaint itself for the room it's in.
 * Content and interaction still follow the same rules every other layout
 * does: same event data, same filter-by-label pattern as
 * InteractiveTimeline, and it still needs to read sensibly with JS off
 * for the export pipeline (every card renders un-expanded, which is a
 * meaningful static view on its own).
 */

// A handful of common category keywords get a matching icon; anything
// else falls back to a deterministic pick from the same rotation so two
// timelines with an unrecognized label like "Legal" still get a stable,
// distinct icon+color instead of one grey default for everything.
const KNOWN_ICONS: Record<string, LucideIcon> = {
  company: Building2,
  funding: DollarSign,
  sales: Users,
  customer: Users,
  product: Rocket,
  launch: Rocket,
  milestone: Star,
};
const ICON_ROTATION: LucideIcon[] = [Building2, DollarSign, Users, Rocket, Star];

const COLOR_ROTATION = [
  "#38bdf8", // sky
  "#2dd4bf", // teal
  "#f87171", // red
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#34d399", // emerald
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function iconFor(label: string | null | undefined): LucideIcon {
  if (!label) return Star;
  const key = label.trim().toLowerCase();
  if (KNOWN_ICONS[key]) return KNOWN_ICONS[key]!;
  return ICON_ROTATION[hashString(key) % ICON_ROTATION.length]!;
}

function colorFor(event: TimelineEventInput, label: string | null | undefined): string {
  if (event.accentColor) return event.accentColor;
  if (!label) return COLOR_ROTATION[0]!;
  return COLOR_ROTATION[hashString(label.trim().toLowerCase()) % COLOR_ROTATION.length]!;
}

export function BranchTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const labels = useMemo(
    () => [...new Set(timeline.events.map((e) => e.label).filter((l): l is string => Boolean(l)))],
    [timeline.events]
  );
  const visibleEvents = activeLabel ? timeline.events.filter((e) => e.label === activeLabel) : timeline.events;

  return (
    <div
      className="tl-root tl-branch rounded-2xl p-8"
      data-layout="branch"
      style={{ background: "#0a0a1a", color: "#f1eefc" }}
    >
      <header className="mb-6">
        <h2 className="text-3xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? <p className="mt-1 text-white/60">{timeline.subtitle}</p> : null}
      </header>

      {labels.length > 0 ? (
        <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition"
            style={
              activeLabel === null
                ? { background: "linear-gradient(135deg,#7c3aed,#4f46e5)", borderColor: "transparent", color: "#fff" }
                : { borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)" }
            }
            onClick={() => setActiveLabel(null)}
            aria-pressed={activeLabel === null}
          >
            <Grid2x2 size={15} aria-hidden />
            All
          </button>
          {labels.map((label) => {
            const Icon = iconFor(label);
            const color = colorFor({ accentColor: null } as TimelineEventInput, label);
            const active = activeLabel === label;
            return (
              <button
                key={label}
                type="button"
                className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition"
                style={
                  active
                    ? { background: `${color}26`, borderColor: color, color }
                    : { borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)" }
                }
                onClick={() => setActiveLabel(active ? null : label)}
                aria-pressed={active}
              >
                <Icon size={15} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max items-stretch">
          {visibleEvents.map((event, index) => {
            const key = event.id ?? String(index);
            const isOpen = openKey === key;
            const above = index % 2 === 0;
            const Icon = iconFor(event.label);
            const color = colorFor(event, event.label);
            const card = (
              <EventCard event={event} color={color} Icon={Icon} isOpen={isOpen} onToggle={() => setOpenKey(isOpen ? null : key)} />
            );

            return (
              <div key={key} className="flex w-56 flex-shrink-0 flex-col px-3">
                {/* Reserved-height slot above the connector line — every
                    column reserves the same space whether or not its card
                    lives here, so the connector dots stay level across
                    alternating columns without needing CSS subgrid. */}
                <div className="flex min-h-40 items-end pb-6">{above ? card : null}</div>

                <div className="relative flex items-center" style={{ height: 4 }}>
                  <div
                    className="absolute inset-y-0 left-0 right-0 my-auto"
                    style={{ height: 2, background: "linear-gradient(90deg,#4338ca,#7c3aed)" }}
                    aria-hidden
                  />
                  <span
                    className="relative mx-auto h-4 w-4 rounded-full"
                    style={{ background: color, boxShadow: `0 0 12px 2px ${color}` }}
                    aria-hidden
                  />
                </div>

                <div className="flex min-h-40 items-start pt-6">{!above ? card : null}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventCard({
  event,
  color,
  Icon,
  isOpen,
  onToggle,
}: {
  event: TimelineEventInput;
  color: string;
  Icon: LucideIcon;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background: "rgba(255,255,255,0.04)",
        borderColor: isOpen ? color : "rgba(255,255,255,0.1)",
        boxShadow: isOpen ? `0 0 0 1px ${color}, 0 0 24px -4px ${color}` : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: `${color}26`, color }}
          aria-hidden
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-white">{event.title}</h3>
          <time className="flex items-center gap-1 text-xs text-white/50">{formatEventDate(event)}</time>
        </div>
        {event.description ? (
          <button
            type="button"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 hover:border-white/40 hover:text-white"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse "${event.title}"` : `Expand "${event.title}"`}
          >
            {isOpen ? <ChevronUp size={14} /> : <Plus size={14} />}
          </button>
        ) : null}
      </div>
      {isOpen && event.description ? (
        <p className="mt-3 border-t border-white/10 pt-3 text-sm text-white/75">{event.description}</p>
      ) : null}
    </div>
  );
}
