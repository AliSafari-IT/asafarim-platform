/**
 * vionto: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "vionto",
  name: "Vionto",
  version: "0.4.2",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "vionto.asafarim.com",
  },
  runtime: {
    image: "vionto",
    port: 3000,
    health: {
      live: "/api/health",
      ready: "/api/status",
    },
    resources: {
      memory: "384m",
      cpus: 0.5,
    },
    workers: [
      {
        name: "render",
        image: "vionto-worker",
        network: "internal",
        resources: {
          memory: "4g",
          cpus: 2,
        },
      },
    ],
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
      key: "vionto.videos.create",
      description: "Create albums and render videos",
    },
    {
      key: "vionto.uploads.cleanup",
      description: "Clean up other users' orphaned uploads",
    },
  ],
  roles: [
    {
      key: "vionto.creator",
      grants: ["vionto.videos.create"],
    },
    {
      key: "vionto.admin",
      grants: ["vionto.*"],
    },
  ],
  ui: {
    glyph: "VN",
    color: "#e11d48",
    nav: [],
    status: "active",
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    // Vionto's own proxy keeps the landing and creation entry public;
    // project work requires sign-in inside the app itself.
    launcher: {
      description: "Photo-to-story studio: turn photo collections into narrated videos.",
      meta: "vionto.asafarim.com · beta",
      access: "public",
      requiresAccountToUse: true,
      order: 50,
    },
  },
};
