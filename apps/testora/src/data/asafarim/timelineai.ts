import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * ASafariM TimelineAI — AI-assisted timeline builder.
 *
 * TimelineAI lives on its own subdomain (https://tlai.asafarim.com) and signs
 * in through Hub (https://hub.asafarim.com), the platform's central sign-in
 * gateway, rather than through a per-app login form. The browser flow signs
 * in on Hub's /sign-in page with a callbackUrl pointing back to TimelineAI,
 * establishing the shared cross-domain session cookie before any
 * TimelineAI-protected pages are hit.
 *
 * Tests use ASAFARIM_ADMIN_EMAIL / ASAFARIM_ADMIN_PASSWORD from the
 * environment. The Hub URL is read from ASAFARIM_HUB_URL (or its
 * NEXT_PUBLIC variant) and the TimelineAI origin from
 * ASAFARIM_TIMELINEAI_URL (or its NEXT_PUBLIC variant).
 */

export const timelineaiFR: FunctionalRequirementDefinition = {
  id: "asafarim-timelineai",
  projectId: "asafarim-timelineai",
  title: "TimelineAI · Smoke & Auth",
  description:
    "TimelineAI landing page, Hub SSO sign-in, protected dashboard smoke tests, and the public health endpoint.",
  baseUrl:
    process.env.NEXT_PUBLIC_ASAFARIM_TIMELINEAI_URL ||
    process.env.ASAFARIM_TIMELINEAI_URL ||
    "https://tlai.asafarim.com",
};

/* ------------------------------------------------------------------ */
/* Shared SSO login — sign in on Hub, return to TimelineAI            */
/* ------------------------------------------------------------------ */

const TIMELINEAI_SSO_LOGIN = `
const hubUrl = process.env.ASAFARIM_HUB_URL || process.env.NEXT_PUBLIC_ASAFARIM_HUB_URL || 'https://hub.asafarim.com';
const timelineaiUrl = process.env.ASAFARIM_TIMELINEAI_URL || process.env.NEXT_PUBLIC_ASAFARIM_TIMELINEAI_URL || 'https://tlai.asafarim.com';
const email = process.env.ASAFARIM_ADMIN_EMAIL || '';
const password = process.env.ASAFARIM_ADMIN_PASSWORD || '';
await t.expect(email.length).gt(0, 'ASAFARIM_ADMIN_EMAIL must be set in F:\\\\repos\\\\e2e-testora\\\\.env file in project root directory.');
await t.expect(password.length).gt(0, 'ASAFARIM_ADMIN_PASSWORD must be set in F:\\\\repos\\\\e2e-testora\\\\.env file in project root directory.');

await t.deleteCookies();
const callback = timelineaiUrl + '/dashboard';
await t.navigateTo(hubUrl + '/sign-in?callbackUrl=' + encodeURIComponent(callback));

await t.expect(Selector('#email').with({ timeout: 30000 }).exists).ok('Hub /sign-in form should render');
await t.typeText('#email', email, { replace: true });
await t.typeText('#password', password, { replace: true });
await t.click(Selector('button[type="submit"]').filterVisible());

let loggedIn = false; let pathname = '';
for (let i = 0; i < 30; i++) {
  pathname = await t.eval(() => window.location.pathname);
  const host = await t.eval(() => window.location.host);
  if (host.indexOf('tlai') !== -1 && pathname.indexOf('/sign-in') === -1) { loggedIn = true; break; }
  await t.wait(1000);
}
await t.expect(loggedIn).ok('SSO login did not return to TimelineAI after Hub sign-in — ended at ' + pathname);
await t.wait(1500);
`;

/* ------------------------------------------------------------------ */
/* UI smoke generator                                                */
/* ------------------------------------------------------------------ */

function timelineaiSmoke(path: string, literal?: string): string {
  const contentAssert = literal
    ? "await t.expect(Selector('body').withText(" +
      JSON.stringify(literal) +
      ").with({ timeout: 30000 }).exists).ok('expected to see ' + " +
      JSON.stringify(literal) +
      " + ' on the page');"
    : [
        "for (let s = 0; s < 30; s++) { if (!(await Selector('.animate-spin').exists)) break; await t.wait(1000); }",
        "await t.expect(Selector('main, section, h1, h2, h3, [role=\"main\"]').with({ timeout: 30000 }).exists).ok('expected the TimelineAI page content to render');",
      ].join("\n");

  return (
    TIMELINEAI_SSO_LOGIN +
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

export const timelineaiLandingSuite: TestSuiteDefinition = {
  suiteId: "timelineai-landing",
  frId: "asafarim-timelineai",
  title: "TimelineAI · Landing",
  description: "Public landing page renders and exposes the sign-in flow.",
};

export const timelineaiAuthSuite: TestSuiteDefinition = {
  suiteId: "timelineai-auth",
  frId: "asafarim-timelineai",
  title: "TimelineAI · SSO Auth",
  description: "Hub SSO sign-in returns an authenticated user to TimelineAI.",
};

export const timelineaiDashboardSuite: TestSuiteDefinition = {
  suiteId: "timelineai-dashboard",
  frId: "asafarim-timelineai",
  title: "TimelineAI · Dashboard",
  description: "Authenticated dashboard smoke test.",
};

export const timelineaiHealthSuite: TestSuiteDefinition = {
  suiteId: "timelineai-health",
  frId: "asafarim-timelineai",
  title: "TimelineAI · Health API",
  description: "Public health endpoint reports service status.",
};

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

export const timelineaiLandingUiFixture: TestFixtureDefinition = {
  fixtureId: "timelineai-landing-ui",
  suiteId: "timelineai-landing",
  title: "TimelineAI landing page smoke",
  baseUrl: "/",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const timelineaiAuthUiFixture: TestFixtureDefinition = {
  fixtureId: "timelineai-auth-ui",
  suiteId: "timelineai-auth",
  title: "Hub SSO sign-in for TimelineAI",
  baseUrl: "/",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const timelineaiDashboardUiFixture: TestFixtureDefinition = {
  fixtureId: "timelineai-dashboard-ui",
  suiteId: "timelineai-dashboard",
  title: "TimelineAI dashboard page smoke",
  baseUrl: "/dashboard",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

export const timelineaiHealthApiFixture: TestFixtureDefinition = {
  fixtureId: "timelineai-health-api",
  suiteId: "timelineai-health",
  title: "TimelineAI health endpoint",
  baseUrl: "/api/health",
  commonInput: {},
};

/* ------------------------------------------------------------------ */
/* Cases — Landing                                                     */
/* ------------------------------------------------------------------ */

export const timelineaiLandingUiCases: TestCaseDefinition[] = [
  {
    caseId: "timelineai-landing-loads",
    fixtureId: "timelineai-landing-ui",
    title: "TimelineAI landing page renders",
    scriptType: "scripted",
    expected: {},
    script: [
      "await t.deleteCookies();",
      "await t.navigateTo('/');",
      "await t.expect(Selector('body').withText(/TimelineAI/i).with({ timeout: 30000 }).exists).ok('expected TimelineAI branding on the landing page');",
      "await t.expect(Selector('a, button').withText(/Sign in/i).filterVisible().exists).ok('expected a sign-in link on the landing page');",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Auth                                                        */
/* ------------------------------------------------------------------ */

export const timelineaiAuthUiCases: TestCaseDefinition[] = [
  {
    caseId: "timelineai-sso-sign-in",
    fixtureId: "timelineai-auth-ui",
    title: "Admin can sign in via Hub SSO and reach TimelineAI",
    scriptType: "scripted",
    expected: {},
    script: TIMELINEAI_SSO_LOGIN + "\n" +
      "await t.expect(Selector('body').withText(/TimelineAI|Dashboard/i).exists).ok('expected TimelineAI content after SSO redirect');\n",
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Dashboard                                                   */
/* ------------------------------------------------------------------ */

export const timelineaiDashboardUiCases: TestCaseDefinition[] = [
  {
    caseId: "timelineai-dashboard-page-loads",
    fixtureId: "timelineai-dashboard-ui",
    title: "Authenticated admin can open the TimelineAI dashboard",
    scriptType: "scripted",
    expected: {},
    script: timelineaiSmoke("/dashboard"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Health                                                      */
/* ------------------------------------------------------------------ */

export const timelineaiHealthApiCases: TestCaseDefinition[] = [
  {
    caseId: "timelineai-health-api-returns-ok",
    fixtureId: "timelineai-health-api",
    title: "GET /api/health reports timelineai service status",
    scriptType: "scripted",
    expected: {},
    script: [
      "const res = await t.eval(() => fetch('/api/health').then(r => r.json().then(body => ({ status: r.status, body }))), { timeout: 30000 });",
      "await t.expect(res.status).eql(200, 'expected 200 from /api/health, got ' + res.status);",
      "await t.expect(res.body.service).eql('timelineai', 'expected service name to be timelineai');",
      "await t.expect(res.body.ok).eql(true, 'expected ok: true');",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Aggregates for the seeder                                          */
/* ------------------------------------------------------------------ */

export const timelineaiSuites: TestSuiteDefinition[] = [
  timelineaiLandingSuite,
  timelineaiAuthSuite,
  timelineaiDashboardSuite,
  timelineaiHealthSuite,
];

export const timelineaiFixtures: TestFixtureDefinition[] = [
  timelineaiLandingUiFixture,
  timelineaiAuthUiFixture,
  timelineaiDashboardUiFixture,
  timelineaiHealthApiFixture,
];

export const timelineaiCases: TestCaseDefinition[] = [
  ...timelineaiLandingUiCases,
  ...timelineaiAuthUiCases,
  ...timelineaiDashboardUiCases,
  ...timelineaiHealthApiCases,
];
