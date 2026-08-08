import { formatEventDate, type RenderableTimeline } from "./types";

/** Alternating left/right vertical timeline — good for narrative pacing. */
export function ZigzagTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const theme = timeline.theme ?? {};
  const showDates = theme.showDates ?? true;
  const showDescriptions = theme.showDescriptions ?? true;
  const showImages = theme.showImages ?? true;

  return (
    <div className="tl-root" data-layout="zigzag">
      <header className="mb-6 text-center">
        <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? (
          <p className="mt-1 text-[var(--color-text-muted,inherit)]">{timeline.subtitle}</p>
        ) : null}
      </header>

      <ol role="list" className="relative mx-auto max-w-2xl">
        <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-[var(--tl-connector)]" aria-hidden />
        {timeline.events.map((event, index) => {
          const isRight = index % 2 === 1;
          return (
            <li key={event.id ?? index} className="relative mb-8 flex last:mb-0">
              <div className={`w-1/2 ${isRight ? "order-2 pl-8 text-left" : "pr-8 text-right"}`}>
                {showDates ? (
                  <time className="text-xs text-[var(--color-text-muted,inherit)]">
                    {formatEventDate(event, theme.dateFormat)}
                  </time>
                ) : null}
                <h3 className="font-semibold">{event.title}</h3>
                {showDescriptions && event.description ? <p className="mt-1 text-sm">{event.description}</p> : null}
                {showImages && event.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.imageUrl}
                    alt=""
                    className={`mt-2 inline-block max-h-32 rounded-lg object-cover ${isRight ? "" : "ml-auto"}`}
                    loading="lazy"
                  />
                ) : null}
              </div>
              <span
                className="absolute left-1/2 top-1 h-3 w-3 -translate-x-1/2 rounded-full"
                style={{ background: event.accentColor || "var(--tl-accent)" }}
                aria-hidden
              />
              <div className={`w-1/2 ${isRight ? "order-1" : ""}`} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
