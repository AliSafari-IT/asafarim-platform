import type { FunctionalRequirementDefinition } from "@/test-engine/types";
import { buildChapter, type AdminPageSpec } from "./_admin-shared";

/**
 * User · Workspace — the authenticated, non-admin app surface a logged-in user
 * touches: their jobs, videos, listings, brand assets, social connections and
 * notifications, plus self-service data (export, consent). Endpoint paths come
 * from the app's OpenAPI spec.
 *
 * Each endpoint gets the standard pair: it returns data for an authenticated
 * account (the seeded admin is also a valid user), and it rejects an anonymous
 * request (401/403). API-only — no browser smokes. Read-only: nothing here
 * mutates user data.
 */

export const userWorkspaceFR: FunctionalRequirementDefinition = {
  id: "user-workspace",
  title: "User · Workspace",
  description:
    "The authenticated user surface: jobs, videos, listings, brand assets, social connections, notifications and self-service data (export, consent).",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

const DUMMY_PAGE = "/en/login"; // unused (ui: false)

const pages: AdminPageSpec[] = [
  // ── Jobs & videos ────────────────────────────────────────────────────────
  {
    id: "user-jobs",
    title: "My Jobs",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "The user's video-generation jobs.",
    api: { path: "/jobs", shape: "object" },
  },
  {
    id: "user-jobs-stats",
    title: "Jobs · Realtime stats",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Live rendering statistics for the user.",
    api: { path: "/jobs/realtime/stats", shape: "object" },
  },
  {
    id: "user-jobs-paywall",
    title: "Jobs · Paywall eligibility",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Whether the user can generate without paying.",
    api: { path: "/jobs/paywall-eligibility", shape: "object" },
  },
  {
    id: "user-videos",
    title: "My Videos",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "The user's rendered videos.",
    api: { path: "/videos", shape: "object" },
  },
  // ── Listings & brand ─────────────────────────────────────────────────────
  {
    id: "user-listings",
    title: "My Listings",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Search the user's scraped listings.",
    api: { path: "/listings", shape: "object" },
  },
  {
    id: "user-brand-assets",
    title: "Brand Assets",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "The user's uploaded brand assets.",
    api: { path: "/brand/assets", shape: "object" },
  },
  // ── Social ───────────────────────────────────────────────────────────────
  {
    id: "user-social-connections",
    title: "Social Connections",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Connected social accounts.",
    api: { path: "/social/connections", shape: "object" },
  },
  {
    id: "user-social-platforms",
    title: "Social Platforms",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Platform availability for publishing.",
    api: { path: "/social/platforms", shape: "object" },
  },
  // ── Notifications ────────────────────────────────────────────────────────
  {
    id: "user-notifications",
    title: "Notifications",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "The user's notifications.",
    api: { path: "/notifications", shape: "object" },
  },
  {
    id: "user-notifications-unread",
    title: "Notifications · Unread count",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Count of unread notifications.",
    api: { path: "/notifications/unread-count", shape: "object" },
  },
  // ── Self-service data ────────────────────────────────────────────────────
  {
    id: "user-me-export",
    title: "Account · Data export",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "GDPR data export for the account.",
    api: { path: "/users/me/export", shape: "object" },
  },
  {
    id: "user-me-consent",
    title: "Account · Consent receipt",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "The account's stored consent receipt.",
    api: { path: "/users/me/consent", shape: "object", tolerant: [200, 404] },
  },
];

const chapter = buildChapter("user-workspace", pages, "");

export const userWorkspaceSuites = chapter.suites;
export const userWorkspaceFixtures = chapter.fixtures;
export const userWorkspaceCases = chapter.cases;
