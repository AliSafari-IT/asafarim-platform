/**
 * tasks-ai: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "tasksai",
  name: "TasksAI",
  version: "0.1.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "tasks-ai.asafarim.com",
  },
  runtime: {
    image: "tasksai",
    port: 3000,
    health: {
      live: "/api/health",
      ready: "/api/health",
    },
    resources: {
      memory: "256m",
      cpus: 0.5,
    },
    workers: [
      {
        name: "jobs",
        image: "tasksai-worker",
        network: "internal",
        resources: {
          memory: "384m",
          cpus: 0.5,
        },
      },
    ],
  },
  database: {
    engine: "postgres",
    migrations: "prisma",
    dedicated: true,
  },
  auth: {
    client: "oidc",
    publicPaths: [],
  },
  permissions: [
    {
      key: "tasksai.workspaces.use",
      description: "Work in the workspaces you belong to",
    },
    {
      key: "tasksai.costs.read-all",
      description: "See AI cost across the whole workspace",
    },
  ],
  roles: [
    {
      key: "tasksai.member",
      grants: ["tasksai.workspaces.use"],
    },
    {
      key: "tasksai.admin",
      grants: ["tasksai.*"],
    },
  ],
  ui: {
    glyph: "TA",
    color: "#4f46e5",
    nav: [],
    status: "active",
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    // Public landing at / (proxy.ts allows it); the /workspace surface
    // requires a platform session. TasksAI is in early development — a
    // deployable shell, not a launched or commercial product. It keeps its
    // own isolated database and stores only an opaque platform user id.
    // See apps/tasks-ai/docs/charter.md and docs/adr/0001-dedicated-database.md.
    launcher: {
      description: "AI-native work execution: scattered intent to trusted execution.",
      meta: "tasks-ai.asafarim.com",
      access: "authenticated",
      order: 130,
    },
  },
};
