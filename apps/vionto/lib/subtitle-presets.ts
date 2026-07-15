import type { SubtitleStyle } from "./server/render-manifest";

export type SubtitlePresetId =
  | "minimal_clean"
  | "cinematic_lower_third"
  | "social_bold"
  | "documentary"
  | "high_contrast"
  | "elegant_memory";

export type SubtitlePreset = {
  id: SubtitlePresetId;
  labelKey: string;
  descriptionKey: string;
  style: SubtitleStyle;
};

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: "minimal_clean",
    labelKey: "vionto.subtitlePreset.minimal_clean",
    descriptionKey: "vionto.subtitlePreset.minimal_clean.description",
    style: {
      fontName: "Arial",
      fontSize: 22,
      fontWeight: "normal",
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 1,
      backgroundColor: "transparent",
      backgroundOpacity: 0,
      borderRadius: 0,
      padding: 4,
      shadow: false,
      shadowColor: "#000000",
      shadowOffset: 2,
      position: "bottom",
      alignment: "center",
      marginV: 40,
      marginH: 40,
      maxLineWidth: 42,
      maxLines: 2,
      textTransform: "preserve",
    },
  },
  {
    id: "cinematic_lower_third",
    labelKey: "vionto.subtitlePreset.cinematic_lower_third",
    descriptionKey: "vionto.subtitlePreset.cinematic_lower_third.description",
    style: {
      fontName: "Georgia",
      fontSize: 28,
      fontWeight: "normal",
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 2,
      backgroundColor: "#000000",
      backgroundOpacity: 0.5,
      borderRadius: 4,
      padding: 10,
      shadow: true,
      shadowColor: "#000000",
      shadowOffset: 3,
      position: "bottom",
      alignment: "center",
      marginV: 60,
      marginH: 80,
      maxLineWidth: 38,
      maxLines: 2,
      textTransform: "preserve",
    },
  },
  {
    id: "social_bold",
    labelKey: "vionto.subtitlePreset.social_bold",
    descriptionKey: "vionto.subtitlePreset.social_bold.description",
    style: {
      fontName: "Arial",
      fontSize: 40,
      fontWeight: "bold",
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 4,
      backgroundColor: "transparent",
      backgroundOpacity: 0,
      borderRadius: 0,
      padding: 0,
      shadow: true,
      shadowColor: "#000000",
      shadowOffset: 4,
      position: "center",
      alignment: "center",
      marginV: 0,
      marginH: 30,
      maxLineWidth: 28,
      maxLines: 3,
      textTransform: "uppercase",
    },
  },
  {
    id: "documentary",
    labelKey: "vionto.subtitlePreset.documentary",
    descriptionKey: "vionto.subtitlePreset.documentary.description",
    style: {
      fontName: "Arial",
      fontSize: 24,
      fontWeight: "normal",
      color: "#ffffff",
      outlineColor: "#1a1a1a",
      outlineWidth: 2,
      backgroundColor: "#1a1a1a",
      backgroundOpacity: 0.7,
      borderRadius: 2,
      padding: 8,
      shadow: false,
      shadowColor: "#000000",
      shadowOffset: 0,
      position: "bottom",
      alignment: "center",
      marginV: 30,
      marginH: 60,
      maxLineWidth: 44,
      maxLines: 2,
      textTransform: "preserve",
    },
  },
  {
    id: "high_contrast",
    labelKey: "vionto.subtitlePreset.high_contrast",
    descriptionKey: "vionto.subtitlePreset.high_contrast.description",
    style: {
      fontName: "Arial",
      fontSize: 30,
      fontWeight: "bold",
      color: "#ffff00",
      outlineColor: "#000000",
      outlineWidth: 3,
      backgroundColor: "#000000",
      backgroundOpacity: 0.85,
      borderRadius: 4,
      padding: 12,
      shadow: false,
      shadowColor: "#000000",
      shadowOffset: 0,
      position: "bottom",
      alignment: "center",
      marginV: 40,
      marginH: 40,
      maxLineWidth: 36,
      maxLines: 2,
      textTransform: "preserve",
    },
  },
  {
    id: "elegant_memory",
    labelKey: "vionto.subtitlePreset.elegant_memory",
    descriptionKey: "vionto.subtitlePreset.elegant_memory.description",
    style: {
      fontName: "Georgia",
      fontSize: 26,
      fontWeight: "normal",
      color: "#f5f0e8",
      outlineColor: "#2c2014",
      outlineWidth: 1,
      backgroundColor: "#2c2014",
      backgroundOpacity: 0.4,
      borderRadius: 6,
      padding: 10,
      shadow: true,
      shadowColor: "#2c2014",
      shadowOffset: 2,
      position: "bottom",
      alignment: "center",
      marginV: 50,
      marginH: 60,
      maxLineWidth: 40,
      maxLines: 2,
      textTransform: "preserve",
    },
  },
];

export const DEFAULT_SUBTITLE_PRESET: SubtitlePresetId = "minimal_clean";

export function getSubtitlePreset(id: SubtitlePresetId): SubtitlePreset {
  return SUBTITLE_PRESETS.find((p) => p.id === id) ?? SUBTITLE_PRESETS[0];
}

export function getSubtitlePresetStyle(id: SubtitlePresetId): SubtitleStyle {
  return getSubtitlePreset(id).style;
}
