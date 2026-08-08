import { type RenderableTimeline } from "./types";

/**
 * Gantt-style layout: each event with a start (and optional end) date gets
 * a duration bar positioned on a shared date axis. Events without a start
 * date are listed separately below the chart rather than silently dropped.
 */
export function GanttTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const dated = timeline.events.filter((e) => e.startAt);
  const undated = timeline.events.filter((e) => !e.startAt);

  if (dated.length === 0) {
    return (
      <div className="tl-root" data-layout="gantt">
        <header className="mb-6">
          <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        </header>
        <p className="text-sm text-[var(--color-text-muted,inherit)]">
          Add a start date to at least one event to see the Gantt chart.
        </p>
      </div>
    );
  }

  const starts = dated.map((e) => new Date(e.startAt!).getTime());
  const ends = dated.map((e) => new Date(e.endAt ?? e.startAt!).getTime());
  const rangeStart = Math.min(...starts);
  const rangeEnd = Math.max(...ends, ...starts);
  const rangeMs = Math.max(rangeEnd - rangeStart, 1000 * 60 * 60 * 24); // at least 1 day wide

  function percent(ms: number) {
    return ((ms - rangeStart) / rangeMs) * 100;
  }

  return (
    <div className="tl-root" data-layout="gantt">
      <header className="mb-6">
        <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? (
          <p className="mt-1 text-[var(--color-text-muted,inherit)]">{timeline.subtitle}</p>
        ) : null}
      </header>

      <div className="flex justify-between text-xs text-[var(--color-text-muted,inherit)]">
        <span>{new Date(rangeStart).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
        <span>{new Date(rangeEnd).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
      </div>

      <ol role="list" className="mt-2 flex flex-col gap-3">
        {dated.map((event, index) => {
          const start = new Date(event.startAt!).getTime();
          const end = new Date(event.endAt ?? event.startAt!).getTime();
          const left = percent(start);
          const width = Math.max(percent(end) - left, 1.5);
          return (
            <li key={event.id ?? index} className="flex items-center gap-3">
              <span className="w-40 flex-shrink-0 truncate text-sm font-medium" title={event.title}>
                {event.title}
              </span>
              <div className="relative h-6 flex-1 rounded bg-[var(--color-border,rgba(0,0,0,0.08))]">
                <div
                  className="absolute top-0 h-full rounded"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: event.accentColor || "var(--tl-accent)",
                  }}
                  title={event.title}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {undated.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-text-muted,inherit)]">
            Not yet scheduled
          </h3>
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
