/**
 * edumatch: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "edumatch",
  name: "EduMatch",
  version: "0.3.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "edumatch.asafarim.com",
  },
  runtime: {
    image: "edumatch",
    port: 3000,
    health: {
      live: "/api/health",
      ready: "/api/status",
    },
    resources: {
      memory: "512m",
      cpus: 0.5,
    },
  },
  database: {
    engine: "postgres",
    migrations: "prisma",
  },
  auth: {
    client: "oidc",
    publicPaths: ["/"],
  },
  permissions: [
    {
      key: "edumatch.learning.use",
      description: "Learn as a student: briefs, matches, bookings",
    },
    {
      key: "edumatch.tutoring.use",
      description: "Teach as a tutor: profile, proposals, sessions",
    },
    {
      key: "edumatch.platform.manage",
      description: "Administer EduMatch (tutors, disputes, payouts)",
    },
  ],
  roles: [
    {
      key: "edumatch.student",
      grants: ["edumatch.learning.use"],
    },
    {
      key: "edumatch.tutor",
      grants: ["edumatch.tutoring.use"],
    },
    {
      key: "edumatch.admin",
      grants: ["edumatch.*"],
    },
  ],
  ui: {
    glyph: "EM",
    color: "#2563eb",
    nav: [],
    status: "active",
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    // Landing page is a public marketing/product page with no auth gate
    // (app/page.tsx renders unconditionally); student/tutor routes gate
    // themselves individually via requireStudent/requireRole, same split
    // as vionto and testora. "authenticated" here hid EduMatch from every
    // platform switcher's anonymous-visitor view (e.g. Hub's, which
    // filters by canAccessApp), even though the page itself was already
    // reachable and browsable without signing in.
    launcher: {
      description: "AI learning support and an explainable, trusted tutor marketplace.",
      meta: "edumatch.asafarim.com",
      access: "public",
      requiresAccountToUse: true,
      order: 90,
    },
  },
};
