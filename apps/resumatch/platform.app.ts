/**
 * resumatch: ASafarIM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "resumatch",
  name: "ResuMatch",
  version: "0.1.0",
  platform: ">=0.1 <1",
  owner: "ASafarIM Digital",
  domains: {
    primary: "resumatch.asafarim.com",
  },
  runtime: {
    image: "resumatch",
    port: 3000,
    health: {
      live: "/api/health",
      ready: "/api/health",
    },
    resources: {
      memory: "384m",
      cpus: 0.5,
    },
  },
  database: {
    engine: "postgres",
    migrations: "prisma",
    dedicated: true,
  },
  auth: {
    client: "oidc",
    publicPaths: ["/"],
  },
  permissions: [
    {
      key: "resumatch.resumes.use",
      description: "Upload resumes and match them to jobs",
    },
  ],
  roles: [
    {
      key: "resumatch.user",
      grants: ["resumatch.resumes.use"],
    },
  ],
  ui: {
    glyph: "RM",
    color: "#0d9488",
    nav: [],
    status: "active",
  },
};
