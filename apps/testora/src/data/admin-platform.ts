import type { FunctionalRequirementDefinition } from "@/test-engine/types";
import { buildChapter, type AdminPageSpec } from "./_admin-shared";

/**
 * Admin · Platform Configuration — the fourth admin chapter (the app's
 * `platformConfig` sidebar group). Core configuration plus comms & growth
 * tooling.
 *
 * Endpoint paths come from admin.api.ts + AdminController. Integration-backed
 * pages (Listmonk, mail) and editor-only surfaces are browser-smoke only;
 * everything with a verified /admin GET endpoint also gets the standard
 * returns-data + access-control pair. See _admin-shared.ts for auth + the
 * rate-limit note. The external API-docs link in the sidebar is intentionally
 * excluded — it is not an admin page.
 */

export const platformConfigFR: FunctionalRequirementDefinition = {
  id: "platform-configuration",
  title: "Admin · Platform Configuration",
  description:
    "Core configuration plus comms & growth: settings, flags, translations, legal, GDPR, OAuth, mail, campaigns, leads and social.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

const pages: AdminPageSpec[] = [
  // ── Core configuration ───────────────────────────────────────────────────
  {
    id: "platform-settings",
    title: "Platform Settings",
    uiPath: "/en/admin/settings",
    description: "Global platform settings.",
    api: { path: "/admin/settings", shape: "object" },
  },
  {
    id: "admin-access",
    title: "Admin Access",
    uiPath: "/en/admin/access",
    description: "Admin role/access management.",
    superadminOnly: true,
  },
  {
    id: "wizard-config",
    title: "Wizard Config",
    uiPath: "/en/admin/wizard-config",
    description: "Video wizard step configuration.",
  },
  {
    id: "oauth-providers",
    title: "OAuth Providers",
    uiPath: "/en/admin/oauth",
    description: "Social OAuth provider configuration.",
  },
  {
    id: "translations",
    title: "Translations",
    uiPath: "/en/admin/translations",
    description: "i18n translation namespaces and parity.",
    api: { path: "/admin/translations/namespaces", shape: "array" },
  },
  {
    id: "feature-flags",
    title: "Feature Flags",
    uiPath: "/en/admin/flags",
    description: "Runtime feature flags.",
    api: { path: "/admin/content/feature-flags", shape: "list" },
  },
  {
    id: "tour-settings",
    title: "Tour Settings",
    uiPath: "/en/admin/tour-settings",
    description: "Product-tour configuration.",
  },
  {
    id: "legal",
    title: "Legal",
    uiPath: "/en/admin/legal",
    description: "Terms & privacy legal documents.",
    api: { path: "/admin/legal", shape: "object" },
  },
  {
    id: "gdpr",
    title: "GDPR",
    uiPath: "/en/admin/gdpr",
    description: "Cookie content and consent receipts.",
    api: { path: "/admin/gdpr/cookie-contents", shape: "list" },
  },
  // ── Comms + growth ───────────────────────────────────────────────────────
  {
    id: "mail-settings",
    title: "Mail Settings",
    uiPath: "/en/admin/mail",
    description: "Transactional mail configuration.",
  },
  {
    id: "contact-messages",
    title: "Contact Messages",
    uiPath: "/en/admin/contact-messages",
    description: "Inbound contact-form messages.",
  },
  {
    id: "campaigns",
    title: "Campaigns",
    uiPath: "/en/admin/marketing",
    description: "Marketing campaign console.",
  },
  {
    id: "ai-leads",
    title: "AI Leads",
    uiPath: "/en/admin/ai-leads",
    description: "Leads captured by the AI assistant.",
    api: { path: "/ai/admin/leads", shape: "list" },
  },
  {
    id: "mail-marketing",
    title: "Mail Marketing",
    uiPath: "/en/admin/mail-marketing",
    description: "Marketing email tooling.",
  },
  {
    id: "listmonk",
    title: "Listmonk",
    uiPath: "/en/admin/listmonk",
    description: "Listmonk newsletter integration (external service).",
  },
  {
    id: "push-notifications",
    title: "Push Notifications",
    uiPath: "/en/admin/push-notifications",
    description: "Web push notification console.",
  },
  {
    id: "social",
    title: "Social",
    uiPath: "/en/admin/social",
    description: "Connected social accounts across users.",
    api: { path: "/social/admin/connections?limit=5", shape: "list" },
  },
];

const chapter = buildChapter("platform-configuration", pages);

export const platformConfigSuites = chapter.suites;
export const platformConfigFixtures = chapter.fixtures;
export const platformConfigCases = chapter.cases;
