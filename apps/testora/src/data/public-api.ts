import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import { apiScript, buildChapter, type AdminPageSpec } from "./_admin-shared";

/**
 * Public & Platform API — the unauthenticated surface of the app under test
 * (health checks, marketing content, public catalogs and provider status),
 * sourced from the app's OpenAPI spec. Each page hits a public GET with NO auth
 * and asserts a 200 (or, for externally-backed status endpoints, a tolerated
 * set of statuses). API-only: no browser smokes.
 */

export const publicPlatformFR: FunctionalRequirementDefinition = {
  id: "public-platform",
  title: "Public & Platform API",
  description:
    "Unauthenticated endpoints: health, marketing content (pricing, testimonials, FAQ, legal), public catalogs (voices, music, supported domains) and provider status.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

const DUMMY_PAGE = "/en/login"; // unused (ui: false), but AdminPageSpec needs a path

const pages: AdminPageSpec[] = [
  // ── Health ───────────────────────────────────────────────────────────────
  {
    id: "public-health",
    title: "Health",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Liveness check.",
    api: { path: "/health", shape: "object", public: true },
  },
  {
    id: "public-health-db",
    title: "Health · Database",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Database connectivity check.",
    api: {
      path: "/health/db",
      shape: "object",
      public: true,
      tolerant: [200, 503],
    },
  },
  // ── Auth utilities ───────────────────────────────────────────────────────
  {
    id: "public-check-email",
    title: "Email availability",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Whether an email is free to register.",
    api: {
      path: "/auth/check-email?email=e2e-availability-check%40example.com",
      base: "/auth/check-email",
      shape: "object",
      public: true,
    },
  },
  // ── Public catalogs ──────────────────────────────────────────────────────
  {
    id: "public-supported-domains",
    title: "Supported scraper domains",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Listing sites the scraper supports.",
    api: { path: "/scraper/supported-domains", shape: "object", public: true },
  },
  {
    id: "public-ai-music",
    title: "AI music",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Background-music catalog.",
    api: {
      path: "/ai/music",
      shape: "object",
      public: true,
      tolerant: [200, 500, 502, 503],
    },
  },
  {
    id: "public-ai-voices-default",
    title: "Default voices",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Default voice per language.",
    api: {
      path: "/ai/voices/default",
      shape: "object",
      public: true,
      tolerant: [200, 500, 502, 503],
    },
  },
  // ── Marketing content ────────────────────────────────────────────────────
  {
    id: "public-pricing-plans",
    title: "Pricing plans",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Public pricing plan catalog.",
    api: { path: "/content/pricing-plans", shape: "object", public: true },
  },
  {
    id: "public-testimonials",
    title: "Testimonials",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Public testimonials.",
    api: { path: "/content/testimonials", shape: "object", public: true },
  },
  {
    id: "public-faq",
    title: "FAQ",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Public FAQ content.",
    api: { path: "/faq", shape: "object", public: true },
  },
  {
    id: "public-legal-terms",
    title: "Legal · Terms",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Published terms document.",
    api: {
      path: "/legal/terms",
      shape: "object",
      public: true,
      tolerant: [200, 404],
    },
  },
  {
    id: "public-gdpr-cookie",
    title: "Cookie content",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "Active GDPR cookie-banner content.",
    api: {
      path: "/gdpr/cookie-content",
      shape: "object",
      public: true,
      tolerant: [200, 404],
    },
  },
  // ── Provider status (external) ───────────────────────────────────────────
  {
    id: "public-heygen-status",
    title: "HeyGen status",
    uiPath: DUMMY_PAGE,
    ui: false,
    description: "HeyGen avatar provider status.",
    api: {
      path: "/heygen/status",
      shape: "object",
      public: true,
      tolerant: [200, 500, 502, 503],
    },
  },
  // NOTE: kie.ai status lives at /admin/kie-ai/status and is admin-guarded, so it
  // is covered as an authenticated admin endpoint in admin-system.ts (System
  // Operations), not here. It is intentionally absent from this public chapter.
];

const chapter = buildChapter("public-platform", pages, "");

// Hand-written: the public contact form rejects an empty submission. Validation
// fails before any email is sent / message stored, so this is non-destructive.
const contactSuite: TestSuiteDefinition = {
  suiteId: "public-contact",
  frId: "public-platform",
  title: "Contact form",
  description:
    "The public contact form validates input before creating a message.",
};

const contactFixture: TestFixtureDefinition = {
  fixtureId: "public-contact-api",
  suiteId: "public-contact",
  title: "Contact form API",
  baseUrl: "/en/login",
  commonInput: {},
};

const contactCases: TestCaseDefinition[] = [
  {
    caseId: "public-contact-rejects-empty",
    fixtureId: "public-contact-api",
    title: "Contact form rejects an empty submission",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await t.request.post(api + '/contact', { headers: {}, body: {} });
await t.expect(res.status >= 400 && res.status < 500).ok('expected an empty contact submission to be rejected (4xx), got ' + res.status + ': ' + JSON.stringify(res.body).slice(0, 200));
`),
  },
];

export const publicPlatformSuites: TestSuiteDefinition[] = [
  ...chapter.suites,
  contactSuite,
];
export const publicPlatformFixtures: TestFixtureDefinition[] = [
  ...chapter.fixtures,
  contactFixture,
];
export const publicPlatformCases: TestCaseDefinition[] = [
  ...chapter.cases,
  ...contactCases,
];
