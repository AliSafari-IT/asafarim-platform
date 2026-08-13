import { ROLES } from "./roles";

/**
 * Central platform app registry.
 *
 * Single source of truth for which apps exist, how they present themselves
 * in launchers/admin surfaces, and who may open them. Access is derived
 * from roles — there is intentionally no per-user app-grant table; if one
 * is ever needed it gets its own schema design first.
 *
 * URL resolution stays in @asafarim/ui's getPlatformLinks(): active app
 * keys deliberately match PlatformLinks keys so callers can do
 * `links[app.key]`.
 */

export type PlatformAppStatus = "active" | "coming-soon";

/**
 * Who may open an app:
 * - "public"        — everyone, signed in or not
 * - "authenticated" — any signed-in active user
 * - string[]        — signed-in users holding at least one of these roles
 *                     (superadmin always passes)
 * - null            — nobody; deferred apps that have no implementation yet
 */
export type PlatformAppAccess = "public" | "authenticated" | string[] | null;

/**
 * Honest positioning for a public product app.
 *
 * These apps are real, deployed software running on the platform's production
 * infrastructure — but they are portfolio/capability showcases, not operating
 * commercial services. Anything that could read as "we have customers" belongs
 * here as explicit, per-app copy so no app quietly inherits another's claims.
 *
 * Only set this on apps a stranger can land on and mistake for a business.
 * Infrastructure and internal apps (hub, admin), the studio site itself (web),
 * and Showcase — which already announces that everything on it is a demo —
 * deliberately have no `showcase` block.
 */
export interface ShowcaseProject {
  /** Badge label, e.g. "Showcase project". Kept short and understated. */
  label: string;
  /** One-paragraph notice for the landing page. App-specific by design. */
  summary: string;
  /** Link text for the deeper explanation. */
  aboutLabel: string;
  /** In-app path to the "Behind this project" page. */
  aboutHref: string;
  /** Headline for the "Behind this project" page. */
  aboutTitle: string;
  /** What actually works, end to end, against production infrastructure. */
  functional: ShowcaseFact[];
  /** What is synthetic, seeded, mocked, or fixture-backed. Never omit. */
  synthetic: ShowcaseFact[];
  /** What the app demonstrates technically. */
  demonstrates: string[];
  /** Plain statement of commercial/operational status. */
  operationalStatus: string;
}

export interface ShowcaseFact {
  title: string;
  body: string;
}

/**
 * Locales the registry can carry translated showcase copy for. Deliberately
 * not imported from `@asafarim/shared-i18n` — this package stays dependency-
 * light (see the file-level comment on why the registry is a "pure module"),
 * and this union only needs to match shared-i18n's `Locale` in spirit, not by
 * import, since callers pass a base language they've already resolved.
 */
export type ShowcaseLocale = "en" | "nl" | "fr" | "de" | "lb";

export interface PlatformApp {
  key: string;
  name: string;
  description: string;
  /** Short monospace glyph for launcher tiles, e.g. "WB". */
  glyph: string;
  /** Technical meta line, e.g. "asafarim.com". */
  meta: string;
  status: PlatformAppStatus;
  access: PlatformAppAccess;
  /**
   * Present only on public product apps presented as working showcases.
   * Always the English copy — the guaranteed fallback `getShowcaseProject`
   * returns when no translation exists for the requested locale.
   */
  showcase?: ShowcaseProject;
  /**
   * Additional locales for `showcase`, keyed by base language. An app is
   * free to translate only some fields' worth of locales — whatever isn't
   * here falls back to `showcase` (English). Not all apps have a language
   * switcher at all, so this is opt-in per app rather than a required
   * `Record<ShowcaseLocale, ShowcaseProject>`.
   */
  showcaseByLocale?: Partial<Record<ShowcaseLocale, ShowcaseProject>>;
}

const SHOWCASE_ABOUT_HREF = "/about-this-project";
const SHOWCASE_LABEL = "Showcase project";

export const PLATFORM_APPS: readonly PlatformApp[] = [
  {
    key: "web",
    name: "ASafarIM Digital",
    description: "The public studio website: services, projects, and contact.",
    glyph: "WB",
    meta: "asafarim.com",
    status: "active",
    access: "public",
  },
  {
    key: "hub",
    name: "Hub",
    description: "The signed-in workbench: dashboard, profile, and app launcher.",
    glyph: "HB",
    meta: "hub.asafarim.com",
    status: "active",
    access: "authenticated",
  },
  {
    // Route policy decision: Showcase stays public — it is the exhibition
    // wall for demos and case studies, same as the current deployment.
    key: "showcase",
    name: "Showcase",
    description: "The exhibition wall: demos, case studies, and experiments.",
    glyph: "SC",
    meta: "showcase.asafarim.com",
    status: "active",
    access: "public",
  },
  {
    key: "admin",
    name: "Admin Console",
    description: "Users, roles, permissions, and the audit stream.",
    glyph: "AD",
    meta: "admin.asafarim.com · restricted",
    status: "active",
    access: [ROLES.ADMIN],
  },
  {
    // Vionto's own proxy keeps the landing and creation entry public;
    // project work requires sign-in inside the app itself.
    key: "vionto",
    name: "Vionto",
    description: "Photo-to-story studio: turn photo collections into narrated videos.",
    glyph: "VN",
    meta: "vionto.asafarim.com · beta",
    status: "active",
    access: "public",
    showcase: {
      label: SHOWCASE_LABEL,
      summary:
        "Vionto is in beta — a live product demonstration built and deployed by ASafarIM Digital. The render pipeline, storage, and background workers run for real on production infrastructure; some provider integrations are not enabled, and the published benchmark runs on fixtures rather than real media.",
      aboutLabel: "Behind this project",
      aboutHref: SHOWCASE_ABOUT_HREF,
      aboutTitle: "A real render pipeline, still in beta.",
      functional: [
        {
          title: "The full render pipeline",
          body: "Image upload → album → version → queued render → export. Real FFmpeg work runs in a persistent BullMQ worker backed by Redis, not inline in a request.",
        },
        {
          title: "Object storage and exports",
          body: "Media is stored in S3-compatible object storage and served through signed URLs; finished videos are genuinely downloadable.",
        },
        {
          title: "Its own isolated schema",
          body: "Projects, albums, versions, and jobs live in the platform database with validation enforced by shared Zod schemas.",
        },
      ],
      synthetic: [
        {
          title: "Beta, not general availability",
          body: "Features move and break. Anything you create should be treated as disposable — this is a demonstration environment, not a service with an uptime commitment.",
        },
        {
          title: "Not every provider is wired up",
          body: "The AI and voice provider seams are implemented as adapters, and not all of them are enabled on the deployed instance. Where a provider is off, that stage is unavailable rather than silently faked.",
        },
        {
          title: "The published benchmark is fixture-only",
          body: "The Vionto benchmark on Showcase makes no LLM calls, runs no FFmpeg, and touches no real media. Every brief, script, and asset in it is invented and licensed as a synthetic placeholder.",
        },
      ],
      demonstrates: [
        "A durable job state machine with approval gates and idempotent retry",
        "Background processing split from the web tier via a queue and a separate worker process",
        "Schema-validated multi-stage AI pipelines with a provider adapter seam",
        "S3-compatible media storage with signed delivery",
      ],
      operationalStatus:
        "Beta showcase product. Free to explore, built on production infrastructure, and not sold as a commercial service.",
    },
  },
  {
    // Public landing; private apps-under-test gate themselves on a signed-in
    // session inside the tool (see apps/testora app-access).
    key: "testora",
    name: "Testora",
    description: "E2E test automation: requirements, suites, fixtures, and TestCafe runs.",
    glyph: "TS",
    meta: "testora.asafarim.com",
    status: "active",
    access: "public",
    showcase: {
      label: SHOWCASE_LABEL,
      summary:
        "Testora is a working test-automation application built and deployed by ASafarIM Digital, not a commercial service. Signed-in users run real TestCafe executions against real targets; the benchmark results published on Showcase are committed snapshots from a seeded sample app and do not execute live.",
      aboutLabel: "Behind this project",
      aboutHref: SHOWCASE_ABOUT_HREF,
      aboutTitle: "Real test runs here. Committed evidence on Showcase.",
      functional: [
        {
          title: "Requirements, suites, fixtures, and cases",
          body: "The full authoring model is real and persisted in Testora's own PostgreSQL database, kept deliberately separate from the shared platform schema.",
        },
        {
          title: "Live TestCafe execution",
          body: "Signed-in users drive a real headless browser against local or remote targets and watch run progress stream in.",
        },
        {
          title: "Results, screenshots, and issue drafting",
          body: "Every run is stored with pass/fail status and failure screenshots, and a failing result can be turned into a ready-to-file GitHub issue.",
        },
      ],
      synthetic: [
        {
          title: "The Showcase demo never executes",
          body: "The Testora results published on Showcase are committed fixture JSON generated from a benchmark run. That page is read-only evidence — it does not start a browser or run a test.",
        },
        {
          title: "The benchmark's defects are seeded on purpose",
          body: "The benchmark runs against a small static sample app carrying three intentional defects and one deliberate flake, so results are reproducible. It is a measurement harness, not a real system under test.",
        },
      ],
      demonstrates: [
        "Traceability from functional requirements through to the tests that prove them",
        "Orchestrating a real browser-automation runner from a web application",
        "Streaming long-running job progress to the UI",
        "An app-isolated database that never shares a schema with the platform core",
      ],
      operationalStatus:
        "A working internal-grade tool, published as a showcase. Not sold, not commercially operated, and not offering support or SLAs.",
    },
  },
  {
    // Any signed-in active user may open AppBuilder; per-generated-app
    // ownership/collaborator access is enforced separately inside the app
    // (apps/appbuilder/lib/repositories/authz.ts), not at this platform gate.
    key: "appbuilder",
    name: "AppBuilder",
    description: "Describe an internal app in plain language and get a controlled, versioned application back.",
    glyph: "AB",
    meta: "appbuilder.asafarim.com",
    status: "active",
    access: "authenticated",
  },
  {
    // DevTools is a separate deployment on asafarim.be (its own docker-compose
    // project on the same VPS), not a subdomain of asafarim.com. It is listed
    // here so the platform launcher and app-switcher link to it; access is
    // "public" because the DevTools app handles its own auth independently.
    key: "devtools",
    name: "DevTools",
    description: "Developer tooling and utilities — logo normalizer and more.",
    glyph: "DT",
    meta: "asafarim.be",
    status: "active",
    access: "public",
  },
  {
    // Landing page is a public marketing/product page with no auth gate
    // (app/page.tsx renders unconditionally); student/tutor routes gate
    // themselves individually via requireStudent/requireRole, same split
    // as vionto and testora. "authenticated" here hid EduMatch from every
    // platform switcher's anonymous-visitor view (e.g. Hub's, which
    // filters by canAccessApp), even though the page itself was already
    // reachable and browsable without signing in.
    key: "edumatch",
    name: "EduMatch",
    description: "AI learning support and an explainable, trusted tutor marketplace.",
    glyph: "EM",
    meta: "edumatch.asafarim.com",
    status: "active",
    access: "public",
    showcase: {
      label: SHOWCASE_LABEL,
      summary:
        "A working showcase project built and deployed by ASafarIM Digital. The matching engine, bookings, disputes, and admin workflows are real and running on production infrastructure — but this is not an operating tutor marketplace. The tutors shown are synthetic, and no money changes hands.",
      aboutLabel: "See what's real and what's demonstration data",
      aboutHref: SHOWCASE_ABOUT_HREF,
      aboutTitle: "A complete marketplace architecture — without the marketplace.",
      functional: [
        {
          title: "AI-guided matching and explanations",
          body: "Student inquiries get moderated AI responses and tutor matches ranked by subject fit, distance, and rating. The engine runs for real; it is not a scripted demo path.",
        },
        {
          title: "Single sign-on and RBAC",
          body: "One account shared across every ASafarIM app. Student, tutor, admin, and superadmin permissions are enforced and covered by tests.",
        },
        {
          title: "Shared production data layer",
          body: "PostgreSQL via Prisma, on the same schema conventions and migration pipeline as the rest of the platform — not a throwaway sandbox database.",
        },
        {
          title: "Full booking and dispute lifecycle",
          body: "Quote → accept → schedule → complete/cancel/dispute → admin resolution, with audit logging and notifications at every step.",
        },
      ],
      synthetic: [
        {
          title: "The tutors are invented",
          body: "The profiles on the landing page and in the seeded data are illustrative. EduMatch has no real tutor supply, no students, and no bookings from members of the public.",
        },
        {
          title: "Money never actually moves",
          body: "The Stripe Connect checkout flow runs and renders Stripe's own UI, but nothing settles: there is no merchant, no payout, and no commercial transaction on the other side.",
        },
      ],
      demonstrates: [
        "Explainable ranking with hard constraints reported separately from weighted scoring",
        "Multi-role RBAC across a shared platform identity",
        "A long-lived state machine (quote → booking → dispute → resolution) with audit trail",
        "Moderation and academic-integrity guardrails around an LLM surface",
      ],
      operationalStatus:
        "Not an operating tutor marketplace. EduMatch is a portfolio project in a real-world environment: deployed, explorable, and technically complete, with no commercial activity behind it.",
    },
    // Dutch is EduMatch's other "live" locale (see the app's own i18n
    // dictionary) — fr/de/lb fall back to the English `showcase` above
    // until they're translated too, same convention as the rest of the app.
    showcaseByLocale: {
      nl: {
        label: SHOWCASE_LABEL,
        summary:
          "Een werkend showcaseproject, gebouwd en uitgerold door ASafarIM Digital. De matching-engine, boekingen, geschillen en beheerworkflows zijn echt en draaien op productie-infrastructuur — maar dit is geen operationele tutor-marktplaats. De getoonde tutors zijn synthetisch en er gaat geen geld om.",
        aboutLabel: "Bekijk wat echt is en wat demonstratiedata is",
        aboutHref: SHOWCASE_ABOUT_HREF,
        aboutTitle: "Een complete marktplaatsarchitectuur — zonder de marktplaats.",
        functional: [
          {
            title: "AI-gestuurde matching en uitleg",
            body: "Vragen van studenten krijgen gemodereerde AI-antwoorden en tutor-matches gerangschikt op vakgebied, afstand en beoordeling. De engine draait echt; het is geen gescript demopad.",
          },
          {
            title: "Eenmalige aanmelding en RBAC",
            body: "Eén account gedeeld over elke ASafarIM-app. Rechten voor student, tutor, beheerder en superadmin worden afgedwongen en zijn gedekt door tests.",
          },
          {
            title: "Gedeelde productie-datalaag",
            body: "PostgreSQL via Prisma, volgens dezelfde schemaconventies en migratiepijplijn als de rest van het platform — geen wegwerp-sandboxdatabase.",
          },
          {
            title: "Volledige boekings- en geschillencyclus",
            body: "Offerte → accepteren → plannen → afronden/annuleren/betwisten → beheerdersbeslissing, met auditlogging en meldingen bij elke stap.",
          },
        ],
        synthetic: [
          {
            title: "De tutors zijn verzonnen",
            body: "De profielen op de landingspagina en in de geseede data zijn illustratief. EduMatch heeft geen echt tutoraanbod, geen studenten en geen boekingen van het publiek.",
          },
          {
            title: "Er gaat nooit echt geld om",
            body: "De Stripe Connect-afrekenflow werkt en toont Stripe's eigen interface, maar er wordt niets verrekend: er is geen handelaar, geen uitbetaling en geen commerciële transactie aan de andere kant.",
          },
        ],
        demonstrates: [
          "Verklaarbare rangschikking waarbij harde randvoorwaarden apart van de gewogen score worden gerapporteerd",
          "RBAC met meerdere rollen binnen één gedeelde platformidentiteit",
          "Een langlevende toestandsmachine (offerte → boeking → geschil → beslissing) met auditspoor",
          "Moderatie en academische-integriteitswaarborgen rond een LLM-oppervlak",
        ],
        operationalStatus:
          "Geen operationele tutor-marktplaats. EduMatch is een portfolioproject in een realistische omgeving: uitgerold, verkenbaar en technisch compleet, zonder commerciële activiteit erachter.",
      },
    },
  },
  {
    // Public landing + guest create/export/submit flow, same public-first
    // split as vionto/testora/edumatch — dashboard and admin gate
    // themselves individually inside the app (requireUser/requireRole).
    key: "timelineai",
    name: "TimelineAI",
    description: "Create polished, visual timelines — project plans, roadmaps, and storytelling.",
    glyph: "TL",
    meta: "tlai.asafarim.com",
    status: "active",
    access: "public",
    showcase: {
      label: SHOWCASE_LABEL,
      summary:
        "A working showcase product from ASafarIM Digital. Create and export real timelines — no account needed. It runs on the same production infrastructure as the rest of the platform, and it is not a commercial service or marketplace.",
      aboutLabel: "Behind this project",
      aboutHref: SHOWCASE_ABOUT_HREF,
      aboutTitle: "A public tool you can actually use.",
      functional: [
        {
          title: "Guest creation and export",
          body: "Build a timeline and export it without an account. The editor, layouts, and themes are the real thing, not a canned preview.",
        },
        {
          title: "Accounts, dashboard, and publishing",
          body: "Signing in adds a dashboard and the ability to publish to the public gallery, using the platform's shared single sign-on.",
        },
        {
          title: "Moderated public gallery",
          body: "Published timelines pass through an admin moderation queue before they appear, with the same role checks used elsewhere on the platform.",
        },
      ],
      synthetic: [
        {
          title: "Gallery content is illustrative",
          body: "Timelines in the public gallery are examples created to show the tool's range. Treat them as samples rather than as a community of users.",
        },
        {
          title: "No commercial layer at all",
          body: "There is no marketplace, no seller, no listing, and nothing to buy. TimelineAI is a creation tool and nothing more.",
        },
      ],
      demonstrates: [
        "A guest-first product flow that upgrades cleanly into an authenticated one",
        "Curated layout and theming systems driven by content type",
        "Public publishing behind an admin moderation queue",
        "Server-rendered export from structured content",
      ],
      operationalStatus:
        "Free public showcase tool from ASafarIM Digital. Genuinely usable, deployed on production infrastructure, and not a commercial service.",
    },
  },
  {
    // Public, unstable-by-design workbench — see apps/labs/app/about. No
    // showcase block: it never claims to be a finished product, the /about
    // page already carries that disclaimer, and every experiment card
    // states its own status.
    key: "labs",
    name: "Labs",
    description: "The experimental workbench: prototypes and interactive canvases for what's next.",
    glyph: "LB",
    meta: "labs.asafarim.com",
    status: "active",
    access: "public",
  },
  // ── Deferred apps: visible as coming-soon metadata only. No access is
  //    granted until their implementation PRs land. ─────────────────────
  {
    key: "content-generator",
    name: "Content Generator",
    description: "Structured content drafting workspace.",
    glyph: "CG",
    meta: "content · planned",
    status: "coming-soon",
    access: null,
  },
  {
    key: "marketing-content",
    name: "Marketing Content",
    description: "Campaign and channel content planning.",
    glyph: "MC",
    meta: "marketing · planned",
    status: "coming-soon",
    access: null,
  },
] as const;

export interface AppAccessContext {
  /** Role names held by the user (empty for anonymous visitors). */
  roles: string[];
  /** Whether the user is signed in and active. */
  authenticated: boolean;
}

/** Deterministic explanation for an access decision. */
export type AppAccessReason =
  /* allowed */
  | "public" // app is open to everyone
  | "authenticated" // any signed-in active user may enter
  | "role" // one of the user's roles grants access
  | "superadmin" // explicit superadmin bypass
  /* denied */
  | "coming-soon" // app is registered but not yet built
  | "no-access-defined" // registered with access: null — nobody may enter
  | "not-authenticated" // app needs a session and there is none
  | "missing-role"; // signed in, but no qualifying role

export interface AppAccessDecision {
  allowed: boolean;
  reason: AppAccessReason;
}

/**
 * Evaluate whether a user (described by roles + auth state) may open an
 * app, with a deterministic reason for the decision. The superadmin
 * bypass is intentional and reported explicitly so it stays auditable.
 */
export function getAppAccessDecision(
  app: PlatformApp,
  context: AppAccessContext
): AppAccessDecision {
  if (app.status !== "active") return { allowed: false, reason: "coming-soon" };
  if (app.access === null) {
    return { allowed: false, reason: "no-access-defined" };
  }
  if (app.access === "public") return { allowed: true, reason: "public" };
  if (!context.authenticated) {
    return { allowed: false, reason: "not-authenticated" };
  }
  if (app.access === "authenticated") {
    return { allowed: true, reason: "authenticated" };
  }
  if (context.roles.includes(ROLES.SUPERADMIN)) {
    return { allowed: true, reason: "superadmin" };
  }
  if (context.roles.some((role) => (app.access as string[]).includes(role))) {
    return { allowed: true, reason: "role" };
  }
  return { allowed: false, reason: "missing-role" };
}

/** Whether a user (described by roles + auth state) may open an app. */
export function canAccessApp(
  app: PlatformApp,
  context: AppAccessContext
): boolean {
  return getAppAccessDecision(app, context).allowed;
}

/**
 * The showcase positioning for an app, or undefined if it has none.
 *
 * Landing pages read this rather than hardcoding their own copy, so the
 * claims an app makes about itself stay in one auditable place.
 */
export function getShowcaseProject(
  key: string,
  locale?: ShowcaseLocale
): ShowcaseProject | undefined {
  const app = getPlatformApp(key);
  if (!app) return undefined;
  if (locale) {
    const translated = app.showcaseByLocale?.[locale];
    if (translated) return translated;
  }
  return app.showcase;
}

/** Public product apps presented as working showcases. */
export function getShowcaseApps(): PlatformApp[] {
  return PLATFORM_APPS.filter((app) => app.showcase !== undefined);
}

/** Registry lookup by key. */
export function getPlatformApp(key: string): PlatformApp | undefined {
  return PLATFORM_APPS.find((app) => app.key === key);
}

/**
 * The apps to list in an app switcher, in registry order: everything the
 * user may actually open, minus the app they are already standing in.
 *
 * Every app's switcher must go through this. Hand-maintained per-app arrays
 * silently drift the moment a new app joins the platform — that is exactly
 * how EduMatch's menu ended up missing TimelineAI, Admin, and DevTools while
 * Showcase's was missing Vionto. Callers resolve URLs with
 * `getPlatformLinks()[app.key]`; the keys line up by design.
 *
 * Importable from `@asafarim/auth/apps` so client components can use it
 * without pulling the server-only Auth.js surface into the browser bundle.
 */
export function getAppSwitcherApps(
  currentKey: string,
  context: AppAccessContext
): PlatformApp[] {
  return PLATFORM_APPS.filter(
    (app) => app.key !== currentKey && canAccessApp(app, context)
  );
}

/** Active apps a user may open — e.g. the derived "allowed apps" badges. */
export function getAccessibleApps(context: AppAccessContext): PlatformApp[] {
  return PLATFORM_APPS.filter((app) => canAccessApp(app, context));
}
