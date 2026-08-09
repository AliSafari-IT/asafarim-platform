import { formatEventDate, type RenderableTimeline } from "./types";
import type { TimelineEventInput } from "@/lib/schemas";

const UNLABELED = "Other";

/** Roadmap layout: events grouped into swimlanes by their label/category. */
export function RoadmapTimeline({ timeline }: { timeline: RenderableTimeline }) {
  const theme = timeline.theme ?? {};
  const lanes = new Map<string, TimelineEventInput[]>();
  for (const event of timeline.events) {
    const key = event.label || UNLABELED;
    lanes.set(key, [...(lanes.get(key) ?? []), event]);
  }

  return (
    <div className="tl-layout" data-layout-body="roadmap">
      <header className="mb-6">
        <h2 className="text-2xl font-bold">{timeline.title || "Untitled timeline"}</h2>
        {timeline.subtitle ? (
          <p className="mt-1 text-[var(--tl-text-muted)]">{timeline.subtitle}</p>
        ) : null}
      </header>

      <div className="flex flex-col gap-6">
        {[...lanes.entries()].map(([lane, events]) => (
          <section key={lane}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--tl-text-muted)]">
              {lane}
            </h3>
            <ol role="list" className="flex flex-wrap gap-3">
              {events.map((event, index) => (
                <li
                  key={event.id ?? index}
                  className="min-w-48 flex-1 rounded-lg border-t-4 bg-[var(--tl-surface)] p-3"
                  style={{ borderColor: event.accentColor || "var(--tl-accent)" }}
                >
                  <time className="text-xs text-[var(--tl-text-muted)]">
                    {formatEventDate(event, theme.dateFormat)}
                  </time>
                  <div className="font-medium">{event.title}</div>
                  {event.description ? <p className="mt-1 text-sm">{event.description}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
