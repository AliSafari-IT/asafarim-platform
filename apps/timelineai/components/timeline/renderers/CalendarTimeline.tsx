import { type RenderableTimeline } from "./types";
import type { TimelineEventInput } from "@/lib/schemas";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year!, month! - 1, 1).toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

/** Calendar-based layout: events grouped into the month they fall in. */
export function CalendarTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const dated = timeline.events.filter((e): e is TimelineEventInput & { startAt: string } => Boolean(e.startAt));
  const undated = timeline.events.filter((e) => !e.startAt);

  const groups = new Map<string, TimelineEventInput[]>();
  for (const event of dated) {
    const key = monthKey(new Date(event.startAt));
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const sortedKeys = [...groups.keys()].sort();

  return (
    <div className="tl-layout" data-layout-body="calendar">
      <header className="mb-6">
        <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? (
          <p className="mt-1 text-[var(--tl-text-muted)]">{timeline.subtitle}</p>
        ) : null}
      </header>

      {sortedKeys.length === 0 ? (
        <p className="text-sm text-[var(--tl-text-muted)]">
          Add a date to at least one event to see it on the calendar.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {sortedKeys.map((key) => (
            <section key={key}>
              <h3 className="mb-2 font-semibold">{monthLabel(key)}</h3>
              <ol role="list" className="grid gap-2 sm:grid-cols-2">
                {groups
                  .get(key)!
                  .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())
                  .map((event, index) => (
                    <li
                      key={event.id ?? index}
                      className="rounded-lg border-l-4 bg-[var(--tl-surface)] p-3"
                      style={{ borderColor: event.accentColor || "var(--tl-accent)" }}
                    >
                      <time className="text-xs text-[var(--tl-text-muted)]">
                        {new Date(event.startAt!).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      </time>
                      <div className="font-medium">{event.title}</div>
                      {event.description ? <p className="mt-1 text-sm">{event.description}</p> : null}
                    </li>
                  ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {undated.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-[var(--tl-text-muted)]">Undated</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {undated.map((event, index) => (
              <li key={event.id ?? index}>{event.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
