/**
 * labs: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "labs",
  name: "Labs",
  version: "0.1.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
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
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    // Public, unstable-by-design workbench — see apps/labs/app/about. No
    // showcase block: it never claims to be a finished product, the /about
    // page already carries that disclaimer, and every experiment card
    // states its own status.
    launcher: {
      description: "The experimental workbench: prototypes and interactive canvases for what's next.",
      meta: "labs.asafarim.com",
      access: "public",
      order: 110,
    },
  },
};
