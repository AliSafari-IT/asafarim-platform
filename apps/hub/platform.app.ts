/**
 * hub: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "hub",
  name: "Hub",
  version: "0.1.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "hub.asafarim.com",
  },
  runtime: {
    image: "hub",
    port: 3000,
    health: {
      live: "/api/status",
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
    publicPaths: ["/", "/sign-in", "/sign-up"],
  },
  permissions: [
    {
      key: "hub.admin.view",
      description: "See the admin entries on the Hub dashboard",
    },
  ],
  roles: [
    {
      key: "hub.admin",
      grants: ["hub.*"],
    },
  ],
  ui: {
    glyph: "HB",
    color: "#6d28d9",
    nav: [
      {
        label: "Dashboard",
        href: "/dashboard",
      },
      {
        label: "Profile",
        href: "/profile",
      },
    ],
    status: "active",
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    launcher: {
      description: "The signed-in workbench: dashboard, profile, and app launcher.",
      meta: "hub.asafarim.com",
      access: "authenticated",
      order: 20,
    },
  },
};
