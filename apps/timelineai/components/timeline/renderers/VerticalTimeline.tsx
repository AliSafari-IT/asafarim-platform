import { formatEventDate, type RenderableTimeline } from "./types";
import { resolveImageStyle } from "@/lib/timeline-config";
import { EventAvatar } from "./EventAvatar";

/** Priority-1 layout: a classic vertical storytelling/historical timeline. */
export function VerticalTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const theme = timeline.theme ?? {};
  const showDates = theme.showDates ?? true;
  const showDescriptions = theme.showDescriptions ?? true;
  const imageStyle = resolveImageStyle(theme);
  const showIcons = theme.showIcons ?? true;
  const avatars = imageStyle === "avatar";

  return (
    <div className="tl-layout" data-layout-body="vertical">
      <header className="mb-6">
        <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? (
          <p className="mt-1 text-[var(--tl-text-muted)]">{timeline.subtitle}</p>
        ) : null}
      </header>

      {/* Avatar mode widens the gutter so a 40px avatar centred on the rail
          clears the text; the dot mode keeps the original tight rail. */}
      <ol
        className={`relative border-l-2 border-[var(--tl-connector)] ${avatars ? "ml-6 pl-10" : "ml-3 pl-6"}`}
        role="list"
      >
        {timeline.events.map((event, index) => (
          <li key={event.id ?? index} className="relative mb-8 last:mb-0">
            {avatars ? (
              <EventAvatar
                event={event}
                size={40}
                showIcons={showIcons}
                className="absolute -left-[calc(2.5rem+21px)] -top-1"
              />
            ) : (
              <span
                className="absolute -left-[calc(1.5rem+5px)] top-1 h-3 w-3 rounded-full"
                style={{ background: event.accentColor || "var(--tl-accent)" }}
                aria-hidden
              />
            )}
            <div className="flex flex-wrap items-baseline gap-2">
              {showIcons && event.icon && !avatars ? <span aria-hidden>{event.icon}</span> : null}
              <h3 className="font-semibold">{event.title}</h3>
              {event.label ? (
                <span className="rounded-full bg-[var(--tl-accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--tl-accent)]">
                  {event.label}
                </span>
              ) : null}
            </div>
            {showDates ? (
              <time className="text-sm text-[var(--tl-text-muted)]">
                {formatEventDate(event, theme.dateFormat)}
              </time>
            ) : null}
            {showDescriptions && event.description ? (
              <p className="mt-1 text-sm">{event.description}</p>
            ) : null}
            {imageStyle === "banner" && event.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- exported/rendered outside Next's image pipeline too
              <img
                src={event.imageUrl}
                alt={event.imageAlt || event.title}
                className="mt-2 max-h-48 rounded-lg object-cover"
                loading="lazy"
              />
            ) : null}
            {event.link ? (
              <a href={event.link} className="mt-1 inline-block text-sm underline" target="_blank" rel="noreferrer">
                Learn more
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
