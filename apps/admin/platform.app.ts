/**
 * admin: ASafarIM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 *
 * Id: `admin` is reserved by the manifest schema, so this app is
 * `admin-console`. The launcher registry key stays `admin` until ASafarIM OS P1
 * generates the registry from the manifests, so the drift report shows
 * `registry: admin` as unclaimed. That ✖ is expected and explained here (#767).
 */
export default {
  id: "admin-console",
  name: "Admin Console",
  version: "0.2.0",
  platform: ">=0.1 <1",
  owner: "ASafarIM Digital",
  domains: {
    primary: "admin.asafarim.com",
  },
  runtime: {
    image: "admin",
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
    engine: "postgres",
    migrations: "prisma",
  },
  auth: {
    client: "oidc",
    publicPaths: [],
  },
  permissions: [
    {
      key: "admin-console.access",
      description: "Use the admin console (users, roles, settings, seed data)",
    },
    {
      key: "admin-console.superadmin",
      description:
        "Superadmin-only operations (granting admin, destructive maintenance)",
    },
  ],
  roles: [
    {
      key: "admin-console.admin",
      grants: ["admin-console.access"],
    },
    {
      key: "admin-console.superadmin",
      grants: ["admin-console.*"],
    },
  ],
  ui: {
    glyph: "AD",
    color: "#15803d",
    nav: [],
    status: "active",
  },
};
