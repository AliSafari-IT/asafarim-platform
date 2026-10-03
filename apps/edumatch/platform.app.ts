/**
 * edumatch: ASafarIM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "edumatch",
  name: "EduMatch",
  version: "0.3.0",
  platform: ">=0.1 <1",
  owner: "ASafarIM Digital",
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
  },
};
