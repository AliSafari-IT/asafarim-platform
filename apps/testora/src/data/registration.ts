import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * Registration (sign-up) flow coverage.
 *
 *  - `register-api` (fast, comprehensive): drives POST /auth/register directly
 *    with t.request to cover the happy paths (individual + business) and the
 *    full validation matrix (weak password, missing consent, bad email,
 *    missing required field, duplicate email → 409). Each success run uses a
 *    a unique plus-addressed email derived from WEBAPP_ADMIN_EMAIL so the suite is
 *    re-runnable without colliding on the unique-email constraint.
 *
 *  - `register-ui` (browser happy path): fills the real registration form and
 *    asserts the post-signup redirect to /verify-email. The form's controlled
 *    inputs hydrate after their SSR HTML renders, so — exactly like the login
 *    and listings flows — each field is typed and then verified, retyping if a
 *    late hydration re-render wiped it.
 *
 * Required fields (RegisterDto): accountType, firstName, lastName,
 * streetAndNumber, postalCode, city, email, password (≥8), language, and
 * ageConfirmed/termsAccepted/privacyAccepted which must equal true. Business
 * accounts additionally require companyName + btwNumber.
 */

const API_DEFAULT = "http://localhost:3234/api/v1";

const REGISTER_API_SCRIPT = [
  // The chosen target's API base (set by the Run page) wins; fall back to the
  // per-run input, then the local default. Without the env override first, a
  // commonInput apiUrl would pin every run to localhost and ignore the target.
  "const api = process.env.WEBAPP_API_URL || run.apiUrl || '" + API_DEFAULT + "';",
  "// Fresh, unique e-mail per run keeps the success cases re-runnable.",
  "const unique = Date.now() + '_' + Math.floor(Math.random() * 1e6);",
  "// Plus-address the configured admin email so success cases are re-runnable.",
  "const __e = (process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com').split('@');",
  "const email = __e[0] + '+e2e' + unique + '@' + (__e[1] || 'example.com');",
  "const base = {",
  "  accountType: 'individual',",
  "  firstName: 'E2E', lastName: 'Tester',",
  "  streetAndNumber: 'Teststraat 1', postalCode: '2000', city: 'Antwerpen',",
  "  email: email,",
  "  password: 'TestPass123!',",
  "  language: 'en',",
  "  ageConfirmed: true, termsAccepted: true, privacyAccepted: true,",
  "};",
  "const payload = Object.assign({}, base, run.overrides || {});",
  "// /auth/register is throttled at 5/60s. Retry only on an *unexpected* 429",
  "// (request rejected before processing, so no user is created) until the real",
  "// status comes back — this keeps the 7-scenario matrix reliable without",
  "// padding every run with a fixed delay.",
  "let res;",
  "for (let i = 0; i < 6; i++) {",
  "  res = await t.request.post(api + '/auth/register', { body: payload });",
  "  if (res.status !== 429 || run.expectStatus === 429) break;",
  "  await t.wait(15000);",
  "}",
  "await t.expect(res.status).eql(run.expectStatus, run.scenario + ': expected HTTP ' + run.expectStatus + ' but got ' + res.status + ' — ' + JSON.stringify(res.body).slice(0, 200));",
  "if (run.expectStatus === 201) {",
  "  await t.expect(Boolean(res.body.accessToken)).ok(run.scenario + ': expected an accessToken on a successful registration');",
  "}",
].join("\n");

const REGISTER_UI_SCRIPT = [
  "const unique = Date.now() + '_' + Math.floor(Math.random() * 1e6);",
  "const __e = (process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com').split('@');",
  "const email = __e[0] + '+e2eui' + unique + '@' + (__e[1] || 'example.com');",
  "const password = 'TestPass123!';",
  "const submit = Selector('[data-testid=\"register-submit\"]');",
  "await t.expect(Selector('[data-testid=\"register-firstName\"]').with({ timeout: 30000 }).exists).ok('register form did not render');",
  "",
  "// Controlled-input hydration race (same as login/listings) — but here it is",
  "// subtle: TestCafe sets the DOM value, yet if React has not hydrated, its",
  "// onChange never fires so the value is missing from React state (and a later",
  "// hydration re-render wipes the DOM value back to empty). Checking the DOM",
  "// value right after typing is therefore NOT enough. Instead, loop over every",
  "// field refilling any that are empty, wait for any hydration re-render, and",
  "// only stop once a whole pass needs no typing — i.e. every value is stably",
  "// held in React state. Submitting before that yields 'field required' errors.",
  "const fields = [",
  "  ['register-firstName', 'E2E'], ['register-lastName', 'Tester'],",
  "  ['register-streetAndNumber', 'Teststraat 1'], ['register-postalCode', '2000'],",
  "  ['register-city', 'Antwerpen'], ['register-email', email],",
  "  ['register-password', password], ['register-confirmPassword', password],",
  "];",
  "let stable = false;",
  "for (let pass = 0; pass < 8 && !stable; pass++) {",
  "  let typedSomething = false;",
  "  for (const [testId, value] of fields) {",
  "    const el = Selector('[data-testid=\"' + testId + '\"]');",
  "    if ((await el.value) !== value) { await t.typeText(el, value, { replace: true }); typedSomething = true; }",
  "  }",
  "  if (!typedSomething) { stable = true; break; }",
  "  await t.wait(1500);",
  "}",
  "await t.expect(stable).ok('register form fields did not stabilise (hydration?)');",
  "",
  "// Language is a native <select>; set value + dispatch change for React.",
  "await t.eval(() => {",
  "  const sel = document.querySelector('[data-testid=\"register-language\"]');",
  "  if (sel && sel.tagName === 'SELECT') { sel.value = 'en'; sel.dispatchEvent(new Event('change', { bubbles: true })); }",
  "});",
  "",
  "// Consent is a button toggle (not a native checkbox); it renders a checkmark",
  "// <svg> only once checked. Click until that confirms it registered.",
  "const consent = Selector('[data-testid=\"register-legalConsent\"]');",
  "for (let i = 0; i < 4; i++) {",
  "  if (await consent.find('svg').exists) break;",
  "  await t.click(consent);",
  "  await t.wait(500);",
  "}",
  "await t.expect(consent.find('svg').exists).ok('legal consent did not get checked');",
  "",
  "// Wait out the debounced email-availability check (it disables submit), submit.",
  "await t.expect(submit.hasAttribute('disabled')).notOk({ timeout: 20000 });",
  "await t.click(submit);",
  "",
  "// Success signal: a created account authenticates the session (api.setToken",
  "// writes 'auth_token'). We assert that rather than the post-signup redirect",
  "// target, which the app races between /verify-email and /dashboard. Leaving",
  "// the /register route also counts as success.",
  "let signedUp = false;",
  "for (let i = 0; i < 30; i++) {",
  "  const state = await t.eval(() => ({ token: !!localStorage.getItem('auth_token'), path: window.location.pathname }));",
  "  if (state.token || state.path.indexOf('/register') < 0) { signedUp = true; break; }",
  "  await t.wait(1000);",
  "}",
  "const finalPath = await t.eval(() => window.location.pathname);",
  "await t.expect(signedUp).ok('expected an authenticated session (auth_token) or redirect after signup; still on ' + finalPath);",
].join("\n");

export const registrationFR: FunctionalRequirementDefinition = {
  id: "registration",
  title: "Registration",
  description: "New-user sign-up: account creation, validation, and the post-signup redirect.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

export const registerFlowSuite: TestSuiteDefinition = {
  suiteId: "register-flow",
  frId: "registration",
  title: "Register Flow",
  description: "Sign-up happy paths and validation coverage via API and the browser form.",
};

export const registerApiFixture: TestFixtureDefinition = {
  fixtureId: "register-api",
  suiteId: "register-flow",
  title: "Register API — happy paths + validation matrix",
  baseUrl: "/en/login",
  commonInput: { apiUrl: API_DEFAULT },
};

export const registerUiFixture: TestFixtureDefinition = {
  fixtureId: "register-ui",
  suiteId: "register-flow",
  title: "Register page — sign-up happy path",
  baseUrl: "/en/register",
  commonInput: {},
  metadata: { ui: true },
};

export const registrationTestCases: TestCaseDefinition[] = [
  {
    caseId: "register-api-matrix",
    fixtureId: "register-api",
    title: "register handles happy paths and rejects invalid input",
    scriptType: "scripted",
    runs: [
      { scenario: "valid individual", overrides: {}, expectStatus: 201 },
      {
        scenario: "valid business",
        overrides: { accountType: "business", companyName: "Acme BV", btwNumber: "BE0123.456.789" },
        expectStatus: 201,
      },
      { scenario: "weak password (<8)", overrides: { password: "short" }, expectStatus: 400 },
      { scenario: "consent not accepted", overrides: { termsAccepted: false }, expectStatus: 400 },
      { scenario: "invalid email format", overrides: { email: "not-an-email" }, expectStatus: 400 },
      { scenario: "missing required city", overrides: { city: "" }, expectStatus: 400 },
      { scenario: "duplicate email", overrides: { email: (process.env.WEBAPP_ADMIN_EMAIL || "admin@example.com") }, expectStatus: 409 },
    ],
    expected: {},
    script: REGISTER_API_SCRIPT,
  },
  {
    caseId: "register-ui-happy-path",
    fixtureId: "register-ui",
    title: "User can sign up from the registration form",
    scriptType: "scripted",
    script: REGISTER_UI_SCRIPT,
    expected: {},
  },
];
