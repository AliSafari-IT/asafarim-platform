/**
 * resumatch: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "resumatch",
  name: "ResuMatch",
  version: "0.1.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
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
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    // Authenticated-only in the launcher: the landing page at / is public
    // (proxy.ts allows it), while the candidate workspace requires a session.
    // ResuMatch is a deployed, non-commercial portfolio showcase — an
    // AI-powered CV-tailoring tool, not a job-search or recruiting service.
    launcher: {
      description: "AI-tailored CVs: paste a job URL, rewrite your resume toward it.",
      meta: "resumatch.asafarim.com",
      access: "authenticated",
      order: 120,
    },
  },
};
