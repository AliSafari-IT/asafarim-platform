/**
 * testora: ASafarIM OS app manifest (#765). DESCRIPTIVE ONLY: nothing reads
 * this file at runtime yet. It states what this app is today, so the
 * asafarim-os drift report (`platform sync --check --against <this repo>`)
 * can compare it with the hand-written registry, compose, bake, build plan and
 * Caddy files. Schema: @asafarim/app-manifest in AliSafari-IT/asafarim-os.
 */
export default {
  id: "testora",
  name: "Testora",
  version: "1.0.0",
  platform: ">=0.1 <1",
  owner: "ASafarIM Digital",
  domains: {
    primary: "testora.asafarim.com",
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
  },
};
