/**
 * labs: ASafarIM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "labs",
  name: "Labs",
  version: "0.1.0",
  platform: ">=0.1 <1",
  owner: "ASafarIM Digital",
  domains: {
    primary: "labs.asafarim.com",
  },
  runtime: {
    image: "labs",
    port: 3000,
    health: {
      live: "/api/status",
      ready: "/api/status",
    },
    resources: {
      memory: "192m",
      cpus: 0.25,
    },
  },
  database: {
    engine: "none",
  },
  auth: {
    client: "none",
    publicPaths: ["/"],
  },
  permissions: [],
  roles: [],
  ui: {
    glyph: "LB",
    color: "#ca8a04",
    nav: [],
    status: "active",
  },
};
