import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * Login (email/password) coverage against the app under test's login page.
 *
 * These cases were originally generic fill/submit scenarios with placeholder
 * expectations (redirect to /dashboard, a [role="alert"] error element). The
 * real app behaves differently, so each case is now a scripted TestCafe body
 * that asserts observable behaviour:
 *
 *  - Success is detected by an authenticated session — a successful login runs
 *    api.setToken(), which writes 'auth_token' to localStorage. We assert that
 *    rather than the post-login redirect target, which the app races between
 *    /listings and /dashboard.
 *  - Rejection (wrong/empty/badly-formatted credentials) is detected by the
 *    ABSENCE of a session while staying on /login. This holds uniformly whether
 *    the server replies 401, the throttler replies 429, or the browser blocks
 *    submission via native required/type=email validation — so it does not
 *    depend on a specific (localised, toast-rendered) error string.
 *  - Rate-limiting is verified directly against the API: /auth/login is
 *    throttled to 10/60s, so a rapid burst of bad attempts yields HTTP 429.
 *
 * The login inputs hydrate after their SSR HTML renders, so each attempt
 * hydration-gates on the submit button enabling and re-types until the values
 * stick (see [[immo-ali-hydration-race]]). The shared password comes from
 * WEBAPP_ADMIN_PASSWORD; runs pass the sentinel '__VALID__' to request it.
 */

// One UI login attempt, parameterised by `run`:
//   run.email       — email to type ('' to leave blank)
//   run.password    — password to type ('' blank, '__VALID__' = real password)
//   run.expectAuth  — true → expect an authenticated session; false → rejected
//   run.scenario    — label for assertion messages
const LOGIN_ATTEMPT_SCRIPT = [
  "// Ensure a clean, unauthenticated login form. A prior case in this spec may",
  "// have left an 'auth_token' in storage; the login route then redirects away,",
  "// so clear it and return to /login.",
  "const emailInput = Selector('[data-testid=\"login-email\"]');",
  "if (!(await emailInput.with({ timeout: 5000 }).exists)) {",
  "  await t.eval(() => { try { localStorage.clear(); } catch (e) {} });",
  "  await t.navigateTo('/en/login');",
  "}",
  "await t.expect(emailInput.with({ timeout: 30000 }).exists).ok('login form did not render');",
  "const passwordInput = Selector('[data-testid=\"login-password\"]');",
  "const submitButton = Selector('[data-testid=\"login-submit\"]');",
  "// Hydration gate: submit is disabled until isHydrated === true.",
  "await t.expect(submitButton.hasAttribute('disabled')).notOk({ timeout: 60000 });",
  "const email = run.email;",
  "const password = run.password === '__VALID__' ? (process.env.WEBAPP_ADMIN_PASSWORD || '') : run.password;",
  "async function setField(sel, val) {",
  "  if (val === '') { if ((await sel.value) !== '') await t.selectText(sel).pressKey('delete'); return; }",
  "  await t.typeText(sel, val, { replace: true });",
  "}",
  "for (let i = 0; i < 4; i++) {",
  "  await setField(emailInput, email);",
  "  await setField(passwordInput, password);",
  "  if ((await emailInput.value) === email && (await passwordInput.value) === password) break;",
  "  await t.wait(1000);",
  "}",
  "await t.click(submitButton);",
  "if (run.expectAuth) {",
  "  let authed = false;",
  "  for (let i = 0; i < 30; i++) {",
  "    if (await t.eval(() => !!localStorage.getItem('auth_token'))) { authed = true; break; }",
  "    await t.wait(1000);",
  "  }",
  "  await t.expect(authed).ok('expected valid credentials to establish an authenticated session (' + run.scenario + ')');",
  "} else {",
  "  // Rejected: never authenticates and stays on /login. Give the request a",
  "  // moment to resolve, then assert no session was established.",
  "  await t.wait(4000);",
  "  const authed = await t.eval(() => !!localStorage.getItem('auth_token'));",
  "  const path = await t.eval(() => window.location.pathname);",
  "  await t.expect(authed).notOk('expected login to be rejected with no session: ' + run.scenario);",
  "  await t.expect(path).contains('/login', 'expected to remain on the login page: ' + run.scenario);",
  "}",
].join("\n");

const RATE_LIMIT_SCRIPT = [
  "const api = process.env.WEBAPP_API_URL || 'http://localhost:3234/api/v1';",
  "// /auth/login is throttled at 10/60s. Fire a rapid burst of bad-credential",
  "// attempts and assert the throttler eventually replies HTTP 429.",
  "let saw429 = false;",
  "let lastStatus = 0;",
  "for (let i = 0; i < 15; i++) {",
  "  const res = await t.request.post(api + '/auth/login', {",
  "    body: { email: (process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com'), password: 'definitely-wrong-' + i },",
  "  });",
  "  lastStatus = res.status;",
  "  if (res.status === 429) { saw429 = true; break; }",
  "}",
  "await t.expect(saw429).ok('expected login to be rate-limited (HTTP 429) after repeated rapid attempts; last status ' + lastStatus);",
].join("\n");

export const authenticationFR: FunctionalRequirementDefinition = {
  id: "auth",
  title: "Authentication",
  description: "Covers all login and signup flows, including validation and rate limiting.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

export const loginFlowSuite: TestSuiteDefinition = {
  suiteId: "login-flow",
  frId: "auth",
  title: "Login Flow",
  description: "Covers all login scenarios using email/password.",
};

export const loginWithEmailFixture: TestFixtureDefinition = {
  fixtureId: "login-with-email",
  suiteId: "login-flow",
  title: "Login using email/password",
  baseUrl: "/en/login",
  commonInput: {},
  metadata: { ui: true },
};

const ACCOUNT_EMAIL = (process.env.WEBAPP_ADMIN_EMAIL || "admin@example.com");

export const loginTestCases: TestCaseDefinition[] = [
  {
    caseId: "valid-login",
    fixtureId: "login-with-email",
    title: "Valid login succeeds",
    scriptType: "scripted",
    runs: [
      { email: ACCOUNT_EMAIL, password: "__VALID__", expectAuth: true, scenario: "valid credentials" },
    ],
    expected: {},
    script: LOGIN_ATTEMPT_SCRIPT,
  },
  {
    caseId: "invalid-password",
    fixtureId: "login-with-email",
    title: "Login fails with invalid password",
    scriptType: "scripted",
    runs: [
      { email: ACCOUNT_EMAIL, password: "wrong", expectAuth: false, scenario: "wrong password #1" },
      { email: ACCOUNT_EMAIL, password: "incorrect", expectAuth: false, scenario: "wrong password #2" },
    ],
    expected: {},
    script: LOGIN_ATTEMPT_SCRIPT,
  },
  {
    caseId: "invalid-email-format",
    fixtureId: "login-with-email",
    title: "Login fails with invalid email format",
    scriptType: "scripted",
    runs: [
      { email: "not-an-email", password: "__VALID__", expectAuth: false, scenario: "invalid email format" },
    ],
    expected: {},
    script: LOGIN_ATTEMPT_SCRIPT,
  },
  {
    caseId: "missing-fields",
    fixtureId: "login-with-email",
    title: "Login fails when fields are missing",
    scriptType: "scripted",
    runs: [
      { email: "", password: "__VALID__", expectAuth: false, scenario: "missing email" },
      { email: ACCOUNT_EMAIL, password: "", expectAuth: false, scenario: "missing password" },
    ],
    expected: {},
    script: LOGIN_ATTEMPT_SCRIPT,
  },
  {
    caseId: "brute-force-multi-run",
    fixtureId: "login-with-email",
    title: "Multi-run brute-force attempts are all rejected",
    scriptType: "scripted",
    runs: [
      { email: ACCOUNT_EMAIL, password: "guess1", expectAuth: false, scenario: "brute force #1" },
      { email: ACCOUNT_EMAIL, password: "guess2", expectAuth: false, scenario: "brute force #2" },
      { email: ACCOUNT_EMAIL, password: "guess3", expectAuth: false, scenario: "brute force #3" },
    ],
    expected: {},
    script: LOGIN_ATTEMPT_SCRIPT,
  },
  {
    // Last on purpose: tripping the throttler leaves /auth/login at 429 for up
    // to 60s, so it runs after the cases that need real login responses.
    caseId: "rate-limit",
    fixtureId: "login-with-email",
    title: "Login is rate-limited after repeated failures",
    scriptType: "scripted",
    expected: {},
    script: RATE_LIMIT_SCRIPT,
  },
];
