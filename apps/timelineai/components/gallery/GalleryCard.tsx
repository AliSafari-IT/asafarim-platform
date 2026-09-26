import Link from "next/link";
import { TimelineRenderer } from "@/components/timeline/renderers/TimelineRenderer";
import type { RenderableTimeline } from "@/components/timeline/renderers/types";
import { LAYOUT_LABELS } from "@/lib/labels";
import type { TimelineInput } from "@/lib/schemas";
import { THEME_PRESETS, isWideLayout, resolveThemePreset } from "@/lib/timeline-config";
import { PreviewViewport } from "./PreviewViewport";
import { CardGlyph, dateRangeLabel, type GlyphEvent } from "./CardGlyph";

type Layout = TimelineInput["layout"];

/** Text colour on each theme's ground — THEME_PRESETS only has swatches. */
const THEME_INK: Record<string, string> = {
  canvas: "#1b1730",
  midnight: "#f1eefc",
  editorial: "#241d17",
};

/**
 * A gallery card that flips on hover (or keyboard focus) to show a live,
 * scaled-down render of the timeline itself — the same TimelineRenderer the
 * public page uses, so the preview carries the real layout and theme.
 *
 * The whole card is one link, but the <a> is a stretched overlay rather than
 * a wrapper: the preview can contain the renderers' own buttons, and a
 * button or link nested inside an <a> is invalid HTML (nested <a> is even
 * re-parented by the browser, breaking hydration). The preview is also
 * `inert`, so nothing inside it can take focus or clicks — a click anywhere
 * on either face lands on the overlay and opens the timeline.
 */
export function GalleryCard({
  publicId,
  title,
  subtitle,
  layout,
  eventCount,
  preview,
  glyphEvents,
}: {
  publicId: string;
  title: string;
  subtitle: string | null;
  layout: Layout;
  eventCount: number;
  preview: RenderableTimeline;
  /** Dates of every event (not just the preview's first few), in order. */
  glyphEvents: GlyphEvent[];
}) {
  const preset = THEME_PRESETS.find((p) => p.id === resolveThemePreset(preview.theme?.preset)) ?? THEME_PRESETS[0]!;
  const [bg, surface, accent] = preset.swatch;
  const layoutLabel = LAYOUT_LABELS[layout] ?? layout;
  const events = `${eventCount} event${eventCount === 1 ? "" : "s"}`;
  const range = dateRangeLabel(glyphEvents);

  return (
    <article
      className="gl-card"
      style={{
        ["--gl-bg" as string]: bg,
        ["--gl-surface" as string]: surface,
        ["--gl-accent" as string]: accent,
        ["--gl-ink" as string]: THEME_INK[preset.id] ?? "#1b1730",
      }}
    >
      <div className="gl-card__inner">
        {/* Front */}
        <div className="gl-card__face gl-card__front">
          <div className="gl-card__band">
            <CardGlyph layout={layout} events={glyphEvents} />
            {range ? <span className="gl-card__range">{range}</span> : null}
          </div>
          <div className="gl-card__body">
            <span className="gl-card__badge">{layoutLabel}</span>
            <h2 className="gl-card__title">{title}</h2>
            {subtitle ? <p className="gl-card__subtitle">{subtitle}</p> : null}
            <p className="gl-card__meta">
              <span>{events}</span>
              <span className="gl-card__theme">
                <i aria-hidden="true" /> {preset.name}
              </span>
              <span className="gl-card__hint" aria-hidden="true">
                Hover to preview ↻
              </span>
            </p>
          </div>
        </div>

        {/* Back: the live preview */}
        <div className="gl-card__face gl-card__back" aria-hidden="true" inert>
          <div className="gl-card__back-head">
            <span>Preview · {layoutLabel}</span>
            <span className="gl-card__open">Open timeline →</span>
          </div>
          {/* Narrower than the public page's column on purpose: at full
              width a wide layout shrinks to ~20% and stops being legible;
              a little horizontal cropping reads better in a thumbnail. */}
          <PreviewViewport renderWidth={isWideLayout(layout) ? 820 : 640}>
            <TimelineRenderer layout={layout} timeline={preview} />
          </PreviewViewport>
        </div>
      </div>

      <Link href={`/t/${publicId}`} className="gl-card__link">
        <span className="sr-only">
          Open {title} — {layoutLabel}, {events}
        </span>
      </Link>
    </article>
  );
}
