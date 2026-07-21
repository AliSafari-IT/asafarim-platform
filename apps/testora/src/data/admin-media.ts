import type { FunctionalRequirementDefinition } from "@/test-engine/types";
import { buildChapter, type AdminPageSpec } from "./_admin-shared";

/**
 * Admin · Media & Style Assets — the second admin chapter (the app's
 * `mediaAssets` sidebar group). Site content, media libraries and render-style
 * assets. Pages backed by a verified /admin GET endpoint get the standard
 * "endpoint returns admin data" + "rejects anonymous" pair plus a browser
 * smoke; pages without a clean list endpoint (or that are upload/editor
 * surfaces) get a browser smoke only.
 *
 * Endpoint paths come from the app's own admin API client (admin.api.ts), so
 * they track production. See _admin-shared.ts for auth + the rate-limit note.
 */

export const mediaAssetsFR: FunctionalRequirementDefinition = {
  id: "media-style-assets",
  title: "Admin · Media & Style Assets",
  description:
    "Site content, media libraries and render-style assets: homepage sections, testimonials, logos, FAQ, listings, videos, music, voices and style templates.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

const pages: AdminPageSpec[] = [
  // ── Site content / sections ──────────────────────────────────────────────
  {
    id: "homepage-sections",
    title: "Homepage Sections",
    uiPath: "/en/admin/homepage-sections",
    description: "Ordered marketing homepage sections.",
    api: { path: "/admin/content/homepage-sections", shape: "list" },
  },
  {
    id: "testimonials",
    title: "Testimonials",
    uiPath: "/en/admin/testimonials",
    description: "Curated testimonials shown on the marketing site.",
    api: { path: "/admin/content/testimonials", shape: "list" },
  },
  {
    id: "partner-logos",
    title: "Partner Logos",
    uiPath: "/en/admin/partner-logos",
    description: "Partner logo strip assets.",
    api: { path: "/admin/content/partner-logos", shape: "list" },
  },
  {
    id: "benefit-cards",
    title: "Benefit Cards",
    uiPath: "/en/admin/benefit-cards",
    description: "Benefit/feature cards on the homepage.",
    api: { path: "/admin/content/benefit-cards", shape: "list" },
  },
  {
    id: "faq",
    title: "FAQ",
    uiPath: "/en/admin/faq",
    description: "Frequently asked questions content.",
    api: { path: "/admin/faq", shape: "list" },
  },
  {
    id: "help-center",
    title: "Help Center",
    uiPath: "/en/admin/help-center",
    description: "Help-center API-docs and contact content blocks.",
    api: { path: "/admin/content/help-center", shape: "list" },
  },
  {
    id: "listings",
    title: "Listings",
    uiPath: "/en/admin/listings",
    description: "All scraped property listings across users.",
    api: { path: "/admin/listings?limit=5", shape: "list" },
  },
  {
    id: "footer",
    title: "Footer",
    uiPath: "/en/admin/footer",
    description: "Footer sections, links and social links.",
    api: { path: "/admin/content/footer-sections", shape: "list" },
  },
  {
    // Aggregate content hub — no single backing list endpoint.
    id: "content",
    title: "Content",
    uiPath: "/en/admin/content",
    description: "Content management hub.",
  },
  // ── Media + style assets ─────────────────────────────────────────────────
  {
    id: "homepage-video",
    title: "Homepage Video",
    uiPath: "/en/admin/homepage-video",
    description: "Homepage hero video / poster (upload surface).",
  },
  {
    id: "videos",
    title: "Videos",
    uiPath: "/en/admin/videos",
    description: "Rendered videos across all users.",
    api: { path: "/admin/videos?limit=5", shape: "list" },
  },
  {
    id: "music",
    title: "Music",
    uiPath: "/en/admin/music",
    description: "Background-music track catalog.",
    api: { path: "/admin/music-tracks", shape: "list" },
  },
  {
    id: "voice-roster",
    title: "Voice Roster",
    uiPath: "/en/admin/voice-roster",
    description: "Curated ElevenLabs voice picker catalog.",
    api: { path: "/admin/voice-roster", shape: "list" },
  },
  {
    id: "master-prompt",
    title: "Master Prompt",
    uiPath: "/en/admin/master-prompt",
    description: "Master prompt / storyteller contract editor.",
  },
  {
    id: "video-styles",
    title: "Video Styles",
    uiPath: "/en/admin/video-styles",
    description: "Render style templates.",
    superadminOnly: true,
    api: { path: "/admin/style-templates", shape: "array" },
  },
  {
    id: "ai-cinematic",
    title: "AI Cinematic",
    uiPath: "/en/admin/ai-cinematic",
    description: "Cinematic AI render lab.",
    superadminOnly: true,
  },
  {
    id: "overlay-lab",
    title: "Overlay Lab",
    uiPath: "/en/admin/overlay-lab",
    description: "Overlay composition lab.",
    superadminOnly: true,
  },
  {
    id: "staging-sandbox",
    title: "Staging Sandbox",
    uiPath: "/en/admin/staging-sandbox",
    description: "Staging/experimental sandbox.",
    superadminOnly: true,
  },
];

const chapter = buildChapter("media-style-assets", pages);

export const mediaAssetsSuites = chapter.suites;
export const mediaAssetsFixtures = chapter.fixtures;
export const mediaAssetsCases = chapter.cases;
