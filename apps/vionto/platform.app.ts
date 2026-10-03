/**
 * vionto: ASafarIM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "vionto",
  name: "Vionto",
  version: "0.4.2",
  platform: ">=0.1 <1",
  owner: "ASafarIM Digital",
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
  },
};
