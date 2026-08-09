import { z } from "zod";

/**
 * Shared client+server validation. These are the ONLY shapes the API
 * accepts for mutations — allowlisted fields, no passthrough of arbitrary
 * client JSON into Prisma.
 */

export const TIMELINE_TYPES = [
  "general",
  "project",
  "historical",
  "roadmap",
  "gantt",
  "calendar",
  "interactive",
] as const;

export const TIMELINE_LAYOUTS = [
  "vertical",
  "horizontal",
  "zigzag",
  "radial",
  "roadmap",
  "gantt",
  "calendar",
  "interactive",
  "branch",
] as const;

export const TIMELINE_VISIBILITY = ["private", "public", "unlisted"] as const;

export const ThemeSettingsSchema = z
  .object({
    palette: z.string().max(64).optional(),
    background: z.string().max(32).optional(),
    accentColor: z.string().max(32).optional(),
    connectorColor: z.string().max(32).optional(),
    fontFamily: z.string().max(64).optional(),
    density: z.enum(["compact", "comfortable", "spacious"]).optional(),
    dateFormat: z.string().max(32).optional(),
    cardStyle: z.enum(["flat", "elevated", "outlined"]).optional(),
    showDescriptions: z.boolean().optional(),
    showDates: z.boolean().optional(),
    showImages: z.boolean().optional(),
    showIcons: z.boolean().optional(),
  })
  .strict()
  .partial();

export type ThemeSettings = z.infer<typeof ThemeSettingsSchema>;

/**
 * Best-effort SSRF hardening for user-supplied URLs (event images/links).
 * These render inside a real headless-Chromium session during export
 * (lib/server/services/export.ts), which makes a real outbound request —
 * so an unrestricted URL here is a request-forgery vector against our own
 * infrastructure, not just a client-side <img> tag. This blocks the
 * obvious cases (non-http(s) schemes, localhost, private/link-local/
 * loopback IP literals); it does NOT defend against DNS rebinding
 * (a hostname that resolves to a private IP at fetch time) — that needs
 * an egress-time check in the export pipeline itself, noted there.
 */
const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0"]);
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  // IPv4 literal checks: loopback, private ranges (RFC1918), link-local,
  // and the cloud-metadata address.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 0) return true;
  }
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  return false;
}

function safeExternalUrl(message: string) {
  return z
    .string()
    .url(message)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !isBlockedHost(url.hostname);
      } catch {
        return false;
      }
    }, "That link isn't allowed — please use a public https:// address.");
}

// Non-technical, human-readable validation messages throughout — this
// editor is for a general audience, not developers.
export const TimelineEventInputSchema = z
  .object({
    id: z.string().cuid().optional(), // present when editing an existing event
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    displayDate: z.string().max(120).nullable().optional(),
    title: z
      .string()
      .trim()
      .min(1, "Every event needs a title.")
      .max(200, "Titles must be under 200 characters."),
    description: z.string().max(5000, "Descriptions must be under 5000 characters.").nullable().optional(),
    imageUrl: safeExternalUrl("That doesn't look like a valid image link.").nullable().optional(),
    imageStorageKey: z.string().max(512).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
    label: z.string().max(64).nullable().optional(),
    link: safeExternalUrl("That doesn't look like a valid link.").nullable().optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Colors must be a hex value like #6d5ef8.")
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict()
  .refine(
    (event) => !event.startAt || !event.endAt || new Date(event.endAt) >= new Date(event.startAt),
    { message: "The end date can't be before the start date.", path: ["endAt"] }
  );

export type TimelineEventInput = z.infer<typeof TimelineEventInputSchema>;

export const TimelineInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give your timeline a title.")
      .max(200, "Titles must be under 200 characters."),
    subtitle: z.string().max(300, "Subtitles must be under 300 characters.").nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    timelineType: z.enum(TIMELINE_TYPES).default("general"),
    layout: z.enum(TIMELINE_LAYOUTS).default("vertical"),
    theme: ThemeSettingsSchema.nullable().optional(),
    events: z
      .array(TimelineEventInputSchema)
      .max(500, "A single timeline can hold at most 500 events."),
  })
  .strict();

export type TimelineInput = z.infer<typeof TimelineInputSchema>;

export const TimelineVisibilityInputSchema = z.object({
  visibility: z.enum(TIMELINE_VISIBILITY),
});

export const ModerationDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).nullable().optional(),
});
