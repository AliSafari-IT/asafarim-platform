export const VISUAL_STYLE_VALUES = [
  "film_grain",
  "polaroid_memory",
  "clean_modern_slideshow",
  "travel_map_overlay",
  "vhs_archive",
  "wedding_cinematic",
  "social_vertical_captions",
] as const;

export type VisualStyle = (typeof VISUAL_STYLE_VALUES)[number];

export const DEFAULT_VISUAL_STYLE: VisualStyle = "clean_modern_slideshow";

export const VISUAL_STYLE_OPTIONS = [
  { labelKey: "vionto.visualStyle.film_grain", descriptionKey: "vionto.visualStyle.film_grain.description", value: "film_grain" },
  { labelKey: "vionto.visualStyle.polaroid_memory", descriptionKey: "vionto.visualStyle.polaroid_memory.description", value: "polaroid_memory" },
  { labelKey: "vionto.visualStyle.clean_modern_slideshow", descriptionKey: "vionto.visualStyle.clean_modern_slideshow.description", value: "clean_modern_slideshow" },
  { labelKey: "vionto.visualStyle.travel_map_overlay", descriptionKey: "vionto.visualStyle.travel_map_overlay.description", value: "travel_map_overlay" },
  { labelKey: "vionto.visualStyle.vhs_archive", descriptionKey: "vionto.visualStyle.vhs_archive.description", value: "vhs_archive" },
  { labelKey: "vionto.visualStyle.wedding_cinematic", descriptionKey: "vionto.visualStyle.wedding_cinematic.description", value: "wedding_cinematic" },
  { labelKey: "vionto.visualStyle.social_vertical_captions", descriptionKey: "vionto.visualStyle.social_vertical_captions.description", value: "social_vertical_captions" },
] as const satisfies ReadonlyArray<{
  labelKey: string;
  descriptionKey: string;
  value: VisualStyle;
}>;

export function normalizeVisualStyle(value: unknown): VisualStyle {
  return VISUAL_STYLE_VALUES.includes(value as VisualStyle)
    ? value as VisualStyle
    : DEFAULT_VISUAL_STYLE;
}
