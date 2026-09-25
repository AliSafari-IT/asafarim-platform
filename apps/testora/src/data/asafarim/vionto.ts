import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * ASafariM Vionto — AI photo-to-story video creator.
 *
 * Vionto lives on its own subdomain (https://vionto.asafarim.com) and signs in
 * through Hub (https://hub.asafarim.com), the platform's central sign-in
 * gateway. The browser flow signs in on Hub's /sign-in page with a callbackUrl
 * pointing back to Vionto, establishing the shared cross-domain session cookie
 * before any Vionto-protected pages are hit. (Until #615 it used the retired
 * portal.asafarim.com, which no longer answers.)
 *
 * Tests use ASAFARIM_ADMIN_EMAIL / ASAFARIM_ADMIN_PASSWORD from the
 * environment. The Hub URL is read from ASAFARIM_HUB_URL (or its NEXT_PUBLIC
 * variant) and the Vionto origin from ASAFARIM_VIONTO_URL (or its NEXT_PUBLIC
 * variant).
 */

export const viontoFR: FunctionalRequirementDefinition = {
  id: "asafarim-vionto",
  projectId: "asafarim-vionto",
  title: "Vionto · Smoke & Auth",
  description:
    "Vionto landing page, Hub SSO sign-in, protected page smoke tests, and API health/projects endpoints.",
  baseUrl: process.env.NEXT_PUBLIC_ASAFARIM_VIONTO_URL || process.env.ASAFARIM_VIONTO_URL || "https://vionto.asafarim.com",
};

/* ------------------------------------------------------------------ */
/* Shared SSO login — sign in on Hub, return to Vionto                */
/* ------------------------------------------------------------------ */

const VIONTO_SSO_LOGIN = `
const hubUrl = process.env.ASAFARIM_HUB_URL || process.env.NEXT_PUBLIC_ASAFARIM_HUB_URL || 'https://hub.asafarim.com';
const viontoUrl = process.env.ASAFARIM_VIONTO_URL || process.env.NEXT_PUBLIC_ASAFARIM_VIONTO_URL || 'https://vionto.asafarim.com';
const email = process.env.ASAFARIM_ADMIN_EMAIL || '';
const password = process.env.ASAFARIM_ADMIN_PASSWORD || '';
await t.expect(email.length).gt(0, 'ASAFARIM_ADMIN_EMAIL must be set in the repo-root .env.local (Testora loads it at startup).');
await t.expect(password.length).gt(0, 'ASAFARIM_ADMIN_PASSWORD must be set in the repo-root .env.local (Testora loads it at startup).');

await t.deleteCookies();
const callback = viontoUrl + '/create';
await t.navigateTo(hubUrl + '/sign-in?callbackUrl=' + encodeURIComponent(callback));

await t.expect(Selector('#identifier').with({ timeout: 30000 }).exists).ok('Hub /sign-in form should render');
await t.typeText('#identifier', email, { replace: true });
await t.typeText('#password', password, { replace: true });
await t.click(Selector('button[type="submit"]').filterVisible());

let loggedIn = false; let pathname = '';
for (let i = 0; i < 30; i++) {
  pathname = await t.eval(() => window.location.pathname);
  const host = await t.eval(() => window.location.host);
  if (host.indexOf('vionto') !== -1 && pathname.indexOf('/sign-in') === -1) { loggedIn = true; break; }
  await t.wait(1000);
}
await t.expect(loggedIn).ok('SSO login did not return to Vionto after Hub sign-in — ended at ' + pathname);
await t.wait(1500);
`;

/* ------------------------------------------------------------------ */
/* UI smoke generator                                                */
/* ------------------------------------------------------------------ */

function viontoSmoke(path: string, literal?: string): string {
  const contentAssert = literal
    ? "await t.expect(Selector('body').withText(" +
      JSON.stringify(literal) +
      ").with({ timeout: 30000 }).exists).ok('expected to see ' + " +
      JSON.stringify(literal) +
      " + ' on the page');"
    : [
        "for (let s = 0; s < 30; s++) { if (!(await Selector('.animate-spin').exists)) break; await t.wait(1000); }",
        "await t.expect(Selector('main, section, h1, h2, h3, [role=\"main\"]').with({ timeout: 30000 }).exists).ok('expected the Vionto page content to render');",
      ].join("\n");

  return (
    VIONTO_SSO_LOGIN +
    [
      `await t.navigateTo('${path}');`,
      "let landed = false; let pathname = '';",
      "for (let i = 0; i < 25; i++) {",
      "  pathname = await t.eval(() => window.location.pathname);",
      `  if (pathname.indexOf('/sign-in') === -1 && pathname.indexOf('${path}') !== -1) { landed = true; break; }`,
      "  await t.wait(1000);",
      "}",
      `await t.expect(landed).ok('could not open ${path} — ended at ' + pathname);`,
      contentAssert,
      "",
    ].join("\n")
  );
}

/* ------------------------------------------------------------------ */
/* Suites                                                              */
/* ------------------------------------------------------------------ */

export const viontoLandingSuite: TestSuiteDefinition = {
  suiteId: "vionto-landing",
  frId: "asafarim-vionto",
  title: "Vionto · Landing",
  description: "Public landing page renders and exposes the sign-in flow.",
};

export const viontoAuthSuite: TestSuiteDefinition = {
  suiteId: "vionto-auth",
  frId: "asafarim-vionto",
  title: "Vionto · SSO Auth",
  description: "Portal SSO sign-in returns an authenticated user to Vionto.",
};

export const viontoProjectsSuite: TestSuiteDefinition = {
  suiteId: "vionto-projects",
  frId: "asafarim-vionto",
  title: "Vionto · Projects",
  description: "Authenticated project listing and protected projects page.",
};

export const viontoHealthSuite: TestSuiteDefinition = {
  suiteId: "vionto-health",
  frId: "asafarim-vionto",
  title: "Vionto · Health API",
  description: "Public health endpoint reports service status.",
};

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

export const viontoLandingUiFixture: TestFixtureDefinition = {
  fixtureId: "vionto-landing-ui",
  suiteId: "vionto-landing",
  title: "Vionto landing page smoke",
  baseUrl: "/",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const viontoAuthUiFixture: TestFixtureDefinition = {
  fixtureId: "vionto-auth-ui",
  suiteId: "vionto-auth",
  title: "Portal SSO sign-in for Vionto",
  baseUrl: "/",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const viontoProjectsUiFixture: TestFixtureDefinition = {
  fixtureId: "vionto-projects-ui",
  suiteId: "vionto-projects",
  title: "Vionto projects page smoke",
  baseUrl: "/projects",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const viontoProjectsApiFixture: TestFixtureDefinition = {
  fixtureId: "vionto-projects-api",
  suiteId: "vionto-projects",
  title: "Vionto projects API",
  baseUrl: "/projects",
  commonInput: {},
};

export const viontoHealthApiFixture: TestFixtureDefinition = {
  fixtureId: "vionto-health-api",
  suiteId: "vionto-health",
  title: "Vionto health endpoint",
  // See timelineaiHealthApiFixture for why this isn't "/api/health": TestCafe
  // navigates here before the test runs, and a raw application/json response
  // never completes its client-injection handshake, hanging the run forever.
  baseUrl: "/",
  commonInput: {},
};

/* ------------------------------------------------------------------ */
/* Cases — Landing                                                     */
/* ------------------------------------------------------------------ */

export const viontoLandingUiCases: TestCaseDefinition[] = [
  {
    caseId: "vionto-landing-loads",
    fixtureId: "vionto-landing-ui",
    title: "Vionto landing page renders",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "await t.navigateTo('/');",
      "await t.expect(Selector('body').withText('Vionto').with({ timeout: 30000 }).exists).ok('expected Vionto branding on the landing page');",
      "await t.expect(Selector('a, button').withText(/Sign in/i).filterVisible().exists).ok('expected a sign-in link on the landing page');",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Auth                                                        */
/* ------------------------------------------------------------------ */

export const viontoAuthUiCases: TestCaseDefinition[] = [
  {
    caseId: "vionto-sso-sign-in",
    fixtureId: "vionto-auth-ui",
    title: "Admin can sign in via Hub SSO and reach Vionto",
    scriptType: "scripted",
    expected: {},
    script: VIONTO_SSO_LOGIN + "\n" +
      "await t.expect(Selector('body').withText('Vionto').exists).ok('expected Vionto content after SSO redirect');\n",
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Projects                                                    */
/* ------------------------------------------------------------------ */

export const viontoProjectsUiCases: TestCaseDefinition[] = [
  {
    caseId: "vionto-projects-page-loads",
    fixtureId: "vionto-projects-ui",
    title: "Authenticated admin can open the Vionto projects page",
    scriptType: "scripted",
    expected: {},
    script: viontoSmoke("/projects", "Projects"),
  },
];

export const viontoProjectsApiCases: TestCaseDefinition[] = [
  {
    caseId: "vionto-projects-api-list",
    fixtureId: "vionto-projects-api",
    title: "GET /api/projects returns a paginated list for authenticated user",
    scriptType: "scripted",
    expected: {},
    script: VIONTO_SSO_LOGIN + "\n" + [
      "const res = await t.eval(() => fetch('/api/projects?page=1&pageSize=5').then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(res.status).eql(200, 'expected 200 from /api/projects, got ' + res.status);",
      "await t.expect(Array.isArray(res.body.data)).ok('expected projects array');",
      "await t.expect(res.body.pagination).ok('expected pagination object');",
      "",
    ].join("\n"),
  },
  {
    caseId: "vionto-projects-api-rejects-anonymous",
    fixtureId: "vionto-projects-api",
    title: "GET /api/projects rejects unauthenticated requests",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "const res = await t.eval(() => fetch('/api/projects').then(r => ({ status: r.status })), { timeout: 30000 });",
      "await t.expect([401, 403]).contains(res.status, 'expected anonymous request to be rejected, got ' + res.status);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Health                                                      */
/* ------------------------------------------------------------------ */

export const viontoHealthApiCases: TestCaseDefinition[] = [
  {
    caseId: "vionto-health-api-returns-ok",
    fixtureId: "vionto-health-api",
    title: "GET /api/health reports vionto service status",
    scriptType: "scripted",
    expected: {},
    script: [
      "const res = await t.eval(() => fetch('/api/health').then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(res.status).eql(200, 'expected 200 from /api/health, got ' + res.status);",
      "await t.expect(res.body.service).eql('vionto', 'expected service name to be vionto');",
      "await t.expect(res.body.checks).ok('expected checks object');",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Aggregates for the seeder                                          */
/* ------------------------------------------------------------------ */

export const viontoSuites: TestSuiteDefinition[] = [
  viontoLandingSuite,
  viontoAuthSuite,
  viontoProjectsSuite,
  viontoHealthSuite,
];

export const viontoFixtures: TestFixtureDefinition[] = [
  viontoLandingUiFixture,
  viontoAuthUiFixture,
  viontoProjectsUiFixture,
  viontoProjectsApiFixture,
  viontoHealthApiFixture,
];

export const viontoCases: TestCaseDefinition[] = [
  ...viontoLandingUiCases,
  ...viontoAuthUiCases,
  ...viontoProjectsUiCases,
  ...viontoProjectsApiCases,
  ...viontoHealthApiCases,
];
