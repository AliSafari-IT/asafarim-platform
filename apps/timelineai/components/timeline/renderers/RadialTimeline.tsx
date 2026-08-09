import { formatEventDate, type RenderableTimeline } from "./types";

/**
 * Circular/radial layout: events placed evenly around a circle. Best for a
 * handful of events (cyclical processes, yearly cycles) — this is a visual
 * summary, so the full list is still rendered as an accessible fallback
 * below the SVG for keyboard/screen-reader users and small screens.
 */
export function RadialTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const theme = timeline.theme ?? {};
  const events = timeline.events;
  const size = 420;
  const radius = 160;
  const center = size / 2;

  return (
    <div className="tl-layout" data-layout-body="radial">
      <header className="mb-6 text-center">
        <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? (
          <p className="mt-1 text-[var(--tl-text-muted)]">{timeline.subtitle}</p>
        ) : null}
      </header>

      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block max-w-md"
        role="img"
        aria-label={`${timeline.title || "Timeline"}, ${events.length} events arranged in a circle`}
      >
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--tl-connector)" strokeWidth={2} />
        {events.map((event, index) => {
          const angle = (index / Math.max(events.length, 1)) * 2 * Math.PI - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          const labelX = center + (radius + 34) * Math.cos(angle);
          const labelY = center + (radius + 34) * Math.sin(angle);
          return (
            <g key={event.id ?? index}>
              <circle cx={x} cy={y} r={7} fill={event.accentColor || "var(--tl-accent)"} />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-[var(--tl-text)] text-[11px] font-medium"
              >
                {event.title.length > 18 ? `${event.title.slice(0, 16)}…` : event.title}
              </text>
            </g>
          );
        })}
      </svg>

      <ol className="sr-only">
        {events.map((event, index) => (
          <li key={event.id ?? index}>
            {event.title} — {formatEventDate(event, theme.dateFormat)}
          </li>
        ))}
      </ol>

      {/* Visible, accessible detail list beneath the diagram — the circle is a
          summary view, not the only way to consume this timeline's content. */}
      <ol role="list" className="mx-auto mt-8 grid max-w-md gap-3">
        {events.map((event, index) => (
          <li key={event.id ?? index} className="rounded-lg border border-[var(--tl-border)] p-3">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ background: event.accentColor || "var(--tl-accent)" }}
                aria-hidden
              />
              <h3 className="font-semibold">{event.title}</h3>
            </div>
            <time className="text-xs text-[var(--tl-text-muted)]">
              {formatEventDate(event, theme.dateFormat)}
            </time>
            {event.description ? <p className="mt-1 text-sm">{event.description}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
