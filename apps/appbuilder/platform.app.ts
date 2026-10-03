/**
 * appbuilder: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "appbuilder",
  name: "AppBuilder",
  version: "0.4.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "appbuilder.asafarim.com",
  },
  runtime: {
    image: "appbuilder",
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
        name: "generation",
        image: "appbuilder-worker",
        network: "internal",
        resources: {
          memory: "512m",
          cpus: 0.5,
        },
      },
    ],
  },
  database: {
    engine: "postgres",
    migrations: "drizzle",
    dedicated: true,
  },
  auth: {
    client: "oidc",
    publicPaths: [],
  },
  permissions: [
    {
      key: "appbuilder.apps.build",
      description: "Generate and edit apps",
    },
    {
      key: "appbuilder.quotas.override",
      description: "Override a user's generation quota",
    },
  ],
  roles: [
    {
      key: "appbuilder.builder",
      grants: ["appbuilder.apps.build"],
    },
    {
      key: "appbuilder.admin",
      grants: ["appbuilder.*"],
    },
  ],
  ui: {
    glyph: "AB",
    color: "#7c3aed",
    nav: [],
    status: "active",
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    // Any signed-in active user may open AppBuilder; per-generated-app
    // ownership/collaborator access is enforced separately inside the app
    // (apps/appbuilder/lib/repositories/authz.ts), not at this platform gate.
    launcher: {
      description: "Describe an internal app in plain language and get a controlled, versioned application back.",
      meta: "appbuilder.asafarim.com",
      access: "authenticated",
      order: 70,
    },
  },
};
