/**
 * timelineai: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "timelineai",
  name: "TimelineAI",
  version: "0.1.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "tlai.asafarim.com",
  },
  runtime: {
    image: "timelineai",
    port: 3000,
    health: {
      live: "/api/health",
      ready: "/api/status",
    },
    resources: {
      memory: "256m",
      cpus: 0.5,
    },
  },
  database: {
    engine: "postgres",
    migrations: "prisma",
  },
  auth: {
    client: "oidc",
    publicPaths: ["/", "/t/*"],
  },
  permissions: [
    {
      key: "timelineai.timelines.edit",
      description: "Create and edit your own timelines",
    },
    {
      key: "timelineai.admin.view",
      description: "Admin views (all timelines, moderation)",
    },
  ],
  roles: [
    {
      key: "timelineai.editor",
      grants: ["timelineai.timelines.edit"],
    },
    {
      key: "timelineai.admin",
      grants: ["timelineai.*"],
    },
  ],
  ui: {
    glyph: "TL",
    color: "#0891b2",
    nav: [],
    status: "active",
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    // Public landing + guest create/export/submit flow, same public-first
    // split as vionto/testora/edumatch — dashboard and admin gate
    // themselves individually inside the app (requireUser/requireRole).
    launcher: {
      description: "Create polished, visual timelines — project plans, roadmaps, and storytelling.",
      meta: "tlai.asafarim.com",
      access: "public",
      order: 100,
    },
  },
};
