import type { FunctionalRequirementDefinition } from "@/test-engine/types";
import { buildChapter, type AdminPageSpec } from "./_admin-shared";

/**
 * Admin · System Operations — the third admin chapter (the app's `systemOps`
 * sidebar group). The rendering pipeline runtime, monitoring, AI/render
 * providers and QA tooling.
 *
 * Provider-health and status endpoints frequently depend on external services
 * (TTS, AI video, render providers) that may be unconfigured in a local dev
 * environment, so those are marked `tolerant` — the case then asserts only that
 * the endpoint is reachable and admin-guarded (auth passes), not a specific
 * success body. Endpoint paths come from admin.api.ts + AdminController.
 */

export const systemOpsFR: FunctionalRequirementDefinition = {
  id: "system-operations",
  title: "Admin · System Operations",
  description:
    "Platform overview plus pipeline runtime, monitoring and AI/render providers: stats, jobs, scraper, costs, health, analytics, errors, TTS, vision and render QA.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

const pages: AdminPageSpec[] = [
  // ── Admin home / overview ────────────────────────────────────────────────
  {
    id: "overview",
    title: "Admin Overview",
    uiPath: "/en/admin",
    description:
      "Admin dashboard home — platform KPIs (users, agents, jobs, videos, cost) from /admin/stats.",
    api: {
      path: "/admin/stats",
      shape: "object",
      assertBody:
        "await t.expect(typeof res.body.totalUsers).eql('number', 'expected platform stats with a numeric totalUsers');",
    },
  },
  // ── Pipeline runtime + monitoring ────────────────────────────────────────
  {
    id: "jobs",
    title: "Jobs",
    uiPath: "/en/admin/jobs",
    description: "All video-generation jobs across users.",
    api: { path: "/admin/jobs?limit=5", shape: "list" },
  },
  {
    id: "scraper",
    title: "Scraper",
    uiPath: "/en/admin/scraper",
    description: "Supported scraper domains and their extractor routing.",
    api: { path: "/admin/scraper/domains", shape: "array" },
  },
  {
    id: "monitoring",
    title: "Monitoring",
    uiPath: "/en/admin/monitoring",
    description: "System monitoring dashboard.",
  },
  {
    id: "costs",
    title: "Costs",
    uiPath: "/en/admin/costs",
    description: "Per-job AI/render cost breakdown.",
    api: { path: "/admin/costs?limit=5", shape: "list" },
  },
  {
    id: "system-health",
    title: "System Health",
    uiPath: "/en/admin/health",
    description: "Service health overview.",
  },
  {
    id: "analytics",
    title: "Analytics",
    uiPath: "/en/admin/analytics",
    description: "Usage analytics dashboard.",
  },
  {
    id: "video-feedback",
    title: "Video Feedback",
    uiPath: "/en/admin/feedback",
    description: "Per-video feedback ratings and comments.",
    api: { path: "/admin/feedback?page=1&limit=5", shape: "list" },
  },
  {
    id: "errors-logbook",
    title: "Errors Logbook",
    uiPath: "/en/admin/errors",
    description: "Recent persisted backend errors.",
    api: { path: "/admin/errors", shape: "list" },
  },
  // ── Video / AI providers + QA ────────────────────────────────────────────
  {
    id: "tts",
    title: "TTS",
    uiPath: "/en/admin/tts",
    description: "Text-to-speech provider diagnostics + usage.",
    api: {
      path: "/admin/ai/tts/status",
      shape: "object",
      tolerant: [200, 424, 500, 502, 503],
    },
  },
  {
    id: "kie-ai",
    title: "Kie AI",
    uiPath: "/en/admin/kie-ai",
    description: "kie.ai cinematic provider console.",
    // /admin/kie-ai/status is admin-guarded (JwtAuthGuard + RolesGuard @Admin),
    // so it gets the authenticated GET + anonymous-401 pair like the other
    // provider-status endpoints — it is NOT a public endpoint.
    api: {
      path: "/admin/kie-ai/status",
      shape: "object",
      tolerant: [200, 424, 500, 502, 503],
    },
  },
  {
    id: "cinematic-clips",
    title: "Cinematic Clips",
    uiPath: "/en/admin/cinematic-clips",
    description: "Cinematic clip generation console.",
  },
  {
    id: "ai-video",
    title: "AI Video",
    uiPath: "/en/admin/ai-video",
    description: "AI video provider status + generation.",
    superadminOnly: true,
    api: {
      path: "/admin/ai-video/status",
      shape: "object",
      tolerant: [200, 424, 500, 502, 503],
    },
  },
  {
    id: "provider-test",
    title: "Providers Test",
    uiPath: "/en/admin/providers-test",
    description: "Ad-hoc provider connectivity testing.",
  },
  {
    id: "video-providers-health",
    title: "Video Providers Health",
    uiPath: "/en/admin/video-providers",
    description: "Health matrix for video providers.",
  },
  {
    id: "render-providers",
    title: "Render Providers",
    uiPath: "/en/admin/render-providers",
    description: "Render provider configuration.",
    superadminOnly: true,
  },
  {
    id: "render-qa",
    title: "Render QA",
    uiPath: "/en/admin/render-qa",
    description: "Render quality-assurance dashboard.",
    superadminOnly: true,
  },
  {
    id: "vision-compare",
    title: "Vision Compare",
    uiPath: "/en/admin/vision-compare",
    description: "Side-by-side room-classifier vision matrix.",
    superadminOnly: true,
  },
  {
    id: "render-lab",
    title: "Render Lab",
    uiPath: "/en/admin/render-lab",
    description: "Render experimentation lab.",
    superadminOnly: true,
  },
  {
    id: "alignment-monitor",
    title: "Alignment Monitor",
    uiPath: "/en/admin/alignment-monitor",
    description: "Recent voiceover/scene alignment runs.",
    superadminOnly: true,
    api: {
      path: "/admin/alignment/recent",
      shape: "object",
      tolerant: [200, 404, 500],
    },
  },
  {
    id: "automation",
    title: "Automation",
    uiPath: "/en/admin/automation",
    description: "Pipeline automation rules.",
    superadminOnly: true,
  },
  {
    id: "assistant-models",
    title: "Assistant Models",
    uiPath: "/en/admin/assistant-models",
    description: "Assistant/LLM model configuration.",
    superadminOnly: true,
  },
];

const chapter = buildChapter("system-operations", pages);

export const systemOpsSuites = chapter.suites;
export const systemOpsFixtures = chapter.fixtures;
export const systemOpsCases = chapter.cases;
