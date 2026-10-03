/**
 * showcase: ASafariM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "showcase",
  name: "Showcase",
  version: "0.1.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "showcase.asafarim.com",
  },
  runtime: {
    image: "showcase",
    port: 3000,
    health: {
      live: "/api/status",
      ready: "/api/status",
    },
    resources: {
      memory: "256m",
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
    glyph: "SC",
    color: "#047857",
    nav: [],
    status: "active",
  },
};
