/**
 * testora: ASafariM OS app manifest (#765). No app reads this file
 * at runtime. Its ui.launcher block is generated into
 * generated/platform/launcher-registry.json (#769), which @asafarim/auth
 * reads; the rest is descriptive. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "testora",
  name: "Testora",
  version: "1.0.0",
  platform: ">=0.1 <1",
  owner: "ASafariM Digital",
  domains: {
    primary: "testora.asafarim.com",
    // Public pages (#762): testora.cloud serves the marketing pages, the rest redirects.
    aliases: ["testora.cloud", "www.testora.cloud"],
  },
  runtime: {
    image: "testora",
    port: 3000,
    health: {
      live: "/api/status",
      ready: "/api/status",
    },
    resources: {
      memory: "768m",
      cpus: 0.5,
    },
    workers: [
      {
        name: "runner",
        image: "testora-runner",
        network: "egress-only",
        resources: {
          memory: "3g",
          cpus: 2,
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
    publicPaths: ["/", "/about-this-project", "/roadmap"],
  },
  permissions: [
    {
      key: "testora.results.read",
      description: "See test results and evidence",
    },
    {
      key: "testora.tests.run",
      description: "Run tests against a target",
    },
    {
      key: "testora.issues.report",
      description: "Report a failure as a GitHub issue",
    },
    {
      key: "testora.catalog.manage",
      description: "Manage apps, suites, fixtures, targets",
    },
  ],
  roles: [
    {
      key: "testora.member",
      grants: ["testora.results.read"],
    },
    {
      key: "testora.tester",
      grants: [
        "testora.results.read",
        "testora.tests.run",
        "testora.issues.report",
      ],
    },
    {
      key: "testora.admin",
      grants: ["testora.*"],
    },
  ],
  routes: [
    {
      path: "/api/run",
      methods: ["POST"],
      permission: "testora.tests.run",
    },
    {
      path: "/internal/**",
      expose: false,
    },
  ],
  ui: {
    glyph: "TS",
    color: "#7c3aed",
    nav: [
      {
        label: "Run Tests",
        href: "/run",
      },
      {
        label: "Results",
        href: "/results",
      },
    ],
    status: "active",
    // The launcher tile (Hub, app switchers): `platform sync` writes it to
    // generated/platform/launcher-registry.json, which @asafarim/auth reads.
    // Public landing; private apps-under-test gate themselves on a signed-in
    // session inside the tool (see apps/testora app-access).
    launcher: {
      description: "Live end-to-end results for ASafariM apps — testers spot a failure and file it to our repo in one click.",
      meta: "testora.asafarim.com",
      access: "public",
      // Seeing per-app E2E results needs an account; running tests and filing
      // bugs to the platform repo also need the Tester role (or admin) —
      // apps/testora/src/lib/access-policy.ts. Guests only get the public pages.
      requiresAccountToUse: true,
      order: 60,
    },
  },
};
