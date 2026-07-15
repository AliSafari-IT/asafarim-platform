export const PRIVACY_LEVELS = ["private", "unlisted", "public"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const OCCASION_SUGGESTIONS = [
  "wedding",
  "graduation",
  "vacation",
  "birthday",
  "holiday",
  "reunion",
  "ceremony",
  "concert",
  "sports",
  "other",
] as const;

export const MOOD_SUGGESTIONS = [
  "joyful",
  "nostalgic",
  "serene",
  "adventurous",
  "romantic",
  "epic",
  "reflective",
  "playful",
  "solemn",
  "other",
] as const;
