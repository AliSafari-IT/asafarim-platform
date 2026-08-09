import { formatEventDate, type RenderableTimeline } from "./types";

/** Priority-2 layout: a horizontally scrolling project/roadmap timeline. */
export function HorizontalTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const theme = timeline.theme ?? {};
  const showDates = theme.showDates ?? true;
  const showDescriptions = theme.showDescriptions ?? true;
  const showImages = theme.showImages ?? true;

  return (
    <div className="tl-layout" data-layout-body="horizontal">
      <header className="mb-6">
        <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? (
          <p className="mt-1 text-[var(--tl-text-muted)]">{timeline.subtitle}</p>
        ) : null}
      </header>

      <div className="tl-scroll-x pb-4">
        <ol
          role="list"
          className="relative flex min-w-max gap-8 border-t-2 border-[var(--tl-connector)] pt-6"
          style={{ minWidth: `${Math.max(timeline.events.length, 1) * 220}px` }}
        >
          {timeline.events.map((event, index) => (
            <li key={event.id ?? index} className="relative w-52 flex-shrink-0">
              <span
                className="absolute -top-[calc(1.5rem+5px)] left-0 h-3 w-3 -translate-x-1/2 rounded-full"
                style={{ background: event.accentColor || "var(--tl-accent)" }}
                aria-hidden
              />
              {showDates ? (
                <time className="text-xs text-[var(--tl-text-muted)]">
                  {formatEventDate(event, theme.dateFormat)}
                </time>
              ) : null}
              <h3 className="font-semibold">{event.title}</h3>
              {event.label ? (
                <span className="mt-1 inline-block rounded-full bg-[var(--tl-accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--tl-accent)]">
                  {event.label}
                </span>
              ) : null}
              {showDescriptions && event.description ? (
                <p className="mt-1 text-sm">{event.description}</p>
              ) : null}
              {showImages && event.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.imageUrl} alt="" className="mt-2 max-h-28 w-full rounded-lg object-cover" loading="lazy" />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
