"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code2,
  ListTree,
  Mic,
  Pencil,
  Rocket,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { RenderableTimeline } from "./types";
import type { TimelineEventInput } from "@/lib/schemas";

/**
 * "Calendar board" layout: a dark, month-column board. Each visible month
 * is a card holding the events that fall inside it, with a left rail of
 * connector dots so it still reads as a timeline rather than a plain
 * agenda list.
 *
 * Like BranchTimeline this commits to its own dark palette instead of
 * following the app's light/dark toggle — it's a distinct visual product,
 * and the export pipeline screenshots it as-is.
 *
 * Two view modes share the same windowed month range:
 *   - "agenda"   — month cards side by side (the default)
 *   - "calendar" — a real day grid per month, events pinned to their day
 * Both render meaningful content with JS off (first window, agenda view),
 * which is what the PNG/PDF export captures.
 */

const MONTHS_PER_PAGE = 3;

const ACCENTS = [
  "#a855f7", // violet
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#14b8a6", // teal
];

const KNOWN_ICONS: Record<string, LucideIcon> = {
  meeting: Users,
  team: Users,
  design: Pencil,
  review: Pencil,
  code: Code2,
  hackathon: Code2,
  engineering: Code2,
  conference: Mic,
  talk: Mic,
  retro: BarChart3,
  report: BarChart3,
  launch: Rocket,
  release: Rocket,
};
const ICON_ROTATION: LucideIcon[] = [Users, Pencil, Code2, Mic, BarChart3, Rocket];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function iconFor(event: TimelineEventInput): LucideIcon {
  const key = (event.icon || event.label || "").trim().toLowerCase();
  if (!key) return Star;
  if (KNOWN_ICONS[key]) return KNOWN_ICONS[key]!;
  return ICON_ROTATION[hashString(key) % ICON_ROTATION.length]!;
}

function colorFor(event: TimelineEventInput, fallbackSeed: number): string {
  if (event.accentColor) return event.accentColor;
  const key = (event.label || event.title || "").trim().toLowerCase();
  if (!key) return ACCENTS[fallbackSeed % ACCENTS.length]!;
  return ACCENTS[hashString(key) % ACCENTS.length]!;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year: year!, month: month! - 1 };
}

function monthLabel(key: string, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long" }) {
  const { year, month } = parseMonthKey(key);
  return new Date(year, month, 1).toLocaleDateString(undefined, opts);
}

function dayChip(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function CalendarBoardTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const [view, setView] = useState<"agenda" | "calendar">("agenda");
  const [page, setPage] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const { months, groups, undated } = useMemo(() => {
    const grouped = new Map<string, TimelineEventInput[]>();
    const without: TimelineEventInput[] = [];
    for (const event of timeline.events) {
      if (!event.startAt) {
        without.push(event);
        continue;
      }
      const key = monthKey(new Date(event.startAt));
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    for (const [, list] of grouped) {
      list.sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime());
    }
    return { months: [...grouped.keys()].sort(), groups: grouped, undated: without };
  }, [timeline.events]);

  const pageCount = Math.max(1, Math.ceil(months.length / MONTHS_PER_PAGE));
  // Clamp rather than store a corrected page: the event list can change
  // underneath us (live editor preview) and a stale page index must not
  // render an empty board.
  const safePage = Math.min(page, pageCount - 1);
  const visibleMonths = months.slice(safePage * MONTHS_PER_PAGE, safePage * MONTHS_PER_PAGE + MONTHS_PER_PAGE);

  const rangeLabel =
    visibleMonths.length === 0
      ? "No dates yet"
      : visibleMonths.length === 1
        ? monthLabel(visibleMonths[0]!)
        : `${monthLabel(visibleMonths[0]!, { month: "short" })} – ${monthLabel(visibleMonths[visibleMonths.length - 1]!)}`;

  const maxCount = Math.max(1, ...visibleMonths.map((key) => groups.get(key)?.length ?? 0));

  return (
    <div
      className="tl-root tl-calendar-board rounded-2xl p-8"
      data-layout="calendar-board"
      style={{
        background: "radial-gradient(120% 90% at 15% 0%, #131034 0%, #0a0a1a 55%, #050510 100%)",
        color: "#f1eefc",
      }}
    >
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{timeline.title || "Untitled timeline"}</h2>
          {timeline.subtitle ? <p className="mt-1 text-white/50">{timeline.subtitle}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-30 disabled:hover:border-white/10"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous months"
            >
              <ChevronLeft size={16} />
            </button>
            <span
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium"
              aria-live="polite"
            >
              {rangeLabel}
            </span>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-30 disabled:hover:border-white/10"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Next months"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1"
            role="group"
            aria-label="View mode"
          >
            {(
              [
                ["agenda", "Agenda", ListTree],
                ["calendar", "Calendar", CalendarDays],
              ] as const
            ).map(([mode, label, Icon]) => {
              const active = view === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
                  style={
                    active
                      ? { background: "rgba(168,85,247,0.18)", boxShadow: "inset 0 0 0 1px #a855f7", color: "#fff" }
                      : { color: "rgba(255,255,255,0.6)" }
                  }
                  onClick={() => setView(mode)}
                  aria-pressed={active}
                >
                  <Icon size={15} aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {months.length === 0 ? (
        <p className="text-sm text-white/50">Add a date to at least one event to see it on the board.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3 md:grid-cols-2">
          {visibleMonths.map((key, monthIndex) => {
            const events = groups.get(key) ?? [];
            const accent = ACCENTS[(safePage * MONTHS_PER_PAGE + monthIndex) % ACCENTS.length]!;
            return (
              <section
                key={key}
                className="rounded-2xl border p-5"
                style={{ borderColor: `${accent}59`, background: "rgba(255,255,255,0.02)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-bold">{monthLabel(key)}</h3>
                  <span
                    className="rounded-full border px-3 py-1 text-xs font-medium"
                    style={{ borderColor: `${accent}80`, color: accent }}
                  >
                    {events.length} {events.length === 1 ? "event" : "events"}
                  </span>
                </div>

                {/* Relative-load bar: how busy this month is against the
                    busiest month currently on screen. */}
                <div className="mt-3 h-0.5 w-full rounded-full bg-white/8" aria-hidden>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(events.length / maxCount) * 100}%`, background: accent }}
                  />
                </div>

                {view === "agenda" ? (
                  <AgendaMonth
                    monthKeyValue={key}
                    events={events}
                    accent={accent}
                    openKey={openKey}
                    onToggle={setOpenKey}
                  />
                ) : (
                  <CalendarMonth monthKeyValue={key} events={events} accent={accent} />
                )}
              </section>
            );
          })}
        </div>
      )}

      {undated.length > 0 ? (
        <div className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-white/50">Undated</h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {undated.map((event, index) => (
              <li key={event.id ?? index} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
                {event.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AgendaMonth({
  monthKeyValue,
  events,
  accent,
  openKey,
  onToggle,
}: {
  monthKeyValue: string;
  events: TimelineEventInput[];
  accent: string;
  openKey: string | null;
  onToggle: (key: string | null) => void;
}) {
  if (events.length === 0) {
    return <p className="mt-5 text-sm text-white/35">No events this month.</p>;
  }

  return (
    <ol role="list" className="mt-5 flex flex-col gap-3">
      {events.map((event, index) => {
        const key = event.id ?? `${monthKeyValue}-${index}`;
        const isOpen = openKey === key;
        const color = colorFor(event, index);
        const Icon = iconFor(event);
        const expandable = Boolean(event.description);

        return (
          <li key={key} className="relative pl-5">
            {/* Left rail: dot per event plus the connector segment down to
                the next one, so the month card still reads as a timeline. */}
            <span
              className="absolute left-0 top-6 h-3 w-3 -translate-x-1/2 rounded-full"
              style={{ background: color, boxShadow: `0 0 10px 1px ${color}` }}
              aria-hidden
            />
            {index < events.length - 1 ? (
              <span
                className="absolute left-0 top-9 bottom-[-1.1rem] w-px -translate-x-1/2"
                style={{ background: `${accent}55` }}
                aria-hidden
              />
            ) : null}

            <div
              className="rounded-xl border p-3"
              style={{
                background: "rgba(255,255,255,0.03)",
                borderColor: isOpen ? color : "rgba(255,255,255,0.08)",
                boxShadow: isOpen ? `0 0 24px -6px ${color}` : undefined,
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-11 flex-shrink-0 flex-col items-center justify-center rounded-lg text-[11px] font-semibold leading-tight"
                  style={{ background: `${color}2e`, color }}
                >
                  {dayChip(event.startAt!)}
                </span>
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: `${color}26`, color }}
                  aria-hidden
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
                {expandable ? (
                  <button
                    type="button"
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white/45 transition hover:text-white"
                    onClick={() => onToggle(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Collapse "${event.title}"` : `Expand "${event.title}"`}
                  >
                    <ChevronRight
                      size={16}
                      style={{ transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform 150ms" }}
                    />
                  </button>
                ) : null}
              </div>

              {isOpen && event.description ? (
                <p className="mt-3 border-t border-white/10 pt-3 text-sm text-white/70">{event.description}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CalendarMonth({
  monthKeyValue,
  events,
  accent,
}: {
  monthKeyValue: string;
  events: TimelineEventInput[];
  accent: string;
}) {
  const { year, month } = parseMonthKey(monthKeyValue);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first grid; getDay() is Sunday-first, so rotate it.
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;

  const byDay = new Map<number, TimelineEventInput[]>();
  for (const event of events) {
    const day = new Date(event.startAt!).getDate();
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  return (
    <div className="mt-5">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-white/35">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dayEvents = byDay.get(day) ?? [];
          const has = dayEvents.length > 0;
          const color = has ? colorFor(dayEvents[0]!, i) : accent;
          return (
            <div
              key={day}
              className="flex aspect-square flex-col items-center justify-center rounded-md text-xs"
              style={
                has
                  ? { background: `${color}26`, color, boxShadow: `inset 0 0 0 1px ${color}66` }
                  : { color: "rgba(255,255,255,0.3)" }
              }
              title={has ? dayEvents.map((e) => e.title).join(", ") : undefined}
            >
              <span className={has ? "font-semibold" : undefined}>{day}</span>
              {dayEvents.length > 1 ? <span className="text-[9px] opacity-80">{dayEvents.length}</span> : null}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-col gap-1.5 text-sm">
        {events.map((event, index) => {
          const color = colorFor(event, index);
          return (
            <li key={event.id ?? index} className="flex items-center gap-2 text-white/70">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              <span className="flex-shrink-0 text-xs text-white/40">{dayChip(event.startAt!)}</span>
              <span className="truncate">{event.title}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
