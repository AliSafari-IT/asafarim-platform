/**
 * web: ASafariM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "web",
  name: "ASafariM Digital",
  version: "0.2.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "asafarim.com",
    aliases: ["www.asafarim.com"],
  },
  runtime: {
    image: "web",
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
    publicPaths: ["/"],
  },
  permissions: [
    {
      key: "web.contact.attachments.read-any",
      description:
        "Open any visitor's contact-form attachment (owners always see their own)",
    },
  ],
  roles: [
    {
      key: "web.admin",
      grants: ["web.*"],
    },
  ],
  ui: {
    glyph: "WB",
    color: "#9f4a07",
    nav: [],
    status: "active",
  },
};
