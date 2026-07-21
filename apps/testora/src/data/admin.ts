import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import {
  apiScript,
  uiSmoke,
  buildChapter,
  type AdminPageSpec,
} from "./_admin-shared";
import {
  adminCreditsUiFlowFixture,
  adminCreditsUiFlowCases,
} from "./admin-credits-ui-flow";

/**
 * Accounts & Billing — the first admin chapter. The four account/credit pages
 * get deep, hand-written coverage; the remaining billing pages (Payments,
 * RevenueCat, Pricing, Promo Codes, E-Invoicing, Accounting) get the standard
 * GET-endpoint + access-control + browser-smoke set via buildChapter().
 *
 * The four hand-written pages:
 *
 *   /en/admin/users    — every account (no role filter)   → AdminAccountsCrud "users"
 *   /en/admin/clients  — customers (role 'user')           → AdminAccountsCrud "clients"
 *   /en/admin/agents   — agents (role 'agent')             → AdminAccountsCrud "agents"
 *   /en/admin/credits  — credit balances + grant history   → CreditsManagementPage
 *
 * All four are thin UIs over the JWT- and role-guarded `/admin/*` API
 * (`AdminController`, gated by `@Roles(Admin)` + a service-level admin check —
 * so role ∈ {admin, superadmin} is required; a plain user/agent gets 403, and
 * an unauthenticated request gets 401). The page components carry no
 * data-testids and lean heavily on i18n, so — exactly like the scraper and
 * registration suites — the bulk of the coverage drives the backend directly
 * with TestCafe's `t.request`, and each page additionally gets one thin browser
 * smoke that proves an admin can load the page and its table renders.
 *
 * Auth: every case logs in once per fixture via /auth/login (token cached on
 * globalThis for the spec process) using WEBAPP_ADMIN_EMAIL + WEBAPP_ADMIN_PASSWORD.
 * THE TEST ACCOUNT MUST BE admin/superadmin — otherwise the admin endpoints
 * answer 403 and the cases fail with a message saying so. /auth/login is
 * throttled (10/60s); the token cache keeps each API fixture to a single login,
 * but running the whole requirement at once does many logins — prefer running a
 * single suite/fixture while iterating.
 *
 * Mutations are kept re-runnable and self-cleaning: temp accounts use unique
 * plus-addressed emails derived from WEBAPP_ADMIN_EMAIL and are soft-deleted at
 * the end of the case. Credit assertions compare two mutation responses
 * (delta in → balance out) so they never depend on the exact starter balance.
 */

/* ------------------------------------------------------------------ */
/* Functional requirement + suites                                    */
/* ------------------------------------------------------------------ */

export const accountsBillingFR: FunctionalRequirementDefinition = {
  id: "accounts-billing",
  title: "Admin · Accounts & Billing",
  description:
    "Accounts and billing administration: Users, Clients, Agents, Credits, Payments, RevenueCat, Pricing, Promo Codes, E-Invoicing and Accounting.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

export const adminUsersSuite: TestSuiteDefinition = {
  suiteId: "admin-users",
  frId: "accounts-billing",
  title: "Admin · Users",
  description: "All accounts: listing, search, filtering, creation and lifecycle, plus access control.",
};

export const adminClientsSuite: TestSuiteDefinition = {
  suiteId: "admin-clients",
  frId: "accounts-billing",
  title: "Admin · Clients",
  description: "Customer accounts (role 'user') — the role-scoped view of the accounts surface.",
};

export const adminAgentsSuite: TestSuiteDefinition = {
  suiteId: "admin-agents",
  frId: "accounts-billing",
  title: "Admin · Agents",
  description: "Agent accounts (role 'agent') — role-scoped listing plus agent creation.",
};

export const adminCreditsSuite: TestSuiteDefinition = {
  suiteId: "admin-credits",
  frId: "accounts-billing",
  title: "Admin · Credits",
  description: "Credit grants and adjustments, validation limits, and the global grant history.",
};

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

export const adminUsersApiFixture: TestFixtureDefinition = {
  fixtureId: "admin-users-api",
  suiteId: "admin-users",
  title: "Users API — list, search, filters, create + lifecycle, access control",
  baseUrl: "/en/login",
  commonInput: {},
  // Creates and soft-deletes real accounts — never run against a web deployment.
  metadata: { destructive: true },
};

export const adminUsersUiFixture: TestFixtureDefinition = {
  fixtureId: "admin-users-ui",
  suiteId: "admin-users",
  title: "Users page — admin can open the accounts table",
  baseUrl: "/en/admin/users",
  commonInput: {},
  metadata: { ui: true },
};

export const adminClientsApiFixture: TestFixtureDefinition = {
  fixtureId: "admin-clients-api",
  suiteId: "admin-clients",
  title: "Clients API — list scoped to role 'user'",
  baseUrl: "/en/login",
  commonInput: {},
};

export const adminClientsUiFixture: TestFixtureDefinition = {
  fixtureId: "admin-clients-ui",
  suiteId: "admin-clients",
  title: "Clients page — admin can open the clients table",
  baseUrl: "/en/admin/clients",
  commonInput: {},
  metadata: { ui: true },
};

export const adminAgentsApiFixture: TestFixtureDefinition = {
  fixtureId: "admin-agents-api",
  suiteId: "admin-agents",
  title: "Agents API — list scoped to role 'agent' + agent creation",
  baseUrl: "/en/login",
  commonInput: {},
  // Creates and soft-deletes real agent accounts.
  metadata: { destructive: true },
};

export const adminAgentsUiFixture: TestFixtureDefinition = {
  fixtureId: "admin-agents-ui",
  suiteId: "admin-agents",
  title: "Agents page — admin can open the agents table",
  baseUrl: "/en/admin/agents",
  commonInput: {},
  metadata: { ui: true },
};

export const adminCreditsApiFixture: TestFixtureDefinition = {
  fixtureId: "admin-credits-api",
  suiteId: "admin-credits",
  title: "Credits API — assign, adjust, validation matrix + history",
  baseUrl: "/en/login",
  commonInput: {},
  // Creates temp accounts and mutates their credit balances.
  metadata: { destructive: true },
};

export const adminCreditsUiFixture: TestFixtureDefinition = {
  fixtureId: "admin-credits-ui",
  suiteId: "admin-credits",
  title: "Credits page — admin can open the credits dashboard",
  baseUrl: "/en/admin/credits",
  commonInput: {},
  metadata: { ui: true },
};

/* ------------------------------------------------------------------ */
/* Cases — Users API                                                  */
/* ------------------------------------------------------------------ */

export const adminUsersApiCases: TestCaseDefinition[] = [
  {
    caseId: "users-list-returns-paginated-shape",
    fixtureId: "admin-users-api",
    title: "GET /admin/users returns a paginated envelope",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/admin/users?page=1&limit=20');
if (res.status === 403) throw new Error('403 from /admin/users — the test account is not admin/superadmin.');
await t.expect(res.status).eql(200, 'expected 200 from /admin/users, got ' + res.status);
await t.expect(Array.isArray(res.body.data)).ok('expected body.data to be an array');
await t.expect(res.body.meta).ok('expected pagination meta');
await t.expect(res.body.meta.limit).eql(20, 'expected the requested limit to be echoed in meta');
await t.expect(typeof res.body.meta.total).eql('number', 'expected meta.total to be a number');
`),
  },
  {
    caseId: "users-list-rejects-unauthenticated",
    fixtureId: "admin-users-api",
    title: "GET /admin/users without a token is rejected (401/403)",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await t.request.get(api + '/admin/users', { headers: {} });
await t.expect([401, 403]).contains(res.status, 'expected an unauthenticated admin request to be rejected, got ' + res.status);
`),
  },
  {
    caseId: "users-search-matches-email",
    fixtureId: "admin-users-api",
    title: "Search narrows the list to matching emails",
    scriptType: "scripted",
    script: apiScript(`
const res = await authGet('/admin/users?limit=50&q=' + encodeURIComponent(ADMIN_EMAIL));
await t.expect(res.status).eql(200);
await t.expect(res.body.data.length).gte(1, 'expected the admin account to match its own email search');
const local = ADMIN_EMAIL.split('@')[0].toLowerCase();
for (const u of res.body.data) {
  const hay = ((u.email || '') + ' ' + (u.name || '')).toLowerCase();
  await t.expect(hay.indexOf(local) !== -1).ok('row ' + u.email + ' did not match the search term');
}
`),
    expected: {},
  },
  {
    caseId: "users-limit-clamped-to-100",
    fixtureId: "admin-users-api",
    title: "An oversized page limit is clamped to 100",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/admin/users?limit=500');
await t.expect(res.status).eql(200);
await t.expect(res.body.meta.limit).eql(100, 'expected limit to be clamped to 100');
`),
  },
  {
    caseId: "users-status-filter-active",
    fixtureId: "admin-users-api",
    title: "status=active returns only active accounts",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/admin/users?limit=50&status=active');
await t.expect(res.status).eql(200);
for (const u of res.body.data) {
  if (u.status) await t.expect(u.status).eql('active', 'row ' + u.email + ' is not active');
}
`),
  },
  {
    caseId: "users-create-then-soft-delete",
    fixtureId: "admin-users-api",
    title: "Create an account, read it back, then soft-delete it",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const created = await createTempUser('user');
await t.expect(created.id).ok('created user is missing an id');
await t.expect((created.email || '').toLowerCase()).contains('+e2e', 'unexpected created email');

const fetched = await authGet('/admin/users/' + created.id);
await t.expect(fetched.status).eql(200, 'expected to read the new user back');

const del = await authDelete('/admin/users/' + created.id);
await t.expect(del.status).eql(200, 'expected soft-delete to succeed');
await t.expect(del.body.deleted).ok('expected { deleted: true } from soft-delete');
`),
  },
  {
    caseId: "users-create-rejects-duplicate-email",
    fixtureId: "admin-users-api",
    title: "Creating a user with an existing email is rejected (403)",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authPost('/admin/users', { email: ADMIN_EMAIL, password: 'TestPass123!', role: 'user' });
await t.expect(res.status).eql(403, 'expected a duplicate email to be rejected with 403, got ' + res.status);
`),
  },
  {
    caseId: "users-create-rejects-weak-password",
    fixtureId: "admin-users-api",
    title: "Creating a user with a short password is rejected (400)",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authPost('/admin/users', { email: uniqueEmail(), password: 'short', role: 'user' });
await t.expect(res.status).eql(400, 'expected password < 8 chars to be rejected with 400, got ' + res.status);
`),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Clients API                                                */
/* ------------------------------------------------------------------ */

export const adminClientsApiCases: TestCaseDefinition[] = [
  {
    caseId: "clients-scoped-to-role-user",
    fixtureId: "admin-clients-api",
    title: "Clients view returns only role 'user' accounts",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/admin/users?limit=50&role=user');
if (res.status === 403) throw new Error('403 from /admin/users — the test account is not admin/superadmin.');
await t.expect(res.status).eql(200);
for (const u of res.body.data) {
  await t.expect(u.role).eql('user', 'clients view leaked a non-user account: ' + u.email + ' (' + u.role + ')');
}
`),
  },
  {
    caseId: "clients-search-stays-within-role",
    fixtureId: "admin-clients-api",
    title: "Searching within Clients keeps the role filter",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/admin/users?limit=50&role=user&q=a');
await t.expect(res.status).eql(200);
for (const u of res.body.data) {
  await t.expect(u.role).eql('user', 'a searched client row was not role user: ' + u.email);
}
`),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Agents API                                                 */
/* ------------------------------------------------------------------ */

export const adminAgentsApiCases: TestCaseDefinition[] = [
  {
    caseId: "agents-scoped-to-role-agent",
    fixtureId: "admin-agents-api",
    title: "Agents view returns only role 'agent' accounts",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/admin/users?limit=50&role=agent');
if (res.status === 403) throw new Error('403 from /admin/users — the test account is not admin/superadmin.');
await t.expect(res.status).eql(200);
for (const u of res.body.data) {
  await t.expect(u.role).eql('agent', 'agents view leaked a non-agent account: ' + u.email + ' (' + u.role + ')');
}
`),
  },
  {
    caseId: "agents-create-with-agent-role",
    fixtureId: "admin-agents-api",
    title: "Creating an agent persists the 'agent' role, then clean up",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const created = await createTempUser('agent');
await t.expect(created.role).eql('agent', 'expected the created account to have role agent');
await cleanup(created.id);
`),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Credits API                                                */
/* ------------------------------------------------------------------ */

export const adminCreditsApiCases: TestCaseDefinition[] = [
  {
    caseId: "credits-assign-adds-to-balance",
    fixtureId: "admin-credits-api",
    title: "PATCH credits grants add to the running balance",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const u = await createTempUser('user');
const first = await authPatch('/admin/users/' + u.id + '/credits', { credits: 10, note: 'e2e grant #1' });
await t.expect(first.status).eql(200, 'first grant failed: ' + JSON.stringify(first.body));
const before = first.body.creditsRemaining;
const second = await authPatch('/admin/users/' + u.id + '/credits', { credits: 10, note: 'e2e grant #2' });
await t.expect(second.status).eql(200);
await t.expect(second.body.creditsRemaining).eql(before + 10, 'a +10 grant should raise the balance by exactly 10');
await cleanup(u.id);
`),
  },
  {
    caseId: "credits-validation-matrix",
    fixtureId: "admin-credits-api",
    title: "Invalid credit operations are rejected",
    scriptType: "scripted",
    runs: [
      { op: "assign", body: { credits: 501, note: "over the cap" }, expectStatus: 400, scenario: "grant above 500" },
      { op: "assign", body: { credits: 0, note: "below the floor" }, expectStatus: 400, scenario: "grant below 1" },
      { op: "adjust", body: { delta: 0, reason: "noop" }, expectStatus: 400, scenario: "zero delta" },
      { op: "adjust", body: { delta: 10 }, expectStatus: 400, scenario: "missing reason" },
    ],
    expected: {},
    script: apiScript(`
// Validation fails before any mutation, so it is safe to target the admin's
// own account without changing its balance.
const targetId = await getAdminId();
const path = '/admin/users/' + targetId + '/credits';
const res = run.op === 'assign' ? await authPatch(path, run.body) : await authPost(path, run.body);
await t.expect(res.status).eql(run.expectStatus, 'scenario "' + run.scenario + '" expected ' + run.expectStatus + ' but got ' + res.status + ': ' + JSON.stringify(res.body));
`),
  },
  {
    caseId: "credits-global-history-shape",
    fixtureId: "admin-credits-api",
    title: "Global credit history returns audit rows",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/admin/credits/history?limit=5');
await t.expect(res.status).eql(200);
await t.expect(Array.isArray(res.body.data)).ok('expected history body.data to be an array');
for (const item of res.body.data) {
  await t.expect(typeof item.delta).eql('number', 'each history row should carry a numeric delta');
}
`),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — UI smokes (one per page)                                   */
/* ------------------------------------------------------------------ */

export const adminUsersUiCases: TestCaseDefinition[] = [
  {
    caseId: "users-page-loads-for-admin",
    fixtureId: "admin-users-ui",
    title: "Admin can open the Users page and see the accounts table",
    scriptType: "scripted",
    expected: {},
    script: uiSmoke("/en/admin/users", "Create user"),
  },
];

export const adminClientsUiCases: TestCaseDefinition[] = [
  {
    caseId: "clients-page-loads-for-admin",
    fixtureId: "admin-clients-ui",
    title: "Admin can open the Clients page and see the clients table",
    scriptType: "scripted",
    expected: {},
    script: uiSmoke("/en/admin/clients", "Create client"),
  },
];

export const adminAgentsUiCases: TestCaseDefinition[] = [
  {
    caseId: "agents-page-loads-for-admin",
    fixtureId: "admin-agents-ui",
    title: "Admin can open the Agents page and see the agents table",
    scriptType: "scripted",
    expected: {},
    script: uiSmoke("/en/admin/agents", "Create agent"),
  },
];

export const adminCreditsUiCases: TestCaseDefinition[] = [
  {
    caseId: "credits-page-loads-for-admin",
    fixtureId: "admin-credits-ui",
    title: "Admin can open the Credits dashboard and see the table",
    scriptType: "scripted",
    expected: {},
    // "/ page" is a hardcoded label in the items-per-page selector, so it
    // survives the page's otherwise heavily i18n'd copy.
    script: uiSmoke("/en/admin/credits", "/ page"),
  },
];

/* ------------------------------------------------------------------ */
/* Remaining billing pages (standard GET + access + smoke set)        */
/* ------------------------------------------------------------------ */

const billingPages: AdminPageSpec[] = [
  {
    id: "payments",
    title: "Payments",
    uiPath: "/en/admin/payments",
    description: "Payment transactions: list, filter and reconcile Stripe charges.",
    api: { path: "/admin/payments?limit=5", shape: "list" },
  },
  {
    id: "revenuecat",
    title: "RevenueCat",
    uiPath: "/en/admin/revenuecat",
    description: "Subscription metrics and subscribers sourced from RevenueCat.",
    // Metrics call the RevenueCat API, which may be unconfigured locally.
    api: { path: "/admin/revenuecat/metrics", shape: "object", tolerant: [200, 500, 502, 503] },
  },
  {
    id: "pricing",
    title: "Pricing",
    uiPath: "/en/admin/pricing",
    description: "Pricing plan catalog shown on the marketing site.",
    api: { path: "/admin/content/pricing-plans", shape: "list" },
  },
  {
    id: "promo-codes",
    title: "Promo Codes",
    uiPath: "/en/admin/promo-codes",
    description: "Discount/promo code management.",
    api: { path: "/admin/promo-codes?limit=5", shape: "list" },
  },
  {
    // No clean admin list endpoint backs this page — browser smoke only.
    id: "e-invoicing",
    title: "E-Invoicing",
    uiPath: "/en/admin/e-invoicing",
    description: "Peppol e-invoicing transmission status.",
  },
];

const billing = buildChapter("accounts-billing", billingPages);

/* ------------------------------------------------------------------ */
/* Aggregates for the seeder                                          */
/* ------------------------------------------------------------------ */

export const accountsBillingSuites: TestSuiteDefinition[] = [
  adminUsersSuite,
  adminClientsSuite,
  adminAgentsSuite,
  adminCreditsSuite,
  ...billing.suites,
];

export const accountsBillingFixtures: TestFixtureDefinition[] = [
  adminUsersApiFixture,
  adminUsersUiFixture,
  adminClientsApiFixture,
  adminClientsUiFixture,
  adminAgentsApiFixture,
  adminAgentsUiFixture,
  adminCreditsApiFixture,
  adminCreditsUiFixture,
  adminCreditsUiFlowFixture,
  ...billing.fixtures,
];

export const accountsBillingCases: TestCaseDefinition[] = [
  ...adminUsersApiCases,
  ...adminUsersUiCases,
  ...adminClientsApiCases,
  ...adminClientsUiCases,
  ...adminAgentsApiCases,
  ...adminAgentsUiCases,
  ...adminCreditsApiCases,
  ...adminCreditsUiCases,
  ...adminCreditsUiFlowCases,
  ...billing.cases,
];
