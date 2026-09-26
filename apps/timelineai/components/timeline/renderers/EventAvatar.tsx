import type { ReactNode } from "react";
import type { TimelineEventInput } from "@/lib/schemas";

/**
 * An event's avatar: its image in a circle, ringed in the event's accent.
 *
 * The fallback is layered, not swapped: the initials (or emoji icon, or a
 * layout-supplied `fallback`) are always rendered, and the image sits on
 * top. A missing or broken image therefore reveals the fallback with no
 * JavaScript at all — which matters because the export pipeline screenshots
 * this page, and an onError handler can't be relied on there. The <img>
 * itself has alt="" so a broken image draws nothing (Chromium shows no
 * broken-image icon for an empty alt); the accessible name lives on the
 * wrapper instead.
 *
 * Accessibility: next to a visible title the avatar is decorative, unless
 * the author wrote an image description — then that description is exposed
 * as the image's name.
 */

const SMALL_WORDS = new Set(["a", "an", "the", "of", "and", "to", "in", "on", "for", "at", "with"]);

/** "The first laser shines" → "FL"; "Hubble reaches orbit" → "HR". */
export function initialsFor(title: string): string {
  const words = title
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const significant = words.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  const pick = (significant.length > 0 ? significant : words).slice(0, 2);
  return pick.map((w) => w[0]!.toUpperCase()).join("") || "•";
}

/** Black or white text, whichever reads better on a #rrggbb background. */
export function inkOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // WCAG contrast against white vs the dark ink (#14102b, L ≈ 0.0066);
  // whichever is larger wins.
  const onWhite = 1.05 / (L + 0.05);
  const onDark = (L + 0.05) / 0.0566;
  return onWhite >= onDark ? "#ffffff" : "#14102b";
}

export function EventAvatar({
  event,
  size = 40,
  showIcons = true,
  fallback,
  className = "",
}: {
  event: Pick<TimelineEventInput, "title" | "imageUrl" | "imageAlt" | "icon" | "accentColor">;
  size?: number;
  showIcons?: boolean;
  /** Replaces the initials when the event has no image (e.g. a layout's own icon badge). */
  fallback?: ReactNode;
  className?: string;
}) {
  const accent = event.accentColor || null;
  const described = Boolean(event.imageUrl && event.imageAlt);
  const emoji = showIcons && event.icon ? event.icon : null;

  return (
    <span
      className={`tl-avatar ${className}`}
      style={{
        width: size,
        height: size,
        ["--tl-avatar-accent" as string]: accent ?? "var(--tl-accent)",
        ["--tl-avatar-ink" as string]: accent ? inkOn(accent) : "var(--tl-accent-contrast)",
        fontSize: Math.round(size * (emoji ? 0.5 : 0.38)),
      }}
      {...(described ? { role: "img", "aria-label": event.imageAlt! } : { "aria-hidden": true })}
    >
      {fallback && !event.imageUrl ? (
        fallback
      ) : (
        <span className="tl-avatar__fallback">{emoji ?? initialsFor(event.title)}</span>
      )}
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- rendered outside Next's image pipeline too (export)
        <img className="tl-avatar__img" src={event.imageUrl} alt="" loading="lazy" decoding="async" />
      ) : null}
    </span>
  );
}

/**
 * The same avatar inside an SVG (the Circular layout draws its ring in SVG).
 * Same layering: accent disc + initials underneath, a clipped <image> on
 * top, which simply draws nothing if it fails to load.
 */
export function SvgEventAvatar({
  event,
  cx,
  cy,
  r,
  clipId,
  showIcons = true,
}: {
  event: Pick<TimelineEventInput, "title" | "imageUrl" | "icon" | "accentColor">;
  cx: number;
  cy: number;
  r: number;
  clipId: string;
  showIcons?: boolean;
}) {
  const accent = event.accentColor || "var(--tl-accent)";
  const ink = event.accentColor ? inkOn(event.accentColor) : "var(--tl-accent-contrast)";
  const emoji = showIcons && event.icon ? event.icon : null;
  return (
    <g aria-hidden>
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r + 2.5} fill="var(--tl-bg)" stroke={accent} strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={r} fill={accent} />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill={ink}
        fontSize={r * (emoji ? 1 : 0.8)}
        fontWeight={700}
      >
        {emoji ?? initialsFor(event.title)}
      </text>
      {event.imageUrl ? (
        <image
          href={event.imageUrl}
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
      ) : null}
    </g>
  );
}
