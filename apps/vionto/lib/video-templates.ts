import type { SubtitleConfig } from "@/lib/server/render-manifest";
import type { VisualStyle } from "@/lib/visual-styles";

export const VIDEO_TEMPLATE_IDS = [
  "birthday_recap",
  "vacation_memories",
  "wedding_highlights",
  "baby_first_year",
  "before_after",
  "memorial_tribute",
  "real_estate_showcase",
] as const;

export type VideoTemplateId = (typeof VIDEO_TEMPLATE_IDS)[number];

export type VideoTemplateSettings = {
  mode: "story" | "slideshow" | "documentary";
  storyMode: string;
  emotionalTone: string;
  visualStyle: VisualStyle;
  musicOption: "calm_piano" | "cinematic_strings" | "travel_upbeat" | "family_warm_acoustic" | "no_music" | "upload_own";
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3";
  resolution: "720p" | "1080p" | "4k";
  targetDurationSeconds: number;
  subtitleSettings?: Partial<SubtitleConfig>;
  captionOverlaySettings?: {
    enabled: boolean;
    showSceneCaptions: boolean;
    showDateCaptions: boolean;
    showLocationCaptions: boolean;
    showPeopleLabels: boolean;
    placement: "top" | "bottom" | "lower_third" | "corner";
    stylePreset: "minimal" | "memory" | "social" | "documentary";
  };
};

export type VideoTemplate = {
  id: VideoTemplateId;
  name: string;
  summary: string;
  settings: VideoTemplateSettings;
};

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: "birthday_recap",
    name: "Birthday recap",
    summary: "Joyful highlights with social-friendly captions.",
    settings: {
      mode: "story",
      storyMode: "event_recap",
      emotionalTone: "joyful",
      visualStyle: "social_vertical_captions",
      musicOption: "family_warm_acoustic",
      aspectRatio: "9:16",
      resolution: "1080p",
      targetDurationSeconds: 30,
      captionOverlaySettings: { enabled: true, showSceneCaptions: true, showDateCaptions: true, showLocationCaptions: false, showPeopleLabels: true, placement: "lower_third", stylePreset: "social" },
    },
  },
  {
    id: "vacation_memories",
    name: "Vacation memories",
    summary: "Travel recap with places, dates, and movement.",
    settings: {
      mode: "story",
      storyMode: "travel_recap",
      emotionalTone: "joyful",
      visualStyle: "travel_map_overlay",
      musicOption: "travel_upbeat",
      aspectRatio: "16:9",
      resolution: "1080p",
      targetDurationSeconds: 45,
      captionOverlaySettings: { enabled: true, showSceneCaptions: true, showDateCaptions: true, showLocationCaptions: true, showPeopleLabels: false, placement: "corner", stylePreset: "documentary" },
    },
  },
  {
    id: "wedding_highlights",
    name: "Wedding highlights",
    summary: "Romantic pacing with cinematic titles.",
    settings: {
      mode: "story",
      storyMode: "event_recap",
      emotionalTone: "romantic",
      visualStyle: "wedding_cinematic",
      musicOption: "cinematic_strings",
      aspectRatio: "16:9",
      resolution: "1080p",
      targetDurationSeconds: 60,
      captionOverlaySettings: { enabled: true, showSceneCaptions: true, showDateCaptions: true, showLocationCaptions: false, showPeopleLabels: true, placement: "lower_third", stylePreset: "memory" },
    },
  },
  {
    id: "baby_first_year",
    name: "Baby first year",
    summary: "Warm family archive with gentle narration.",
    settings: {
      mode: "story",
      storyMode: "family_archive",
      emotionalTone: "nostalgic",
      visualStyle: "polaroid_memory",
      musicOption: "family_warm_acoustic",
      aspectRatio: "16:9",
      resolution: "1080p",
      targetDurationSeconds: 60,
      captionOverlaySettings: { enabled: true, showSceneCaptions: true, showDateCaptions: true, showLocationCaptions: false, showPeopleLabels: true, placement: "lower_third", stylePreset: "memory" },
    },
  },
  {
    id: "before_after",
    name: "Before/after",
    summary: "Direct transformation story with tighter pacing.",
    settings: {
      mode: "slideshow",
      storyMode: "documentary",
      emotionalTone: "epic",
      visualStyle: "clean_modern_slideshow",
      musicOption: "cinematic_strings",
      aspectRatio: "16:9",
      resolution: "1080p",
      targetDurationSeconds: 30,
      captionOverlaySettings: { enabled: true, showSceneCaptions: true, showDateCaptions: false, showLocationCaptions: false, showPeopleLabels: false, placement: "bottom", stylePreset: "minimal" },
    },
  },
  {
    id: "memorial_tribute",
    name: "Memorial tribute",
    summary: "Reflective tribute with slower pacing.",
    settings: {
      mode: "story",
      storyMode: "memory_film",
      emotionalTone: "reflective",
      visualStyle: "film_grain",
      musicOption: "calm_piano",
      aspectRatio: "16:9",
      resolution: "1080p",
      targetDurationSeconds: 60,
      captionOverlaySettings: { enabled: true, showSceneCaptions: true, showDateCaptions: true, showLocationCaptions: false, showPeopleLabels: true, placement: "lower_third", stylePreset: "memory" },
    },
  },
  {
    id: "real_estate_showcase",
    name: "Real estate showcase",
    summary: "Clean documentary-style property walkthrough.",
    settings: {
      mode: "documentary",
      storyMode: "documentary",
      emotionalTone: "calm",
      visualStyle: "clean_modern_slideshow",
      musicOption: "no_music",
      aspectRatio: "16:9",
      resolution: "1080p",
      targetDurationSeconds: 45,
      captionOverlaySettings: { enabled: true, showSceneCaptions: true, showDateCaptions: false, showLocationCaptions: true, showPeopleLabels: false, placement: "corner", stylePreset: "documentary" },
    },
  },
];

export function getVideoTemplate(templateId: string | null | undefined) {
  return VIDEO_TEMPLATES.find((template) => template.id === templateId) ?? null;
}
