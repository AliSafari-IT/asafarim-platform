import type { ThemeSettings, TimelineEventInput } from "@/lib/schemas";

/** Renderer-agnostic shape every layout component consumes. Presentation
 * (theme) is always separate from content (title/events) — switching
 * layout never touches this data. */
export interface RenderableTimeline {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  theme?: ThemeSettings | null;
  events: TimelineEventInput[];
}

export function formatEventDate(event: TimelineEventInput, dateFormat?: string): string {
  if (event.displayDate) return event.displayDate;
  if (!event.startAt) return "";
  const locale = dateFormat === "iso" ? "sv-SE" : undefined; // sv-SE ~= YYYY-MM-DD
  const start = new Date(event.startAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  if (!event.endAt) return start;
  const end = new Date(event.endAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${start} – ${end}`;
}
