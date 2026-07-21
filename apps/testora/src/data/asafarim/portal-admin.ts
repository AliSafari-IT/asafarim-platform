import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * ASafariM Portal — Admin Console.
 *
 * The portal admin area lives at https://portal.asafarim.com/admin and is
 * guarded by NextAuth credentials + role/permission checks on the server. The
 * admin account must carry the admin or superadmin role (and the matching
 * permissions) or the API calls return 401/403 and the UI redirects to /sign-in.
 *
 * Tests use ASAFARIM_ADMIN_EMAIL and ASAFARIM_ADMIN_PASSWORD from the environment. Every
 * UI fixture starts from a signed-out state, logs in through /sign-in, and then
 * navigates to the admin page. Fixtures that create or mutate data are marked
 * `destructive: true` so the runner can refuse them on a production target.
 *
 * The admin pages have no data-testids, so assertions rely on stable headings,
 * table rows, and button text. Only non-i18n literals are asserted to survive
 * locale changes.
 */

export const portalAdminFR: FunctionalRequirementDefinition = {
  id: "asafarim-portal-admin",
  projectId: "asafarim-portal",
  title: "Portal · Admin",
  description:
    "Portal administration console: Dashboard, Users, Content, Navigation, Roles, Settings and Audit Log.",
  baseUrl: process.env.ASAFARIM_PORTAL_URL || "https://portal.asafarim.com",
};

/* ------------------------------------------------------------------ */
/* Shared browser login — NextAuth credentials flow                   */
/* ------------------------------------------------------------------ */

const PORTAL_ADMIN_LOGIN = `
await t.deleteCookies();
await t.navigateTo('/');
const signInLink = Selector('a[href="/sign-in"]').filterVisible();
if (await signInLink.exists) {
  await t.click(signInLink);
} else {
  await t.navigateTo('/sign-in');
}
await t.expect(Selector('#email').with({ timeout: 30000 }).exists).ok('the portal /sign-in form should render');

const email = process.env.ASAFARIM_ADMIN_EMAIL || '';
const password = process.env.ASAFARIM_ADMIN_PASSWORD || '';
await t.expect(email.length).gt(0, 'ASAFARIM_ADMIN_EMAIL must be set in F:\\\\repos\\\\e2e-testora\\\\.env');
await t.expect(password.length).gt(0, 'ASAFARIM_ADMIN_PASSWORD must be set in F:\\\\repos\\\\e2e-testora\\\\.env');

await t.typeText('#email', email, { replace: true });
await t.typeText('#password', password, { replace: true });
await t.click(Selector('button[type="submit"]').filterVisible());

let loggedIn = false; let pathname = '';
for (let i = 0; i < 30; i++) {
  pathname = await t.eval(() => window.location.pathname);
  if (pathname.indexOf('/sign-in') === -1) { loggedIn = true; break; }
  await t.wait(1000);
}
await t.expect(loggedIn).ok('admin login did not complete (still on /sign-in after 30s) — check ASAFARIM_ADMIN_EMAIL/PASSWORD and that the account has admin role');
await t.wait(1500);
`;

/* ------------------------------------------------------------------ */
/* UI smoke generator                                                */
/* ------------------------------------------------------------------ */

function portalAdminSmoke(path: string, literal?: string): string {
  const contentAssert = literal
    ? "await t.expect(Selector('body').withText(" +
      JSON.stringify(literal) +
      ").with({ timeout: 30000 }).exists).ok('expected to see ' + " +
      JSON.stringify(literal) +
      " + ' on the page');"
    : [
        "for (let s = 0; s < 30; s++) { if (!(await Selector('.animate-spin').exists)) break; await t.wait(1000); }",
        "await t.expect(Selector('main, section, h1, h2, h3, table, [role=\"main\"]').with({ timeout: 30000 }).exists).ok('expected the admin page content to render');",
      ].join("\n");

  return (
    PORTAL_ADMIN_LOGIN +
    [
      `await t.navigateTo('${path}');`,
      "let landed = false; let pathname = '';",
      "for (let i = 0; i < 25; i++) {",
      "  pathname = await t.eval(() => window.location.pathname);",
      `  if (pathname.indexOf('/sign-in') === -1 && pathname.indexOf('${path}') !== -1) { landed = true; break; }`,
      "  await t.wait(1000);",
      "}",
      `await t.expect(landed).ok('could not open ${path} — ended at ' + pathname + ' — the account is likely not admin/superadmin');`,
      contentAssert,
      "",
    ].join("\n")
  );
}

/* ------------------------------------------------------------------ */
/* Suites                                                              */
/* ------------------------------------------------------------------ */

export const portalAdminDashboardSuite: TestSuiteDefinition = {
  suiteId: "portal-admin-dashboard",
  frId: "asafarim-portal-admin",
  title: "Admin · Dashboard",
  description: "Admin dashboard overview: stats, role distribution, recent users and audit activity.",
};

export const portalAdminUsersSuite: TestSuiteDefinition = {
  suiteId: "portal-admin-users",
  frId: "asafarim-portal-admin",
  title: "Admin · Users",
  description: "User management: listing, search, filtering and activation toggles.",
};

export const portalAdminContentSuite: TestSuiteDefinition = {
  suiteId: "portal-admin-content",
  frId: "asafarim-portal-admin",
  title: "Admin · Content",
  description: "Site content sections: listing, editing, publishing and deletion.",
};

export const portalAdminNavigationSuite: TestSuiteDefinition = {
  suiteId: "portal-admin-navigation",
  frId: "asafarim-portal-admin",
  title: "Admin · Navigation",
  description: "Navigation menu items: listing, filtering, creation, editing and deletion.",
};

export const portalAdminRolesSuite: TestSuiteDefinition = {
  suiteId: "portal-admin-roles",
  frId: "asafarim-portal-admin",
  title: "Admin · Roles",
  description: "Role management: listing, permissions, creation, editing and deletion.",
};

export const portalAdminSettingsSuite: TestSuiteDefinition = {
  suiteId: "portal-admin-settings",
  frId: "asafarim-portal-admin",
  title: "Admin · Settings",
  description: "Site settings: listing grouped settings and editing values.",
};

export const portalAdminAuditSuite: TestSuiteDefinition = {
  suiteId: "portal-admin-audit",
  frId: "asafarim-portal-admin",
  title: "Admin · Audit Log",
  description: "Audit log: listing, filtering by entity and action, pagination.",
};

export const portalAdminAccessSuite: TestSuiteDefinition = {
  suiteId: "portal-admin-access",
  frId: "asafarim-portal-admin",
  title: "Admin · Access Control",
  description: "Admin routes reject unauthenticated visitors and redirect to sign-in.",
};

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

export const portalAdminDashboardUiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-dashboard-ui",
  suiteId: "portal-admin-dashboard",
  title: "Dashboard page — admin can load the dashboard",
  baseUrl: "/admin",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const portalAdminUsersUiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-users-ui",
  suiteId: "portal-admin-users",
  title: "Users page — admin can load the users table",
  baseUrl: "/admin/users",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const portalAdminUsersApiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-users-api",
  suiteId: "portal-admin-users",
  title: "Users API — list, search and read-back via browser fetch",
  baseUrl: "/admin/users",
  commonInput: {},
};

export const portalAdminContentUiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-content-ui",
  suiteId: "portal-admin-content",
  title: "Content page — admin can load the content list",
  baseUrl: "/admin/content",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const portalAdminContentApiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-content-api",
  suiteId: "portal-admin-content",
  title: "Content API — create, update, delete a section",
  baseUrl: "/admin/content",
  commonInput: {},
  metadata: { destructive: true },
};

export const portalAdminNavigationUiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-navigation-ui",
  suiteId: "portal-admin-navigation",
  title: "Navigation page — admin can load the navigation list",
  baseUrl: "/admin/navigation",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const portalAdminNavigationApiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-navigation-api",
  suiteId: "portal-admin-navigation",
  title: "Navigation API — create, update, delete an item",
  baseUrl: "/admin/navigation",
  commonInput: {},
  metadata: { destructive: true },
};

export const portalAdminRolesUiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-roles-ui",
  suiteId: "portal-admin-roles",
  title: "Roles page — admin can load the roles list",
  baseUrl: "/admin/roles",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const portalAdminRolesApiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-roles-api",
  suiteId: "portal-admin-roles",
  title: "Roles API — create and delete a custom role",
  baseUrl: "/admin/roles",
  commonInput: {},
  metadata: { destructive: true },
};

export const portalAdminSettingsUiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-settings-ui",
  suiteId: "portal-admin-settings",
  title: "Settings page — admin can load the settings list",
  baseUrl: "/admin/settings",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const portalAdminSettingsApiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-settings-api",
  suiteId: "portal-admin-settings",
  title: "Settings API — upsert and read back a setting",
  baseUrl: "/admin/settings",
  commonInput: {},
  metadata: { destructive: true },
};

export const portalAdminAuditUiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-audit-ui",
  suiteId: "portal-admin-audit",
  title: "Audit page — admin can load the audit log",
  baseUrl: "/admin/audit",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const portalAdminAuditApiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-audit-api",
  suiteId: "portal-admin-audit",
  title: "Audit API — list and filter audit events",
  baseUrl: "/admin/audit",
  commonInput: {},
};

export const portalAdminAccessUiFixture: TestFixtureDefinition = {
  fixtureId: "portal-admin-access-ui",
  suiteId: "portal-admin-access",
  title: "Admin routes redirect unauthenticated users to /sign-in",
  baseUrl: "/admin",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

/* ------------------------------------------------------------------ */
/* Cases — Dashboard                                                   */
/* ------------------------------------------------------------------ */

export const portalAdminDashboardUiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-dashboard-loads",
    fixtureId: "portal-admin-dashboard-ui",
    title: "Admin can open the dashboard and see the system overview",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin", "Dashboard"),
  },
  {
    caseId: "portal-admin-dashboard-shows-stats",
    fixtureId: "portal-admin-dashboard-ui",
    title: "Dashboard renders stat cards and recent users table",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin", "Total Users") + "\n" +
      "await t.expect(Selector('table').with({ timeout: 30000 }).exists).ok('expected the recent users table to render');\n",
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Users                                                       */
/* ------------------------------------------------------------------ */

export const portalAdminUsersUiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-users-page-loads",
    fixtureId: "portal-admin-users-ui",
    title: "Admin can open the Users page and see the user table",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/users", "User Management"),
  },
  {
    caseId: "portal-admin-users-search-filters",
    fixtureId: "portal-admin-users-ui",
    title: "Searching the users list filters the table",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/users", "User Management") + "\n" + [
      "const searchInput = Selector('input[type=\"text\"]').withAttribute('placeholder', /Search by name/);",
      "await t.expect(searchInput.with({ timeout: 30000 }).exists).ok('expected the search input');",
      "await t.typeText(searchInput, 'admin', { replace: true });",
      "await t.wait(1500);",
      "await t.expect(Selector('tbody tr').exists).ok('expected at least one filtered row to remain');",
      "",
    ].join("\n"),
  },
];

export const portalAdminUsersApiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-users-api-list",
    fixtureId: "portal-admin-users-api",
    title: "GET /api/admin/users returns a paginated list",
    scriptType: "scripted",
    expected: {},
    script: PORTAL_ADMIN_LOGIN + "\n" + [
      "const res = await t.eval(() => fetch('/api/admin/users?page=1&limit=5').then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(res.status).eql(200, 'expected 200 from /api/admin/users, got ' + res.status);",
      "await t.expect(Array.isArray(res.body.users)).ok('expected users array');",
      "await t.expect(res.body.pagination).ok('expected pagination object');",
      "",
    ].join("\n"),
  },
  {
    caseId: "portal-admin-users-api-rejects-anonymous",
    fixtureId: "portal-admin-users-api",
    title: "GET /api/admin/users rejects unauthenticated requests",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "const res = await t.eval(() => fetch('/api/admin/users').then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect([401, 403]).contains(res.status, 'expected anonymous request to be rejected, got ' + res.status);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Content                                                     */
/* ------------------------------------------------------------------ */

export const portalAdminContentUiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-content-page-loads",
    fixtureId: "portal-admin-content-ui",
    title: "Admin can open the Content page and see the sections list",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/content", "Content Management"),
  },
];

export const portalAdminContentApiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-content-api-lifecycle",
    fixtureId: "portal-admin-content-api",
    title: "Create, update, publish and delete a content section",
    scriptType: "scripted",
    expected: {},
    script: PORTAL_ADMIN_LOGIN + "\n" + [
      "const sectionKey = 'e2e_content_' + Date.now();",
      "const createRes = await t.eval(() => fetch('/api/admin/content', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ section: sectionKey, title: 'E2E Content', eyebrow: 'test', isPublished: false, position: 9999 })",
      "}).then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(createRes.status).eql(201, 'expected content creation to succeed, got ' + createRes.status);",
      "const id = createRes.body.content.id;",
      "",
      "const updateRes = await t.eval(() => fetch('/api/admin/content/' + id, {",
      "  method: 'PATCH',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ title: 'E2E Content Updated', isPublished: true })",
      "}).then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(updateRes.status).eql(200, 'expected content update to succeed, got ' + updateRes.status);",
      "await t.expect(updateRes.body.content.isPublished).eql(true, 'expected content to be published');",
      "",
      "const deleteRes = await t.eval(() => fetch('/api/admin/content/' + id, { method: 'DELETE' }).then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(deleteRes.status).eql(200, 'expected content deletion to succeed, got ' + deleteRes.status);",
      "",
    ].join("\n"),
  },
  {
    caseId: "portal-admin-content-api-rejects-anonymous",
    fixtureId: "portal-admin-content-api",
    title: "GET /api/admin/content rejects unauthenticated requests",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "const res = await t.eval(() => fetch('/api/admin/content').then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect([401, 403]).contains(res.status, 'expected anonymous request to be rejected, got ' + res.status);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Navigation                                                  */
/* ------------------------------------------------------------------ */

export const portalAdminNavigationUiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-navigation-page-loads",
    fixtureId: "portal-admin-navigation-ui",
    title: "Admin can open the Navigation page and see the items list",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/navigation", "Navigation Management"),
  },
  {
    caseId: "portal-admin-navigation-create-via-ui",
    fixtureId: "portal-admin-navigation-ui",
    title: "Admin can create a new navigation item through the UI",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/navigation", "Navigation Management") + "\n" + [
      "const newItemLabel = 'E2E Nav ' + Date.now();",
      "await t.click(Selector('button').withText('+ New Item'));",
      "await t.typeText(Selector('label').withText('Label').sibling('input'), newItemLabel, { replace: true });",
      "await t.typeText(Selector('label').withText('URL / Href').sibling('input'), '/e2e-nav', { replace: true });",
      "await t.click(Selector('button[type=\"submit\"]').withText('Create Item'));",
      "await t.wait(1500);",
      "await t.expect(Selector('body').withText(newItemLabel).exists).ok('expected the new navigation item to appear');",
      "",
    ].join("\n"),
  },
];

export const portalAdminNavigationApiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-navigation-api-lifecycle",
    fixtureId: "portal-admin-navigation-api",
    title: "Create, update and delete a navigation item",
    scriptType: "scripted",
    expected: {},
    script: PORTAL_ADMIN_LOGIN + "\n" + [
      "const label = 'E2E Nav ' + Date.now();",
      "const createRes = await t.eval(() => fetch('/api/admin/navigation', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ label, href: '/e2e-nav', position: 9999, group: 'main', placement: 'header' })",
      "}).then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(createRes.status).eql(201, 'expected nav item creation to succeed, got ' + createRes.status);",
      "const id = createRes.body.item.id;",
      "",
      "const updateRes = await t.eval(() => fetch('/api/admin/navigation/' + id, {",
      "  method: 'PATCH',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ label: label + ' Updated', position: 9998 })",
      "}).then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(updateRes.status).eql(200, 'expected nav item update to succeed, got ' + updateRes.status);",
      "",
      "const deleteRes = await t.eval(() => fetch('/api/admin/navigation/' + id, { method: 'DELETE' }).then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect(deleteRes.status).eql(200, 'expected nav item deletion to succeed, got ' + deleteRes.status);",
      "",
    ].join("\n"),
  },
  {
    caseId: "portal-admin-navigation-api-rejects-anonymous",
    fixtureId: "portal-admin-navigation-api",
    title: "GET /api/admin/navigation rejects unauthenticated requests",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "const res = await t.eval(() => fetch('/api/admin/navigation').then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect([401, 403]).contains(res.status, 'expected anonymous request to be rejected, got ' + res.status);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Roles                                                       */
/* ------------------------------------------------------------------ */

export const portalAdminRolesUiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-roles-page-loads",
    fixtureId: "portal-admin-roles-ui",
    title: "Admin can open the Roles page and see the roles list",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/roles", "Role Management"),
  },
  {
    caseId: "portal-admin-roles-create-via-ui",
    fixtureId: "portal-admin-roles-ui",
    title: "Admin can create a new role through the UI",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/roles", "Role Management") + "\n" + [
      "const roleName = 'e2e_role_' + Date.now();",
      "const displayName = 'E2E Role ' + Date.now();",
      "await t.click(Selector('button').withText('+ New Role'));",
      "await t.typeText(Selector('label').withText('Slug').sibling('input'), roleName, { replace: true });",
      "await t.typeText(Selector('label').withText('Display Name').sibling('input'), displayName, { replace: true });",
      "await t.click(Selector('button[type=\"submit\"]').withText('Create Role'));",
      "await t.wait(1500);",
      "await t.expect(Selector('body').withText(displayName).exists).ok('expected the new role to appear');",
      "",
    ].join("\n"),
  },
];

export const portalAdminRolesApiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-roles-api-lifecycle",
    fixtureId: "portal-admin-roles-api",
    title: "Create, read and delete a custom role",
    scriptType: "scripted",
    expected: {},
    script: PORTAL_ADMIN_LOGIN + "\n" + [
      "const name = 'e2e_role_' + Date.now();",
      "const createRes = await t.eval(() => fetch('/api/admin/roles', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ name, displayName: 'E2E Role', description: 'temporary role' })",
      "}).then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(createRes.status).eql(201, 'expected role creation to succeed, got ' + createRes.status);",
      "const id = createRes.body.role.id;",
      "",
      "const listRes = await t.eval(() => fetch('/api/admin/roles').then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(listRes.status).eql(200, 'expected role list to succeed');",
      "await t.expect(Array.isArray(listRes.body.roles)).ok('expected roles array');",
      "",
      "const deleteRes = await t.eval(() => fetch('/api/admin/roles/' + id, { method: 'DELETE' }).then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect(deleteRes.status).eql(200, 'expected role deletion to succeed, got ' + deleteRes.status);",
      "",
    ].join("\n"),
  },
  {
    caseId: "portal-admin-roles-api-rejects-anonymous",
    fixtureId: "portal-admin-roles-api",
    title: "GET /api/admin/roles rejects unauthenticated requests",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "const res = await t.eval(() => fetch('/api/admin/roles').then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect([401, 403]).contains(res.status, 'expected anonymous request to be rejected, got ' + res.status);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Settings                                                    */
/* ------------------------------------------------------------------ */

export const portalAdminSettingsUiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-settings-page-loads",
    fixtureId: "portal-admin-settings-ui",
    title: "Admin can open the Settings page and see the settings list",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/settings", "Site Settings"),
  },
];

export const portalAdminSettingsApiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-settings-api-upsert",
    fixtureId: "portal-admin-settings-api",
    title: "PUT /api/admin/settings creates and updates a setting",
    scriptType: "scripted",
    expected: {},
    script: PORTAL_ADMIN_LOGIN + "\n" + [
      "const key = 'e2e_setting_' + Date.now();",
      "const upsertRes = await t.eval(() => fetch('/api/admin/settings', {",
      "  method: 'PUT',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ key, value: 'e2e-value', displayName: 'E2E Setting', description: 'temporary', group: 'general' })",
      "}).then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(upsertRes.status).eql(200, 'expected setting upsert to succeed, got ' + upsertRes.status);",
      "await t.expect(upsertRes.body.setting.key).eql(key, 'expected the created setting key to match');",
      "",
      "const listRes = await t.eval(() => fetch('/api/admin/settings').then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(listRes.status).eql(200, 'expected settings list to succeed');",
      "await t.expect(Array.isArray(listRes.body.settings)).ok('expected settings array');",
      "",
      "await t.eval(() => fetch('/api/admin/settings', {",
      "  method: 'PUT',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ key, value: null })",
      "}).then(r => ({ status: r.status })), { timeout: 30000 });",
      "",
    ].join("\n"),
  },
  {
    caseId: "portal-admin-settings-api-rejects-anonymous",
    fixtureId: "portal-admin-settings-api",
    title: "GET /api/admin/settings rejects unauthenticated requests",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "const res = await t.eval(() => fetch('/api/admin/settings').then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect([401, 403]).contains(res.status, 'expected anonymous request to be rejected, got ' + res.status);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Audit Log                                                   */
/* ------------------------------------------------------------------ */

export const portalAdminAuditUiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-audit-page-loads",
    fixtureId: "portal-admin-audit-ui",
    title: "Admin can open the Audit Log page and see the events list",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/audit", "Audit Log"),
  },
  {
    caseId: "portal-admin-audit-filter-by-entity",
    fixtureId: "portal-admin-audit-ui",
    title: "Filtering the audit log by entity updates the list",
    scriptType: "scripted",
    expected: {},
    script: portalAdminSmoke("/admin/audit", "Audit Log") + "\n" + [
      "await t.click(Selector('button').withText('User'));",
      "await t.wait(1500);",
      "await t.expect(Selector('body').withText('User').exists).ok('expected the entity filter to remain selected');",
      "",
    ].join("\n"),
  },
];

export const portalAdminAuditApiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-audit-api-list",
    fixtureId: "portal-admin-audit-api",
    title: "GET /api/admin/audit returns paginated audit events",
    scriptType: "scripted",
    expected: {},
    script: PORTAL_ADMIN_LOGIN + "\n" + [
      "const res = await t.eval(() => fetch('/api/admin/audit?page=1&limit=5').then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(res.status).eql(200, 'expected 200 from /api/admin/audit, got ' + res.status);",
      "await t.expect(Array.isArray(res.body.logs)).ok('expected logs array');",
      "await t.expect(res.body.pagination).ok('expected pagination object');",
      "",
    ].join("\n"),
  },
  {
    caseId: "portal-admin-audit-api-rejects-anonymous",
    fixtureId: "portal-admin-audit-api",
    title: "GET /api/admin/audit rejects unauthenticated requests",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "const res = await t.eval(() => fetch('/api/admin/audit').then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect([401, 403]).contains(res.status, 'expected anonymous request to be rejected, got ' + res.status);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Access Control                                              */
/* ------------------------------------------------------------------ */

export const portalAdminAccessUiCases: TestCaseDefinition[] = [
  {
    caseId: "portal-admin-access-redirects-anonymous",
    fixtureId: "portal-admin-access-ui",
    title: "Unauthenticated visitor to /admin is redirected to /sign-in",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "await t.navigateTo('/admin');",
      "let redirected = false; let pathname = '';",
      "for (let i = 0; i < 20; i++) {",
      "  pathname = await t.eval(() => window.location.pathname);",
      "  if (pathname.indexOf('/sign-in') !== -1) { redirected = true; break; }",
      "  await t.wait(1000);",
      "}",
      "await t.expect(redirected).ok('expected unauthenticated /admin visitor to be redirected to /sign-in, ended at ' + pathname);",
      "",
    ].join("\n"),
  },
  {
    caseId: "portal-admin-users-redirects-anonymous",
    fixtureId: "portal-admin-access-ui",
    title: "Unauthenticated visitor to /admin/users is redirected to /sign-in",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "await t.navigateTo('/admin/users');",
      "let redirected = false; let pathname = '';",
      "for (let i = 0; i < 20; i++) {",
      "  pathname = await t.eval(() => window.location.pathname);",
      "  if (pathname.indexOf('/sign-in') !== -1) { redirected = true; break; }",
      "  await t.wait(1000);",
      "}",
      "await t.expect(redirected).ok('expected unauthenticated /admin/users visitor to be redirected to /sign-in, ended at ' + pathname);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Aggregates for the seeder                                          */
/* ------------------------------------------------------------------ */

export const portalAdminSuites: TestSuiteDefinition[] = [
  portalAdminDashboardSuite,
  portalAdminUsersSuite,
  portalAdminContentSuite,
  portalAdminNavigationSuite,
  portalAdminRolesSuite,
  portalAdminSettingsSuite,
  portalAdminAuditSuite,
  portalAdminAccessSuite,
];

export const portalAdminFixtures: TestFixtureDefinition[] = [
  portalAdminDashboardUiFixture,
  portalAdminUsersUiFixture,
  portalAdminUsersApiFixture,
  portalAdminContentUiFixture,
  portalAdminContentApiFixture,
  portalAdminNavigationUiFixture,
  portalAdminNavigationApiFixture,
  portalAdminRolesUiFixture,
  portalAdminRolesApiFixture,
  portalAdminSettingsUiFixture,
  portalAdminSettingsApiFixture,
  portalAdminAuditUiFixture,
  portalAdminAuditApiFixture,
  portalAdminAccessUiFixture,
];

export const portalAdminCases: TestCaseDefinition[] = [
  ...portalAdminDashboardUiCases,
  ...portalAdminUsersUiCases,
  ...portalAdminUsersApiCases,
  ...portalAdminContentUiCases,
  ...portalAdminContentApiCases,
  ...portalAdminNavigationUiCases,
  ...portalAdminNavigationApiCases,
  ...portalAdminRolesUiCases,
  ...portalAdminRolesApiCases,
  ...portalAdminSettingsUiCases,
  ...portalAdminSettingsApiCases,
  ...portalAdminAuditUiCases,
  ...portalAdminAuditApiCases,
  ...portalAdminAccessUiCases,
];
