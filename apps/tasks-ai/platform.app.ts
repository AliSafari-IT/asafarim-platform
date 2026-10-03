/**
 * tasks-ai: ASafariM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
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
  },
};
